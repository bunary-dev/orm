/**
 * SQLite table builder - collects column definitions and emits SQL
 */

import type {
	ColumnBuilder,
	ForeignKeyBuilder,
	TableBuilder,
} from "./types.js";

interface ColumnDef {
	name: string;
	sql: string;
	unique?: boolean;
	nullable?: boolean;
	notNull?: boolean;
	defaultValue?: string | number | boolean | null;
	primary?: boolean;
	foreignKey?: {
		table: string;
		column: string;
	};
}

interface IndexDef {
	columns: string[];
	unique?: boolean;
}

/**
 * SQLite implementation of TableBuilder
 * Builds CREATE TABLE / ALTER TABLE SQL for SQLite
 */
export class SqliteTableBuilder implements TableBuilder {
	private columns: ColumnDef[] = [];
	private indexes: IndexDef[] = [];
	private uniqueConstraints: string[][] = [];
	private foreignKeys: Array<{
		column: string;
		table: string;
		refColumn: string;
	}> = [];
	private isAlter = false;
	private tableName = "";

	constructor(tableName: string, isAlter = false) {
		this.tableName = tableName;
		this.isAlter = isAlter;
	}

	/**
	 * Create a column builder with all modifiers
	 */
	private createColumnBuilder(
		col: ColumnDef,
	): ColumnBuilder & TableBuilder & ForeignKeyBuilder {
		const self = this;
		const builder = {
			unique() {
				col.unique = true;
				return builder;
			},
			nullable() {
				col.nullable = true;
				col.notNull = false;
				return builder;
			},
			notNull() {
				col.notNull = true;
				col.nullable = false;
				return builder;
			},
			default(value: string | number | boolean | null) {
				col.defaultValue = value;
				return builder;
			},
			primary() {
				col.primary = true;
				return builder;
			},
			references(table: string, column: string) {
				col.foreignKey = { table, column };
				self.foreignKeys.push({ column: col.name, table, refColumn: column });
				return self;
			},
			// TableBuilder methods
			increments: (n: string) => self.increments(n),
			integer: (n: string) => self.integer(n),
			text: (n: string) => self.text(n),
			string: (n: string) => self.string(n),
			boolean: (n: string) => self.boolean(n),
			timestamp: (n: string) => self.timestamp(n),
			uuid: (n?: string) => self.uuid(n),
			foreignId: (n: string) => self.foreignId(n),
			timestamps: () => self.timestamps(),
			uniqueConstraint: (c: string | string[]) => self.unique(c),
			index: (c: string | string[]) => self.index(c),
			foreign: (c: string) => self.foreign(c),
		};
		return builder as unknown as ColumnBuilder &
			TableBuilder &
			ForeignKeyBuilder;
	}

	increments(name: string): TableBuilder {
		const col: ColumnDef = {
			name,
			sql: `${this.quote(name)} INTEGER PRIMARY KEY AUTOINCREMENT`,
			primary: true,
			notNull: true,
		};
		this.columns.push(col);
		return this;
	}

	integer(name: string): ColumnBuilder & TableBuilder {
		const col: ColumnDef = { name, sql: `${this.quote(name)} INTEGER` };
		this.columns.push(col);
		return this.createColumnBuilder(col);
	}

	text(name: string): ColumnBuilder & TableBuilder {
		const col: ColumnDef = { name, sql: `${this.quote(name)} TEXT` };
		this.columns.push(col);
		return this.createColumnBuilder(col);
	}

	string(name: string, _length?: number): ColumnBuilder & TableBuilder {
		// In SQLite, string is just an alias for text (length parameter ignored)
		return this.text(name);
	}

	boolean(name: string): ColumnBuilder & TableBuilder {
		// SQLite doesn't have BOOLEAN; use INTEGER 0/1
		const col: ColumnDef = { name, sql: `${this.quote(name)} INTEGER` };
		this.columns.push(col);
		return this.createColumnBuilder(col);
	}

	timestamp(name: string): ColumnBuilder & TableBuilder {
		const col: ColumnDef = { name, sql: `${this.quote(name)} TEXT` };
		this.columns.push(col);
		return this.createColumnBuilder(col);
	}

