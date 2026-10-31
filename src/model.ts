/**
 * defineModel - Drizzle-backed models with CRUD and dirty tracking
 */
import {
	type Column,
	eq,
	getTableColumns,
	getTableName,
	type SQL,
	type Table,
} from "drizzle-orm";
import { ModelNotFoundError } from "./errors.js";
import type {
	AnyDatabase,
	DefineModelOptions,
	Model,
	ModelInstance,
	PrimaryKeyColumn,
	QueryOptions,
	TableFor,
} from "./types.js";

type Row = Record<string, unknown>;

/** Instance method names; a column key may not shadow them. */
const RESERVED = new Set([
	"isDirty",
	"getDirty",
	"save",
	"delete",
	"refresh",
	"toJSON",
	"constructor",
]);

interface InstanceState {
	attributes: Row;
	original: Row;
}

const states = new WeakMap<object, InstanceState>();

function stateOf(instance: object): InstanceState {
	return states.get(instance) as InstanceState;
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
	next: (value: T) => R,
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
 * });
 * const db = drizzle(new Database("app.sqlite"));
 * const User = defineModel(db, users);
 *
 * const user = await User.create({ name: "Ada" }); // user.id assigned by SQLite
 * user.name = "Ada Lovelace";
 * await user.save(); // UPDATE users SET name = ? WHERE id = ?
 * ```
 */
export function defineModel<
	TDb extends AnyDatabase,
	TTable extends TableFor<TDb>,
	TPk extends Column = PrimaryKeyColumn<TTable>,
>(
	db: TDb,
	table: TTable,
	options: DefineModelOptions<TPk> = {},
): Model<TTable, TDb, TPk["_"]["data"]> {
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

	type Instance = ModelInstance<TTable, TDb>;
	const runner = (opts?: QueryOptions): Runner => opts?.tx ?? db;
	const byKey = (id: unknown): SQL => eq(pkColumn, id);

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
			return settle(opts, () => {
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
		},
		delete(this: object, opts?: QueryOptions) {
			return settle(opts, () => {
				const { original } = stateOf(this);
				const query = runner(opts)
					.delete(table)
					.where(byKey(original[pkKey]))
					.returning();
				return then(execute(query), () => undefined);
			});
		},
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
			return { ...stateOf(this).attributes };
		},
	};

	function reload<T extends object>(instance: T, rows: Row[], id: unknown): T {
		const [row] = rows;
		if (!row) throw new ModelNotFoundError(tableName, id);
		const state = stateOf(instance);
		state.attributes = { ...row };
		state.original = snapshot(row);
		return instance;
	}

	function hydrate(row: Row): Instance {
		const instance = Object.create(prototype) as object;
		states.set(instance, { attributes: { ...row }, original: snapshot(row) });
		for (const key of columnKeys) {
			Object.defineProperty(instance, key, {
				enumerable: true,
				get: () => stateOf(instance).attributes[key],
				set: (value: unknown) => {
					stateOf(instance).attributes[key] = value;
				},
			});
		}
		return Object.seal(instance) as Instance;
	}

	const hydrateAll = (rows: Row[]) => rows.map(hydrate);
	const selectWhere = (
		opts: QueryOptions | undefined,
		condition: SQL | undefined,
	) => runner(opts).select().from(table).where(condition);

	const model: Model<TTable, TDb, TPk["_"]["data"]> = {
		db,
		table,
		tableName,
		find(id, opts) {
			return settle(opts, () =>
				then(execute(selectWhere(opts, byKey(id)).limit(1)), (rows) =>
					rows[0] ? hydrate(rows[0]) : null,
				),
			);
		},
		findOrFail(id, opts) {
			return settle(opts, () =>
				then(execute(selectWhere(opts, byKey(id)).limit(1)), (rows) => {
					if (!rows[0]) throw new ModelNotFoundError(tableName, id);
					return hydrate(rows[0]);
				}),
			);
		},
		where(condition) {
			return {
				get: (opts) =>
					settle(opts, () =>
						then(execute(selectWhere(opts, condition)), hydrateAll),
					),
				first: (opts) =>
					settle(opts, () =>
						then(execute(selectWhere(opts, condition).limit(1)), (rows) =>
							rows[0] ? hydrate(rows[0]) : null,
						),
					),
			};
		},
		create(values, opts) {
			return settle(opts, () => {
				const input = { ...(values as Row) };
				if (input[pkKey] === "") {
					throw new Error(
						`Primary key "${pkKey}" must not be an empty string; omit it to use the table's default`,
					);
				}
				const query = runner(opts).insert(table).values(input).returning();
				return then(execute(query), (rows) => hydrate(rows[0] as Row));
			});
		},
		query(opts) {
			return runner(opts).select().from(table);
		},
		hydrate: (row) => hydrate(row as Row),
	};
	return model;
}
