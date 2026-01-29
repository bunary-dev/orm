/**
 * Schema builder types
 */

/**
 * Fluent column builder for chaining modifiers (e.g. .unique(), .nullable())
 */
export interface ColumnBuilder {
	/** Add UNIQUE constraint to the column */
	unique(): ColumnBuilder;
	/** Make column nullable (default for most columns) */
	nullable(): ColumnBuilder;
	/** Make column NOT NULL */
	notNull(): ColumnBuilder;
	/** Set default value */
	default(value: string | number | boolean | null): ColumnBuilder;
	/** Set as primary key */
	primary(): ColumnBuilder;
}

/**
 * Foreign key builder for defining foreign key constraints
 */
export interface ForeignKeyBuilder {
	/** Reference a column in another table */
	references(table: string, column: string): TableBuilder;
}

/**
 * Table builder interface for defining table schema
 */
export interface TableBuilder {
	/** Auto-incrementing integer primary key */
	increments(name: string): TableBuilder;

	/** Integer column */
	integer(name: string): ColumnBuilder & TableBuilder;

	/** Text column */
	text(name: string): ColumnBuilder & TableBuilder;

	/** String column with optional length (alias for text) */
	string(name: string, length?: number): ColumnBuilder & TableBuilder;

	/** Boolean column (stored as integer 0/1 in SQLite) */
	boolean(name: string): ColumnBuilder & TableBuilder;

	/** Timestamp column (stored as TEXT in SQLite) */
	timestamp(name: string): ColumnBuilder & TableBuilder;

	/** Foreign key column (integer) */
	foreignId(name: string): ColumnBuilder & TableBuilder & ForeignKeyBuilder;

	/** Add createdAt and updatedAt timestamp columns */
	timestamps(): TableBuilder;

	/** Add UNIQUE constraint (standalone or on last column) */
	unique(column: string | string[]): TableBuilder;

	/** Create index on column(s) */
	index(column: string | string[]): TableBuilder;

	/** Define foreign key constraint */
	foreign(column: string): ForeignKeyBuilder;
}

/**
 * Callback type for table definition
 */
export type TableBuilderCallback = (table: TableBuilder) => void;
