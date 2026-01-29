/**
 * SQLite table builder - collects column definitions and emits SQL
 */

import type { ColumnBuilder, TableBuilder } from "./types.js";

interface ColumnDef {
	name: string;
	sql: string;
	unique?: boolean;
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
	private isAlter = false;
	private tableName = "";

	constructor(tableName: string, isAlter = false) {
		this.tableName = tableName;
		this.isAlter = isAlter;
	}

	increments(name: string): TableBuilder {
		this.columns.push({
			name,
			sql: `${this.quote(name)} INTEGER PRIMARY KEY AUTOINCREMENT`,
		});
		return this;
	}

	integer(name: string): TableBuilder {
		this.columns.push({ name, sql: `${this.quote(name)} INTEGER` });
		return this;
	}

	text(name: string): ColumnBuilder & TableBuilder {
		const col: ColumnDef = { name, sql: `${this.quote(name)} TEXT` };
		this.columns.push(col);
		const self = this;
		const withUnique = Object.assign(self, {
			unique() {
				col.unique = true;
				return self;
			},
		});
		return withUnique as unknown as ColumnBuilder & TableBuilder;
	}

	boolean(name: string): TableBuilder {
		// SQLite doesn't have BOOLEAN; use INTEGER 0/1
		this.columns.push({ name, sql: `${this.quote(name)} INTEGER` });
		return this;
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
			if (col.unique) {
				def += " UNIQUE";
			}
			parts.push(def);
		}
		for (const cols of this.uniqueConstraints) {
			const quoted = cols.map((c) => this.quote(c)).join(", ");
			parts.push(`UNIQUE (${quoted})`);
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
