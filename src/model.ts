/**
 * defineModel - Drizzle-backed models with CRUD, dirty tracking and events
 */
import {
	and,
	type Column,
	eq,
	getTableColumns,
	getTableName,
	getTableUniqueName,
	inArray,
	is,
	isNotNull,
	isNull,
	Many,
	normalizeRelation,
	or,
	type Relation,
	type SQL,
	type Table,
	type TablesRelationalConfig,
} from "drizzle-orm";
import { ModelNotFoundError } from "./errors.js";
import type {
	AnyDatabase,
	CheckReservedColumns,
	DefineModelOptions,
	Model,
	ModelEvent,
	ModelInstance,
	ModelListener,
	ModelQuery,
	PrimaryKeyColumn,
	QueryOptions,
	ReservedColumnName,
	ReservedScopeName,
	RowOf,
	ScopeConstraint,
	ScopeMap,
	ScopesOf,
	TableFor,
} from "./types.js";

type Row = Record<string, unknown>;

/** Instance method names; a column key may not shadow them. */
const RESERVED = new Set<string>([
	"isDirty",
	"getDirty",
	"save",
	"delete",
	"refresh",
	"toJSON",
	"restore",
	"trashed",
	"forceDelete",
	"constructor",
] satisfies ReservedColumnName[]);

/** Model and query member names; a scope may not shadow them. */
const RESERVED_SCOPES = new Set<string>([
	"db",
	"table",
	"tableName",
	"find",
	"findOrFail",
	"where",
	"create",
	"query",
	"hydrate",
	"on",
	"get",
	"first",
	"update",
	"delete",
	"restore",
	"forceDelete",
	"withTrashed",
	"onlyTrashed",
	"with",
	"then",
	"constructor",
] satisfies ReservedScopeName[]);

/** Key of the soft-delete column. */
const DELETED_AT = "deletedAt";

/** Which soft-deleted rows a query sees. */
type Trashed = "without" | "with" | "only";

interface QueryState {
	conditions: SQL[];
	trashed: Trashed;
	eager: Eager[];
}

/** What a model lends to another model's `with()`. */
interface EagerSource {
	table: Table;
	tableName: string;
	columns: Record<string, Column>;
	/** The model's instances matching `condition` (and its soft-delete filter). */
	load(condition: SQL, opts: QueryOptions | undefined): Row[] | Promise<Row[]>;
}

/** Key of a model's {@link EagerSource}. */
const EAGER = Symbol("bunary.orm.eager");

/** A relation to load, resolved by `with()`. */
interface Eager {
	name: string;
	many: boolean;
	/** Keys of the relation's columns on this table. */
	fields: string[];
	/** The related table's columns they match, and their keys. */
	references: Column[];
	referenceKeys: string[];
	source: EagerSource;
}

const EVENTS: ModelEvent[] = ["creating", "updating", "saving", "deleting"];

interface InstanceState {
	attributes: Row;
	original: Row;
	/** Relations loaded with `with()`. */
	relations: Row;
}

const states = new WeakMap<object, InstanceState>();

function stateOf(instance: object): InstanceState {
	return states.get(instance) as InstanceState;
}

/** A string key for a tuple of column values; `undefined` if any is null. */
function tupleKey(values: unknown[]): string | undefined {
	if (values.some((value) => value == null)) return undefined;
	return values
		.map((value) =>
			value instanceof Date
				? `date:${value.getTime()}`
				: `${typeof value}:${String(value)}`,
		)
		.join("\u0000");
}

const keyOfColumn = (columns: Record<string, Column>, column: Column) =>
	Object.keys(columns).find((key) => columns[key] === column) as string;

function toJson(instance: unknown): unknown {
	return (instance as { toJSON(): unknown }).toJSON();
}

function snapshot(row: Row): Row {
	return structuredClone(row);
}

/** Dates, JSON values and binary data compare by content. */
function sameValue(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (
		typeof a === "object" &&
		a !== null &&
		typeof b === "object" &&
		b !== null
	) {
		return Bun.deepEquals(a, b, true);
	}
	return false;
}

// Drizzle's query builders are dialect-specific and cannot be called through
// a union of databases, so they are untyped here; the public types in
// types.ts stay precise.
// biome-ignore lint/suspicious/noExplicitAny: see above
type Runner = any;

/**
 * Execute a query builder now and return its rows.
 *
 * SQLite builders expose `all()`, which on bun:sqlite runs synchronously; this
 * matters because bun:sqlite transactions are synchronous, so the query must
 * be issued before the transaction callback returns. Postgres builders expose
 * `execute()`.
 */
