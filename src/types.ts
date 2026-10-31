/**
 * @bunary/orm - Type Definitions
 */
// biome-ignore-all lint/suspicious/noExplicitAny: Drizzle database and table generics are matched by dialect only
import type {
	Column,
	InferInsertModel,
	InferSelectModel,
	SQL,
	Table,
} from "drizzle-orm";
import type { PgDatabase, PgSelectBase, PgTable } from "drizzle-orm/pg-core";
import type {
	BaseSQLiteDatabase,
	SQLiteSelectBase,
	SQLiteTable,
} from "drizzle-orm/sqlite-core";

/**
 * A Drizzle database (or transaction) for a supported dialect:
 * SQLite (e.g. `drizzle-orm/bun-sqlite`) or Postgres (e.g. `drizzle-orm/bun-sql`).
 */
export type AnyDatabase =
	| BaseSQLiteDatabase<any, any, any, any>
	| PgDatabase<any, any, any>;

/** A Drizzle table belonging to the dialect of `TDb`. */
export type TableFor<TDb extends AnyDatabase> =
	TDb extends BaseSQLiteDatabase<any, any, any, any> ? SQLiteTable : PgTable;

/**
 * A transaction handle (or database) usable in place of a model's `db`:
 * any database or transaction of the same dialect.
 */
export type TransactionFor<TDb extends AnyDatabase> =
	TDb extends BaseSQLiteDatabase<infer TKind, infer TRun, any, any>
		? BaseSQLiteDatabase<TKind, TRun, any, any>
		: PgDatabase<any, any, any>;

/** Options accepted by every model method that runs a query. */
export interface QueryOptions<TDb extends AnyDatabase = AnyDatabase> {
	/**
	 * Run the query on this Drizzle transaction instead of the model's `db`.
	 * With `tx`, errors are thrown synchronously instead of being returned as
	 * a rejected promise, so a synchronous bun:sqlite transaction rolls back.
	 */
	tx?: TransactionFor<TDb>;
}

/** Options for `defineModel()`. */
export interface DefineModelOptions<
	TTable extends Table = Table,
	TDb extends AnyDatabase = AnyDatabase,
	TPk extends Column = Column,
	THidden extends keyof RowOf<TTable> & string = never,
	TSoft extends boolean = false,
	TScopes extends ScopeMap = NoScopes,
> {
	/**
	 * Primary key column. Defaults to the table's single `.primaryKey()`
	 * column; required for tables whose key is declared some other way.
	 */
	primaryKey?: TPk;
	/**
	 * Columns left out of `toJSON()` (and so of `JSON.stringify`). They are
	 * still loaded, readable, writable and saved.
	 */
	hidden?: readonly THidden[];
	/**
	 * Listeners per event, run before the listeners added with `Model.on()`.
	 * See {@link ModelEvent}.
	 */
	events?: ModelListeners<TTable, TDb, THidden, TSoft>;
	/**
	 * Soft deletes: `delete()` sets the `deletedAt` column instead of removing
	 * the row, and queries leave out rows whose `deletedAt` is set. The table
	 * must have a nullable `Date` column with the JS key `deletedAt`.
	 */
	softDeletes?: SupportsSoftDeletes<TTable> extends true
		? TSoft
		: false | SoftDeletesRequiresDeletedAt;
	/**
	 * Named scopes: `{ active: (q) => q.where(eq(users.active, true)) }`
	 * makes `Model.active()` and `query.active()`. A scope gets the query
	 * (and any arguments it is called with) and returns a query.
	 */
	scopes?: TScopes;
}

/** The type error shown for `softDeletes: true` on an unsuitable table. */
export type SoftDeletesRequiresDeletedAt =
	"softDeletes requires a nullable Date column with the JS key deletedAt";

/** `true` when `TTable` has a nullable `Date` column keyed `deletedAt`. */
export type SupportsSoftDeletes<TTable extends Table> =
	RowOf<TTable> extends { deletedAt: infer D }
		? [D] extends [Date | null]
			? null extends D
				? true
				: false
			: false
		: false;

/**
 * A named scope: receives the query (plus the arguments the scope is called
 * with) and returns a query, usually `query.where(...)`.
 */
export type Scope<TQuery = any> = (query: TQuery, ...args: any[]) => TQuery;

/** The `scopes` option of `defineModel()`. */
export type ScopeMap<TQuery = any> = Record<string, Scope<TQuery>>;

/** No scopes. */
export type NoScopes = Record<never, never>;

/** The methods a scope map adds to a model and its queries. */
export type ScopeMethods<TScopes extends ScopeMap, TQuery> = {
	[K in keyof TScopes]: TScopes[K] extends (
		query: any,
		...args: infer TArgs
	) => any
		? (...args: TArgs) => TQuery
		: never;
};

