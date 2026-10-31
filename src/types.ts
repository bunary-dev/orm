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
export interface DefineModelOptions<TPk extends Column = Column> {
	/**
	 * Primary key column. Defaults to the table's single `.primaryKey()`
	 * column; required for tables whose key is declared some other way.
	 */
	primaryKey?: TPk;
}

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
> {
	/** Whether `key` (or, without a key, any column) differs from the persisted value. */
	isDirty(key?: keyof RowOf<TTable> & string): boolean;
	/** The columns that differ from the persisted values, with their new values. */
	getDirty(): Partial<RowOf<TTable>>;
	/**
	 * Write the dirty columns (only those) to the row and reload it from the
	 * `RETURNING` result. Runs no query when nothing is dirty.
	 * @throws {ModelNotFoundError} if the row no longer exists
	 */
	save(options?: QueryOptions<TDb>): Promise<this>;
	/** Delete the row (matched by its persisted primary key). */
	delete(options?: QueryOptions<TDb>): Promise<void>;
	/**
	 * Reload every column from the database, discarding unsaved changes.
	 * @throws {ModelNotFoundError} if the row no longer exists
	 */
	refresh(options?: QueryOptions<TDb>): Promise<this>;
	/** A plain copy of the current attributes. */
	toJSON(): RowOf<TTable>;
}

/** A row wrapped with dirty tracking: columns are readable and writable properties. */
export type ModelInstance<
	TTable extends Table,
	TDb extends AnyDatabase = AnyDatabase,
> = RowOf<TTable> & InstanceMethods<TTable, TDb>;

/** Result of `Model.where(condition)`. */
export interface WhereQuery<TTable extends Table, TDb extends AnyDatabase> {
	/** Every matching row. */
	get(options?: QueryOptions<TDb>): Promise<ModelInstance<TTable, TDb>[]>;
	/** The first matching row, or `null`. */
	first(
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb> | null>;
}

/** A model returned by `defineModel()`. */
export interface Model<
	TTable extends Table,
	TDb extends AnyDatabase = AnyDatabase,
	TId = PrimaryKeyColumn<TTable>["_"]["data"],
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
	): Promise<ModelInstance<TTable, TDb> | null>;
	/**
	 * Find a row by primary key.
	 * @throws {ModelNotFoundError} if there is none
	 */
	findOrFail(
		id: TId,
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb>>;
	/** Filter by a Drizzle condition, e.g. `where(eq(users.email, email))`. */
	where(condition: SQL | undefined): WhereQuery<TTable, TDb>;
	/**
	 * Insert a row and return it as persisted, including database-assigned
	 * values such as the primary key. `values` is never mutated.
	 */
	create(
		values: NewRowOf<TTable>,
		options?: QueryOptions<TDb>,
	): Promise<ModelInstance<TTable, TDb>>;
	/** Raw Drizzle escape hatch: `db.select().from(table)`, ready to chain. */
	query(options?: QueryOptions<TDb>): SelectQuery<TDb, TTable>;
	/** Wrap a row you selected yourself (e.g. via `query()`) in a clean instance. */
	hydrate(row: RowOf<TTable>): ModelInstance<TTable, TDb>;
}