function execute(builder: Runner): Row[] | Promise<Row[]> {
	return typeof builder.all === "function" ? builder.all() : builder.execute();
}

function then<T, R>(
	value: T | Promise<T>,
	next: (value: T) => R | Promise<R>,
): R | Promise<R> {
	return value instanceof Promise ? value.then(next) : next(value);
}

/**
 * Run `body` and return its result as a promise. Errors become a rejected
 * promise, except with `{ tx }`, where they are thrown so that a synchronous
 * transaction callback sees them and rolls back.
 */
function settle<T>(
	options: QueryOptions | undefined,
	body: () => T | Promise<T>,
): Promise<T> {
	try {
		return Promise.resolve(body());
	} catch (error) {
		if (options?.tx) throw error;
		return Promise.reject(error);
	}
}

type Listener = ModelListener<unknown>;

/**
 * Run `listeners` in order, awaiting any that return a promise, and stop at
 * the first that returns `false`. Stays synchronous while the listeners do,
 * so queries inside a bun:sqlite transaction are still issued in time.
 */
function fire(
	listeners: readonly Listener[],
	target: unknown,
	from = 0,
): boolean | Promise<boolean> {
	for (let i = from; i < listeners.length; i++) {
		const result = (listeners[i] as Listener)(target);
		if (result instanceof Promise) {
			return result.then((value) =>
				value === false ? false : fire(listeners, target, i + 1),
			);
		}
		if (result === false) return false;
	}
	return true;
}

function resolvePrimaryKey(
	table: Table,
	columns: Record<string, Column>,
	option: Column | undefined,
): string {
	const name = getTableName(table);
	const entries = Object.entries(columns);
	if (option) {
		const match = entries.find(([, column]) => column === option);
		if (!match) {
			throw new Error(
				`defineModel: primaryKey option is not a column of "${name}"`,
			);
		}
		return match[0];
	}
	const keys = entries.filter(([, column]) => column.primary);
	if (keys.length !== 1 || !keys[0]) {
		throw new Error(
			`defineModel: table "${name}" has no single-column primary key; pass { primaryKey: table.column }`,
		);
	}
	return keys[0][0];
}

/**
 * Define a model for a Drizzle table.
 *
 * Row types are inferred from the table. The primary key is the table's
 * `.primaryKey()` column unless `options.primaryKey` names another; the orm
 * never generates key values, the table's own defaults do.
 *
 * @example
 * ```ts
 * const users = sqliteTable("users", {
 *   id: integer().primaryKey({ autoIncrement: true }),
 *   name: text().notNull(),
 *   password: text().notNull(),
 *   active: integer({ mode: "boolean" }).notNull().default(true),
 *   deletedAt: integer({ mode: "timestamp_ms" }),
 * });
 * const db = drizzle(new Database("app.sqlite"));
 * const User = defineModel(db, users, {
 *   hidden: ["password"],
 *   softDeletes: true,
 *   scopes: { active: (q) => q.where(eq(users.active, true)) },
 *   events: { creating: (values) => void (values.password = hash(values.password)) },
 * });
 *
 * const user = await User.create({ name: "Ada", password: "secret" });
 * if (user) {
 *   user.name = "Ada Lovelace";
 *   await user.save(); // UPDATE users SET name = ? WHERE id = ?
 * }
 * const active = await User.active().get(); // not soft-deleted, active
 * ```
 */
export function defineModel<
	TDb extends AnyDatabase,
	TTable extends TableFor<TDb>,
	TPk extends Column = PrimaryKeyColumn<TTable>,
	const THidden extends keyof RowOf<TTable> & string = never,
	TSoft extends boolean = false,
	// Defaulting to the constraint (not to `NoScopes`) keeps scope parameters
	// contextually typed; `ScopesOf` turns the uninferred case into no scopes.
	TScopes extends ScopeConstraint<
		TTable,
		TDb,
		THidden,
		TSoft
	> = ScopeConstraint<TTable, TDb, THidden, TSoft>,