/**
 * Names a scope may not have: the model's and the queries' own members
 * (and `then`, so a query is never mistaken for a promise).
 */
export type ReservedScopeName =
	| "db"
	| "table"
	| "tableName"
	| "find"
	| "findOrFail"
	| "where"
	| "create"
	| "query"
	| "hydrate"
	| "on"
	| "get"
	| "first"
	| "update"
	| "delete"
	| "restore"
	| "forceDelete"
	| "withTrashed"
	| "onlyTrashed"
	| "then"
	| "constructor";

/**
 * Part of the constraint on the `scopes` option: a scope named after a
 * reserved name fails to type-check, naming the scope.
 */
export type CheckReservedScopes = {
	[K in Exclude<
		ReservedScopeName,
		"constructor"
	>]?: `scope "${K}" is reserved; rename it`;
};

/** The constraint `defineModel()` puts on its `scopes` option. */
export type ScopeConstraint<
	TTable extends Table,
	TDb extends AnyDatabase,
	THidden extends string,
	TSoft extends boolean,
> = CheckReservedScopes & ScopeMap<ModelQuery<TTable, TDb, THidden, TSoft>>;

/** The scopes inferred from a `scopes` option: none when it was not given. */
export type ScopesOf<TScopes> = string extends keyof TScopes
	? NoScopes
	: TScopes;

/**
 * Instance method names (including the soft-delete ones, reserved on every
 * model). A column whose JS key is one of these is a type
 * error in `defineModel()`, and `defineModel()` throws for it at runtime.
 */
export type ReservedColumnName =
	| "isDirty"
	| "getDirty"
	| "save"
	| "delete"
	| "refresh"
	| "toJSON"
	| "restore"
	| "trashed"
	| "forceDelete"
	| "constructor";

/**
 * `unknown` when no column key of `TTable` is reserved; otherwise an object
 * type that makes the table argument of `defineModel()` fail to type-check,
 * naming the column.
 */
export type CheckReservedColumns<TTable extends Table> = [
	keyof ColumnsOf<TTable> & ReservedColumnName,
] extends [never]
	? unknown
	: {
			[K in keyof ColumnsOf<TTable> &
				ReservedColumnName]: `column "${K}" is reserved for a model method; rename its JS key`;
		};

/**
 * Model events, fired before the write:
 *
 * - `saving`: before `create()` and `save()` (with the insert values or the instance)
 * - `creating`: before `create()`, after `saving` (with the insert values)
 * - `updating`: before `save()` writes dirty columns, after `saving` (with the instance)
 * - `deleting`: before `delete()` and `forceDelete()` (with the instance)
 *
 * Only instance operations fire events; `where(...).update()` and
 * `where(...).delete()` do not.
 */
export type ModelEvent = "creating" | "updating" | "saving" | "deleting";

/**
 * A model event listener, sync or async. Returning `false` (or a promise of
 * `false`) cancels the write; any other value does not. Throwing rejects
 * the operation.
 */
export type ModelListener<T> = (target: T) => unknown;

/** What each event's listeners receive. */
export interface ModelEventTargets<
	TTable extends Table,
	TDb extends AnyDatabase,
	THidden extends string = never,
	TSoft extends boolean = false,
> {
	/** A copy of the values passed to `create()`; changes are inserted. */
	creating: NewRowOf<TTable>;
	updating: ModelInstance<TTable, TDb, THidden, TSoft>;
	/** The instance for `save()`, the insert values for `create()`. */
	saving: ModelInstance<TTable, TDb, THidden, TSoft> | NewRowOf<TTable>;
	deleting: ModelInstance<TTable, TDb, THidden, TSoft>;
}

/** The `events` option of `defineModel()`: a listener or a list per event. */
export type ModelListeners<
	TTable extends Table,
	TDb extends AnyDatabase,
	THidden extends string = never,
	TSoft extends boolean = false,
> = {
	[E in ModelEvent]?:
		| ModelListener<ModelEventTargets<TTable, TDb, THidden, TSoft>[E]>
		| ModelListener<ModelEventTargets<TTable, TDb, THidden, TSoft>[E]>[];
};

/** Selected row type of a table. */
export type RowOf<TTable extends Table> = InferSelectModel<TTable>;

/** Insert values type of a table. */
export type NewRowOf<TTable extends Table> = InferInsertModel<TTable>;

type ColumnsOf<TTable extends Table> = TTable["_"]["columns"];

/** The column declared with `.primaryKey()`, or `Column` if there is none. */
export type PrimaryKeyColumn<TTable extends Table> = [
	{
		[K in keyof ColumnsOf<TTable>]: ColumnsOf<TTable>[K]["_"]["isPrimaryKey"] extends true
			? ColumnsOf<TTable>[K]
			: never;
	}[keyof ColumnsOf<TTable>],
] extends [never]
	? Column
	: {
			[K in keyof ColumnsOf<TTable>]: ColumnsOf<TTable>[K]["_"]["isPrimaryKey"] extends true
				? ColumnsOf<TTable>[K]
				: never;
		}[keyof ColumnsOf<TTable>];