	uuid(name = "id"): ColumnBuilder & TableBuilder {
		const col: ColumnDef = { name, sql: `${this.quote(name)} TEXT` };
		this.columns.push(col);
		return this.createColumnBuilder(col);
	}

	foreignId(name: string): ColumnBuilder & TableBuilder & ForeignKeyBuilder {
		const col: ColumnDef = {
			name,
			sql: `${this.quote(name)} INTEGER`,
			notNull: true,
		};
		this.columns.push(col);
		return this.createColumnBuilder(col);
	}

	timestamps(): TableBuilder {
		this.columns.push({
			name: "createdAt",
			sql: `${this.quote("createdAt")} TEXT`,
		});
		this.columns.push({
			name: "updatedAt",
			sql: `${this.quote("updatedAt")} TEXT`,
		});
		return this;
	}

	unique(column: string | string[]): TableBuilder {
		const cols = Array.isArray(column) ? column : [column];
		this.uniqueConstraints.push(cols);
		return this;
	}

	index(column: string | string[]): TableBuilder {
		const columns = Array.isArray(column) ? column : [column];
		this.indexes.push({ columns });
		return this;
	}

	foreign(column: string): ForeignKeyBuilder {
		const self = this;
		return {
			references(table: string, refColumn: string) {
				self.foreignKeys.push({ column, table, refColumn });
				return self;
			},
		};
	}

	private quote(name: string): string {
		return `"${name.replace(/"/g, '""')}"`;
	}

	/**
	 * Build CREATE TABLE SQL
	 */
	toCreateSql(): string {
		const parts: string[] = [];
		for (const col of this.columns) {
			let def = col.sql;

			// Handle NOT NULL (default for primary keys, but can be explicit)
			if (col.notNull && !col.sql.includes("PRIMARY KEY")) {
				def += " NOT NULL";
			}

			// Handle DEFAULT
			if (col.defaultValue !== undefined) {
				const defaultValue =
					typeof col.defaultValue === "string"
						? `'${col.defaultValue.replace(/'/g, "''")}'`
						: col.defaultValue === null
							? "NULL"
							: String(col.defaultValue);
				def += ` DEFAULT ${defaultValue}`;
			}

			// Handle UNIQUE constraint on column
			if (col.unique && !col.sql.includes("PRIMARY KEY")) {
				def += " UNIQUE";
			}

			// Handle PRIMARY KEY (if not auto-increment)
			if (col.primary && !col.sql.includes("PRIMARY KEY")) {
				def += " PRIMARY KEY";
			}

			parts.push(def);
		}

		// Add composite UNIQUE constraints
		for (const cols of this.uniqueConstraints) {
			const quoted = cols.map((c) => this.quote(c)).join(", ");
			parts.push(`UNIQUE (${quoted})`);
		}

		// Add foreign key constraints
		for (const fk of this.foreignKeys) {
			const quotedCol = this.quote(fk.column);
			const quotedTable = this.quote(fk.table);
			const quotedRefCol = this.quote(fk.refColumn);
			parts.push(
				`FOREIGN KEY (${quotedCol}) REFERENCES ${quotedTable}(${quotedRefCol})`,
			);
		}

		const body = parts.join(", ");
		return `CREATE TABLE ${this.quote(this.tableName)} (${body})`;
	}

	/**
	 * Build CREATE INDEX statements for indexes defined on the table
	 */
	toIndexSql(): string[] {
		const statements: string[] = [];
		for (let i = 0; i < this.indexes.length; i++) {
			const idx = this.indexes[i];
			const indexName = `${this.tableName}_${idx.columns.join("_")}_index`;
			const columns = idx.columns.map((c) => this.quote(c)).join(", ");
			statements.push(
				`CREATE INDEX ${this.quote(indexName)} ON ${this.quote(this.tableName)} (${columns})`,
			);
		}
		return statements;
	}

	/**
	 * For alter: return column definitions to add
	 */
	getAlterColumns(): ColumnDef[] {
		return this.columns;
	}

	getTableName(): string {
		return this.tableName;
	}

	getIsAlter(): boolean {
		return this.isAlter;
	}
}
