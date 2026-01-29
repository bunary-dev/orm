/**
 * Schema builder types
 */

/**
 * Fluent column builder for chaining modifiers (e.g. .unique())
 */
export interface ColumnBuilder {
	/** Add UNIQUE constraint to the column */
	unique(): ColumnBuilder;
}

/**
 * Table builder interface for defining table schema
 */
export interface TableBuilder {
	/** Auto-incrementing integer primary key */
	increments(name: string): TableBuilder;

	/** Integer column */
	integer(name: string): TableBuilder;

	/** Text column */
	text(name: string): ColumnBuilder & TableBuilder;

	/** Boolean column (stored as integer 0/1 in SQLite) */
	boolean(name: string): TableBuilder;

	/** Add createdAt and updatedAt timestamp columns */
	timestamps(): TableBuilder;

	/** Add UNIQUE constraint (standalone or on last column) */
	unique(column: string | string[]): TableBuilder;

	/** Create index on column(s) */
	index(column: string | string[]): TableBuilder;
}

/**
 * Callback type for table definition
 */
export type TableBuilderCallback = (table: TableBuilder) => void;