/** `db.select().from(table)` for the dialect of `TDb`. */
export type SelectQuery<TDb extends AnyDatabase, TTable extends Table> =
	TDb extends BaseSQLiteDatabase<infer TKind, infer TRun, any, any>
		? SQLiteSelectBase<
				TTable["_"]["name"],
				TKind,
				TRun,
				ColumnsOf<TTable>,
				"single"
			>
		: PgSelectBase<TTable["_"]["name"], ColumnsOf<TTable>, "single">;

/** Methods available on every model instance. */
export interface InstanceMethods<
	TTable extends Table,
	TDb extends AnyDatabase,
	THidden extends string = never,
> {
	/** Whether `key` (or, without a key, any column) differs from the persisted value. */
	isDirty(key?: keyof RowOf<TTable> & string): boolean;
	/** The columns that differ from the persisted values, with their new values. */
	getDirty(): Partial<RowOf<TTable>>;
	/**
	 * Fire `saving`, then (if anything is dirty) `updating`; write the dirty
	 * columns (only those) to the row and reload it from the `RETURNING`
	 * result. Runs no query when nothing is dirty.
	 * @returns the instance, or `false` if a listener cancelled the write
	 * @throws {ModelNotFoundError} if the row no longer exists
	 */
	save(options?: QueryOptions<TDb>): Promise<this | false>;
	/**
	 * Fire `deleting`, then delete the row (matched by its persisted primary
	 * key). With soft deletes, set its `deletedAt` instead.
	 * @returns `true`, or `false` if a listener cancelled the delete
	 */
	delete(options?: QueryOptions<TDb>): Promise<boolean>;
	/**
	 * Reload every column from the database, discarding unsaved changes.
	 * @throws {ModelNotFoundError} if the row no longer exists
	 */
	refresh(options?: QueryOptions<TDb>): Promise<this>;
	/** A plain copy of the current attributes, without the hidden columns. */
	toJSON(): Omit<RowOf<TTable>, THidden>;
}

/** Instance methods of a model defined with `softDeletes: true`. */
export interface SoftDeleteInstanceMethods<TDb extends AnyDatabase> {
	/** Whether the instance's `deletedAt` is set. */
	trashed(): boolean;
	/**
	 * Set `deletedAt` to `null` and `save()` (firing `saving` and
	 * `updating`; other unsaved changes are written too).
	 * @returns the instance, or `false` if a listener cancelled the write
	 */
	restore(options?: QueryOptions<TDb>): Promise<this | false>;
	/**
	 * Fire `deleting`, then really delete the row.
	 * @returns `true`, or `false` if a listener cancelled the delete
	 */
	forceDelete(options?: QueryOptions<TDb>): Promise<boolean>;
}

/** A row wrapped with dirty tracking: columns are readable and writable properties. */
export type ModelInstance<
	TTable extends Table,
	TDb extends AnyDatabase = AnyDatabase,
	THidden extends string = never,
	TSoft extends boolean = false,
> = RowOf<TTable> &
	InstanceMethods<TTable, TDb, THidden> &
	(TSoft extends true ? SoftDeleteInstanceMethods<TDb> : unknown);

/**
 * A model query, returned by `Model.where()`, the trashed filters and
 * scopes. Queries are immutable: every chained call returns a new query.
 */
export type ModelQuery<
	TTable extends Table,
	TDb extends AnyDatabase = AnyDatabase,
	THidden extends string = never,
	TSoft extends boolean = false,
	TScopes extends ScopeMap = NoScopes,
> = QueryMethods<TTable, TDb, THidden, TSoft, TScopes> &
	(TSoft extends true
		? SoftDeleteQueryMethods<TTable, TDb, THidden, TSoft, TScopes>
		: unknown) & {
		[K in keyof TScopes]: TScopes[K] extends (
			query: any,
			...args: infer TArgs
		) => any
			? (...args: TArgs) => ModelQuery<TTable, TDb, THidden, TSoft, TScopes>
			: never;
	};

/** Methods of every model query. */
export interface QueryMethods<
	TTable extends Table,
	TDb extends AnyDatabase,
	THidden extends string = never,
	TSoft extends boolean = false,
	TScopes extends ScopeMap = NoScopes,