>(
	db: TDb,
	table: TTable & CheckReservedColumns<TTable>,
	options: DefineModelOptions<TTable, TDb, TPk, THidden, TSoft, TScopes> = {},
): Model<TTable, TDb, TPk["_"]["data"], THidden, TSoft, ScopesOf<TScopes>> {
	const columns = getTableColumns(table as Table) as Record<string, Column>;
	const tableName = getTableName(table as Table);
	for (const key of Object.keys(columns)) {
		if (RESERVED.has(key)) {
			throw new Error(
				`defineModel: column "${key}" of "${tableName}" is reserved for a model method; rename its JS key`,
			);
		}
	}
	const pkKey = resolvePrimaryKey(table as Table, columns, options.primaryKey);
	const pkColumn = columns[pkKey] as Column;
	const columnKeys = Object.keys(columns);
	const hidden = new Set<string>(options.hidden);
	for (const key of hidden) {
		if (!Object.hasOwn(columns, key)) {
			throw new Error(
				`defineModel: hidden column "${key}" is not a column of "${tableName}"`,
			);
		}
	}
	const soft = options.softDeletes === true;
	const deletedColumn = columns[DELETED_AT] as Column;
	if (soft && !Object.hasOwn(columns, DELETED_AT)) {
		throw new Error(
			`defineModel: softDeletes requires a "${DELETED_AT}" column on "${tableName}"`,
		);
	}
	const scopes = Object.entries((options.scopes ?? {}) as ScopeMap);
	for (const [name, scope] of scopes) {
		if (RESERVED_SCOPES.has(name)) {
			throw new Error(
				`defineModel: scope "${name}" of "${tableName}" is reserved; rename it`,
			);
		}
		if (typeof scope !== "function") {
			throw new Error(
				`defineModel: scope "${name}" of "${tableName}" is not a function`,
			);
		}
	}
	const listeners = {} as Record<ModelEvent, Listener[]>;
	for (const event of EVENTS) {
		const given = options.events?.[event];
		listeners[event] = (
			given === undefined ? [] : Array.isArray(given) ? [...given] : [given]
		) as Listener[];
	}

	type Instance = ModelInstance<TTable, TDb, THidden, TSoft>;
	type Query = ModelQuery<TTable, TDb, THidden, TSoft, TScopes>;
	const runner = (opts?: QueryOptions): Runner => opts?.tx ?? db;
	const byKey = (id: unknown): SQL => eq(pkColumn, id);

	/** Fire `deleting`, then delete the instance's row for real. */
	function forceDelete(this: object, opts?: QueryOptions) {
		return settle(opts, () =>
			then(fire(listeners.deleting, this), (ok) => {
				if (!ok) return false;
				const { original } = stateOf(this);
				const query = runner(opts)
					.delete(table)
					.where(byKey(original[pkKey]))
					.returning();
				return then(execute(query), () => true);
			}),
		);
	}

	/** Fire `deleting`, then set (only) the instance's `deletedAt`. */
	function softDelete(this: object, opts?: QueryOptions) {
		return settle(opts, () =>
			then(fire(listeners.deleting, this), (ok) => {
				if (!ok) return false;
				const state = stateOf(this);
				const query = runner(opts)
					.update(table)
					.set({ [DELETED_AT]: new Date() })
					.where(byKey(state.original[pkKey]))
					.returning({ value: deletedColumn });
				return then(execute(query), (rows) => {
					const [row] = rows;
					if (row) {
						state.attributes[DELETED_AT] = row.value;
						state.original[DELETED_AT] = snapshot(row).value;
					}
					return true;
				});
			}),
		);
	}

	const prototype = {
		isDirty(this: object, key?: string): boolean {
			const { attributes, original } = stateOf(this);
			const keys = key === undefined ? columnKeys : [key];
			return keys.some((k) => !sameValue(attributes[k], original[k]));
		},
		getDirty(this: object): Row {
			const { attributes, original } = stateOf(this);
			const dirty: Row = {};
			for (const key of columnKeys) {
				if (!sameValue(attributes[key], original[key])) {
					dirty[key] = attributes[key];
				}
			}
			return dirty;
		},
		save(this: Instance, opts?: QueryOptions) {
			return settle(opts, () =>
				then(fire(listeners.saving, this), (ok) => {
					if (!ok) return false;
					if (!this.isDirty()) return this;
					return then(fire(listeners.updating, this), (ok) => {
						if (!ok) return false;
						// Listeners may have changed (or reverted) attributes.
						const dirty = this.getDirty();
						if (Object.keys(dirty).length === 0) return this;
						const state = stateOf(this);
						const query = runner(opts)
							.update(table)
							.set(dirty)
							.where(byKey(state.original[pkKey]))
							.returning();
						return then(execute(query), (rows) =>
							reload(this, rows, state.original[pkKey]),
						);
					});
				}),
			);
		},
		delete: soft ? softDelete : forceDelete,
		refresh(this: Instance, opts?: QueryOptions) {
			return settle(opts, () => {
				const id = stateOf(this).original[pkKey];
				const query = runner(opts)
					.select()
					.from(table)
					.where(byKey(id))
					.limit(1);
				return then(execute(query), (rows) => reload(this, rows, id));
			});
		},
		toJSON(this: object): Row {
			const { attributes, relations } = stateOf(this);
			const json: Row = {};
			for (const [key, value] of Object.entries(attributes)) {
				if (!hidden.has(key)) json[key] = value;
			}
			for (const [key, value] of Object.entries(relations)) {
				json[key] = Array.isArray(value)
					? value.map(toJson)
					: value === null
						? null
						: toJson(value);
			}
			return json;
		},
	};
	if (soft) {
		Object.assign(prototype, {
			trashed(this: object): boolean {
				return stateOf(this).attributes[DELETED_AT] != null;
			},
			restore(this: Instance, opts?: QueryOptions) {
				stateOf(this).attributes[DELETED_AT] = null;
				return this.save(opts);
			},
			forceDelete,
		});
	}

	function reload<T extends object>(instance: T, rows: Row[], id: unknown): T {
		const [row] = rows;
		if (!row) throw new ModelNotFoundError(tableName, id);
		const state = stateOf(instance);
		state.attributes = { ...row };
		state.original = snapshot(row);
		return instance;
	}

	function hydrate(row: Row, relations: Row = {}): Instance {
		const instance = Object.create(prototype) as object;
		states.set(instance, {
			attributes: { ...row },
			original: snapshot(row),
			relations,
		});
		for (const key of columnKeys) {
			Object.defineProperty(instance, key, {
				enumerable: true,
				get: () => stateOf(instance).attributes[key],
				set: (value: unknown) => {
					stateOf(instance).attributes[key] = value;
				},
			});
		}
		for (const [key, value] of Object.entries(relations)) {
			Object.defineProperty(instance, key, { enumerable: true, value });
		}
		return Object.seal(instance) as Instance;
	}

	const hydrateAll = (rows: Row[]) => rows.map((row) => hydrate(row));
	const selectWhere = (
		opts: QueryOptions | undefined,
		condition: SQL | undefined,
	) => runner(opts).select().from(table).where(condition);

	/** The query's conditions plus its soft-delete filter, combined by AND. */
	function filter({ conditions, trashed }: QueryState): SQL | undefined {
		if (!soft || trashed === "with") return and(...conditions);
		const deleted =
			trashed === "only" ? isNotNull(deletedColumn) : isNull(deletedColumn);
		return and(...conditions, deleted);
	}

	/** `UPDATE … SET values WHERE condition`, resolving to the row count. */
	function updateWhere(
		values: Row,
		condition: SQL | undefined,
		opts: QueryOptions | undefined,
	) {
		return settle(opts, () => {
			const query = runner(opts)
				.update(table)
				.set(values)
				.where(condition)
				.returning({ key: pkColumn });
			return then(execute(query), (rows) => rows.length);
		});
	}

	/** `DELETE … WHERE condition`, resolving to the row count. */
	function deleteWhere(condition: SQL | undefined, opts?: QueryOptions) {
		return settle(opts, () => {
			const query = runner(opts)
				.delete(table)
				.where(condition)
				.returning({ key: pkColumn });
			return then(execute(query), (rows) => rows.length);
		});
	}

	/**
	 * Resolve `with()`'s relation `name` from the Drizzle relations in the
	 * db's schema, checking that `related` is a model for its table.
	 */
	function resolveRelation(name: string, related: unknown): Eager {
		const { schema, tableNamesMap } = (db as Runner)._ as {
			schema: TablesRelationalConfig | undefined;
			tableNamesMap: Record<string, string>;
		};
		const tsName = tableNamesMap[getTableUniqueName(table as Table)];
		const config = schema && tsName ? schema[tsName] : undefined;
		const relation: Relation | undefined =
			config && Object.hasOwn(config.relations, name)
				? config.relations[name]
				: undefined;
		if (!schema || !relation) {
			throw new Error(
				`defineModel: "${tableName}" has no relation "${name}"; define it with relations() and pass it in drizzle({ schema })`,
			);
		}
		if (RESERVED.has(name) || Object.hasOwn(columns, name)) {
			throw new Error(
				`defineModel: relation "${name}" of "${tableName}" has the name of a column or model method; rename it`,
			);
		}
		const target = getTableName(relation.referencedTable);
		const source = (related as { [EAGER]?: EagerSource } | null)?.[EAGER];
		if (!source) {
			throw new Error(
				`defineModel: relation "${name}" of "${tableName}" needs a model for "${target}"`,
			);
		}
		if (source.table !== relation.referencedTable) {
			throw new Error(
				`defineModel: relation "${name}" of "${tableName}" needs a model for "${target}", got one for "${source.tableName}"`,
			);
		}
		const { fields, references } = normalizeRelation(
			schema,
			tableNamesMap,
			relation,
		);
		return {
			name,
			many: is(relation, Many),
			fields: fields.map((column) => keyOfColumn(columns, column)),
			references,
			referenceKeys: references.map((column) =>
				keyOfColumn(source.columns, column),
			),
			source,
		};
	}

	/**
	 * Load `eager`'s relations for `rows`, one query per relation, and
	 * return each row's relations (in the order of `rows`).
	 */
	function loadRelations(
		rows: Row[],
		eager: readonly Eager[],
		opts: QueryOptions | undefined,
		index = 0,
		loaded: Row[] = rows.map(() => ({})),
	): Row[] | Promise<Row[]> {
		const relation = eager[index];
		if (!relation || rows.length === 0) return loaded;
		const parentKeys = rows.map((row) =>
			tupleKey(relation.fields.map((key) => row[key])),
		);
		const tuples = new Map<string, unknown[]>();
		rows.forEach((row, i) => {
			const key = parentKeys[i];
			if (key !== undefined && !tuples.has(key)) {
				tuples.set(
					key,
					relation.fields.map((field) => row[field]),
				);
			}
		});
		const assign = (related: Row[]) => {
			const groups = new Map<string, Row[]>();
			for (const instance of related) {
				const key = tupleKey(
					relation.referenceKeys.map((field) => instance[field]),
				) as string;
				groups.set(key, [...(groups.get(key) ?? []), instance]);
			}
			parentKeys.forEach((key, i) => {
				const group = (key === undefined ? undefined : groups.get(key)) ?? [];
				(loaded[i] as Row)[relation.name] = relation.many
					? [...group]
					: (group[0] ?? null);
			});
			return loadRelations(rows, eager, opts, index + 1, loaded);
		};
		if (tuples.size === 0) return assign([]);
		const values = [...tuples.values()];
		const [reference] = relation.references as [Column];
		const condition =
			relation.references.length === 1
				? inArray(
						reference,
						values.map(([value]) => value),
					)
				: (or(
						...values.map((tuple) =>
							and(
								...relation.references.map((column, i) => eq(column, tuple[i])),
							),
						),
					) as SQL);
		return then(relation.source.load(condition, opts), assign);
	}

	/** Hydrate `rows` with the query's eager-loaded relations. */
	function hydrateLoaded(
		rows: Row[],
		eager: readonly Eager[],
		opts: QueryOptions | undefined,
	) {
		return then(loadRelations(rows, eager, opts), (loaded) =>
			rows.map((row, i) => hydrate(row, loaded[i])),
		);
	}

	const queries = new WeakSet<object>();
	const initial: QueryState = {
		conditions: [],
		trashed: "without",
		eager: [],
	};

	/** An immutable query: every chained call returns a new one. */
	function makeQuery(state: QueryState): Query {
		const next = (change: Partial<QueryState>) =>
			makeQuery({ ...state, ...change });
		const select = (opts: QueryOptions | undefined, extra?: SQL) =>
			selectWhere(
				opts,
				filter(
					extra
						? { ...state, conditions: [...state.conditions, extra] }
						: state,
				),
			);
		const findRows = (id: unknown, opts: QueryOptions | undefined) =>
			then(execute(select(opts, byKey(id)).limit(1)), (rows) =>
				hydrateLoaded(rows, state.eager, opts),
			);
		const query: Record<string, unknown> = {
			where: (condition: SQL | undefined) =>
				next({
					conditions: condition
						? [...state.conditions, condition]
						: state.conditions,
				}),
			with: (relations: Record<string, unknown>) => {
				const added = Object.entries(relations).map(([name, related]) =>
					resolveRelation(name, related),
				);
				const names = new Set(added.map((relation) => relation.name));
				return next({
					eager: [
						...state.eager.filter((relation) => !names.has(relation.name)),
						...added,
					],
				});
			},
			get: (opts?: QueryOptions) =>
				settle(opts, () =>
					then(execute(select(opts)), (rows) =>
						hydrateLoaded(rows, state.eager, opts),
					),
				),
			first: (opts?: QueryOptions) =>
				settle(opts, () =>
					then(execute(select(opts).limit(1)), (rows) =>
						then(
							hydrateLoaded(rows, state.eager, opts),
							(list) => list[0] ?? null,
						),
					),
				),
			find: (id: unknown, opts?: QueryOptions) =>
				settle(opts, () => then(findRows(id, opts), (list) => list[0] ?? null)),
			findOrFail: (id: unknown, opts?: QueryOptions) =>
				settle(opts, () =>
					then(findRows(id, opts), (list) => {
						if (!list[0]) throw new ModelNotFoundError(tableName, id);
						return list[0];
					}),
				),
			update: (values: Row, opts?: QueryOptions) =>
				updateWhere(values, filter(state), opts),
			delete: (opts?: QueryOptions) =>
				soft
					? updateWhere({ [DELETED_AT]: new Date() }, filter(state), opts)
					: deleteWhere(filter(state), opts),
		};
		if (soft) {
			Object.assign(query, {
				withTrashed: () => next({ trashed: "with" }),
				onlyTrashed: () => next({ trashed: "only" }),
				restore: (opts?: QueryOptions) =>
					updateWhere(
						{ [DELETED_AT]: null },
						filter({ ...state, trashed: "only" }),
						opts,
					),
				forceDelete: (opts?: QueryOptions) => deleteWhere(filter(state), opts),
			});
		}
		for (const [name, scope] of scopes) {
			query[name] = (...args: unknown[]) => {
				const result = scope(query, ...args);
				if (typeof result !== "object" || !queries.has(result)) {
					throw new Error(
						`defineModel: scope "${name}" of "${tableName}" must return the query it was given (or one chained from it)`,
					);
				}
				return result;
			};
		}
		queries.add(query);
		return query as Query;
	}

	const model: Record<string, unknown> = {
		db,
		table,
		tableName,
		find: (id: unknown, opts?: QueryOptions) =>
			makeQuery(initial).find(id, opts),
		findOrFail: (id: unknown, opts?: QueryOptions) =>
			makeQuery(initial).findOrFail(id, opts),
		where: (condition: SQL | undefined) => makeQuery(initial).where(condition),
		with: (relations: Record<string, unknown>) =>
			makeQuery(initial).with(relations as never),
		create(values: Row, opts?: QueryOptions) {
			return settle(opts, () => {
				const input = { ...values };
				return then(fire(listeners.saving, input), (ok) => {
					if (!ok) return false;
					return then(fire(listeners.creating, input), (ok) => {
						if (!ok) return false;
						if (input[pkKey] === "") {
							throw new Error(
								`Primary key "${pkKey}" must not be an empty string; omit it to use the table's default`,
							);
						}
						const query = runner(opts).insert(table).values(input).returning();
						return then(execute(query), (rows) => hydrate(rows[0] as Row));
					});
				});
			});
		},
		query(opts?: QueryOptions) {
			return runner(opts).select().from(table);
		},
		hydrate: (row: Row) => hydrate(row),
		on(event: ModelEvent, listener: Listener) {
			const list = listeners[event];
			list.push(listener);
			return () => {
				const index = list.indexOf(listener);
				if (index !== -1) list.splice(index, 1);
			};
		},
	};
	if (soft) {
		model.withTrashed = () => makeQuery({ ...initial, trashed: "with" });
		model.onlyTrashed = () => makeQuery({ ...initial, trashed: "only" });
	}
	for (const [name] of scopes) {
		model[name] = (...args: unknown[]) => {
			const query = makeQuery(initial) as unknown as Record<
				string,
				(...args: unknown[]) => unknown
			>;
			return query[name]?.(...args);
		};
	}
	const eagerSource: EagerSource = {
		table: table as Table,
		tableName,
		columns,
		load: (condition, opts) =>
			then(
				execute(
					selectWhere(opts, filter({ ...initial, conditions: [condition] })),
				),
				hydrateAll,
			),
	};
	Object.defineProperty(model, EAGER, { value: eagerSource });
	return model as unknown as Model<
		TTable,
		TDb,
		TPk["_"]["data"],
		THidden,
		TSoft,
		ScopesOf<TScopes>
	>;
}
