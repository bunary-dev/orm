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
	events?: ModelListeners<TTable, TDb, THidden>;
}

/**
 * Instance method names. A column whose JS key is one of these is a type
 * error in `defineModel()`, and `defineModel()` throws for it at runtime.
 */
export type ReservedColumnName =
	| "isDirty"
	| "getDirty"
	| "save"
	| "delete"
	| "refresh"
	| "toJSON"
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
 * - `deleting`: before `delete()` (with the instance)
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
> {
	/** A copy of the values passed to `create()`; changes are inserted. */
	creating: NewRowOf<TTable>;
	updating: ModelInstance<TTable, TDb, THidden>;
	/** The instance for `save()`, the insert values for `create()`. */
	saving: ModelInstance<TTable, TDb, THidden> | NewRowOf<TTable>;
	deleting: ModelInstance<TTable, TDb, THidden>;
}

/** The `events` option of `defineModel()`: a listener or a list per event. */
export type ModelListeners<
	TTable extends Table,
	TDb extends AnyDatabase,
	THidden extends string = never,
> = {
	[E in ModelEvent]?:
		| ModelListener<ModelEventTargets<TTable, TDb, THidden>[E]>
		| ModelListener<ModelEventTargets<TTable, TDb, THidden>[E]>[];
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
	 * Fire `deleting`, then delete the row (matched by its persisted primary key).
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

/** A row wrapped with dirty tracking: columns are readable and writable properties. */
export type ModelInstance<
	TTable extends Table,
	TDb extends AnyDatabase = AnyDatabase,
	THidden extends string = never,
> = RowOf<TTable> & InstanceMethods<TTable, TDb, THidden>;

/** Result of `Model.where(condition)`. */
export interface WhereQuery<
	TTable extends Table,
	TDb extends AnyDatabase,
	THidden extends string = never,
> {
	/** Every matching row. */
	get(
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb, THidden>[]>;
	/** The first matching row, or `null`. */
	first(
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb, THidden> | null>;
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
	 * is `undefined`) and return how many were deleted. Fires no model events.
	 */
	delete(options?: QueryOptions<TDb>): Promise<number>;
}

/** A model returned by `defineModel()`. */
export interface Model<
	TTable extends Table,
	TDb extends AnyDatabase = AnyDatabase,
	TId = PrimaryKeyColumn<TTable>["_"]["data"],
	THidden extends string = never,
> {
	/** The Drizzle database the model queries by default. */
	readonly db: TDb;
	/** The Drizzle table the model wraps. */
	readonly table: TTable;
	/** The table's name. */
	readonly tableName: string;
	/** Find a row by primary key, or `null`. */
	find(
		id: TId,
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb, THidden> | null>;
	/**
	 * Find a row by primary key.
	 * @throws {ModelNotFoundError} if there is none
	 */
	findOrFail(
		id: TId,
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb, THidden>>;
	/** Filter by a Drizzle condition, e.g. `where(eq(users.email, email))`. */
	where(condition: SQL | undefined): WhereQuery<TTable, TDb, THidden>;
	/**
	 * Fire `saving` and `creating`, then insert a row and return it as
	 * persisted, including database-assigned values such as the primary key.
	 * `values` is never mutated.
	 * @returns the instance, or `false` if a listener cancelled the insert
	 */
	create(
		values: NewRowOf<TTable>,
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb, THidden> | false>;
	/** Raw Drizzle escape hatch: `db.select().from(table)`, ready to chain. */
	query(options?: QueryOptions<TDb>): SelectQuery<TDb, TTable>;
	/** Wrap a row you selected yourself (e.g. via `query()`) in a clean instance. */
	hydrate(row: RowOf<TTable>): ModelInstance<TTable, TDb, THidden>;
	/**
	 * Add a listener for a model event, run after the `events` option's
	 * listeners and earlier `on()` listeners. Returns a function that removes it.
	 */
	on<E extends ModelEvent>(
		event: E,
		listener: ModelListener<ModelEventTargets<TTable, TDb, THidden>[E]>,
	): () => void;
}