> {
	/** Add a Drizzle condition, combined with the query's others by `AND`. */
	where(
		condition: SQL | undefined,
	): ModelQuery<TTable, TDb, THidden, TSoft, TScopes>;
	/** Every matching row. */
	get(
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb, THidden, TSoft>[]>;
	/** The first matching row, or `null`. */
	first(
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb, THidden, TSoft> | null>;
	/**
	 * Bulk update: set `values` on every matching row (every row when the
	 * condition is `undefined`) and return how many were updated.
	 * Fires no model events.
	 */
	update(
		values: Partial<NewRowOf<TTable>>,
		options?: QueryOptions<TDb>,
	): Promise<number>;
	/**
	 * Bulk delete: delete every matching row (every row when the condition
	 * is `undefined`) and return how many were deleted. With soft deletes,
	 * set their `deletedAt` instead. Fires no model events.
	 */
	delete(options?: QueryOptions<TDb>): Promise<number>;
}

/** Query methods of a model defined with `softDeletes: true`. */
export interface SoftDeleteQueryMethods<
	TTable extends Table,
	TDb extends AnyDatabase,
	THidden extends string = never,
	TSoft extends boolean = true,
	TScopes extends ScopeMap = NoScopes,
> {
	/** Include soft-deleted rows. */
	withTrashed(): ModelQuery<TTable, TDb, THidden, TSoft, TScopes>;
	/** Only soft-deleted rows. */
	onlyTrashed(): ModelQuery<TTable, TDb, THidden, TSoft, TScopes>;
	/**
	 * Bulk restore: clear `deletedAt` on every matching soft-deleted row and
	 * return how many were restored. Fires no model events.
	 */
	restore(options?: QueryOptions<TDb>): Promise<number>;
	/**
	 * Bulk delete for real: delete every matching row (soft-deleted ones only
	 * with `withTrashed()` / `onlyTrashed()`) and return how many were
	 * deleted. Fires no model events.
	 */
	forceDelete(options?: QueryOptions<TDb>): Promise<number>;
}

/**
 * A model returned by `defineModel()`: the {@link ModelMethods}, plus
 * `withTrashed()` / `onlyTrashed()` with soft deletes, plus one method per
 * scope.
 */
export type Model<
	TTable extends Table,
	TDb extends AnyDatabase = AnyDatabase,
	TId = PrimaryKeyColumn<TTable>["_"]["data"],
	THidden extends string = never,
	TSoft extends boolean = false,
	TScopes extends ScopeMap = NoScopes,
> = ModelMethods<TTable, TDb, TId, THidden, TSoft, TScopes> &
	(TSoft extends true
		? Pick<
				SoftDeleteQueryMethods<TTable, TDb, THidden, TSoft, TScopes>,
				"withTrashed" | "onlyTrashed"
			>
		: unknown) &
	ScopeMethods<TScopes, ModelQuery<TTable, TDb, THidden, TSoft, TScopes>>;

/** Members of every model. */
export interface ModelMethods<
	TTable extends Table,
	TDb extends AnyDatabase = AnyDatabase,
	TId = PrimaryKeyColumn<TTable>["_"]["data"],
	THidden extends string = never,
	TSoft extends boolean = false,
	TScopes extends ScopeMap = NoScopes,
> {
	/** The Drizzle database the model queries by default. */
	readonly db: TDb;
	/** The Drizzle table the model wraps. */
	readonly table: TTable;
	/** The table's name. */
	readonly tableName: string;
	/** Find a row by primary key, or `null` (also for a soft-deleted row). */
	find(
		id: TId,
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb, THidden, TSoft> | null>;
	/**
	 * Find a row by primary key.
	 * @throws {ModelNotFoundError} if there is none (or it is soft-deleted)
	 */
	findOrFail(
		id: TId,
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb, THidden, TSoft>>;
	/** Filter by a Drizzle condition, e.g. `where(eq(users.email, email))`. */
	where(
		condition: SQL | undefined,
	): ModelQuery<TTable, TDb, THidden, TSoft, TScopes>;
	/**
	 * Fire `saving` and `creating`, then insert a row and return it as
	 * persisted, including database-assigned values such as the primary key.
	 * `values` is never mutated.
	 * @returns the instance, or `false` if a listener cancelled the insert
	 */
	create(
		values: NewRowOf<TTable>,
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb, THidden, TSoft> | false>;
	/**
	 * Raw Drizzle escape hatch: `db.select().from(table)`, ready to chain.
	 * Soft-deleted rows are included.
	 */
	query(options?: QueryOptions<TDb>): SelectQuery<TDb, TTable>;
	/** Wrap a row you selected yourself (e.g. via `query()`) in a clean instance. */
	hydrate(row: RowOf<TTable>): ModelInstance<TTable, TDb, THidden, TSoft>;
	/**
	 * Add a listener for a model event, run after the `events` option's
	 * listeners and earlier `on()` listeners. Returns a function that removes it.
	 */
	on<E extends ModelEvent>(
		event: E,
		listener: ModelListener<ModelEventTargets<TTable, TDb, THidden, TSoft>[E]>,
	): () => void;
}
