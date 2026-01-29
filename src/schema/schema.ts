/**
 * Schema builder API for migrations
 *
 * Provides createTable, dropTable, and table (alter) operations.
 * SQLite implementation emits and executes SQL via the configured driver.
 */

import { getDriver } from "../connection.js";
import type { DatabaseDriver } from "../drivers/types.js";
import { SqliteTableBuilder } from "./sqlite-table-builder.js";
import type { TableBuilderCallback } from "./types.js";

/**
 * Schema builder for DDL operations (create/drop/alter tables).
 *
 * Uses the currently configured driver (from getDriver()).
 * For SQLite, produces and executes SQLite-compatible SQL.
 *
 * @example
 * ```ts
 * import { Schema, setOrmConfig } from "@bunary/orm";
 *
 * setOrmConfig({ database: { type: "sqlite", sqlite: { path: "./db.sqlite" } } });
 *
 * Schema.createTable("users", (table) => {
 *   table.increments("id");
 *   table.text("name");
 *   table.text("email").unique();
 *   table.timestamps();
 * });
 *
 * Schema.dropTable("users");
 * ```
 */
export const Schema = {
	/**
	 * Create a new table
	 *
	 * @param name - Table name
	 * @param callback - Function that receives a TableBuilder to define columns
	 * @param driver - Optional driver; uses getDriver() if not provided
	 *
	 * @example
	 * ```ts
	 * Schema.createTable("users", (table) => {
	 *   table.increments("id");
	 *   table.text("name");
	 *   table.text("email").unique();
	 *   table.timestamps();
	 * });
	 * ```
	 */
	createTable(
		name: string,
		callback: TableBuilderCallback,
		driver?: DatabaseDriver,
	): void {
		const db = driver ?? getDriver();
		const builder = new SqliteTableBuilder(name, false);
		callback(builder);

		const createSql = (builder as SqliteTableBuilder).toCreateSql();
		db.exec(createSql);

		const indexStatements = (builder as SqliteTableBuilder).toIndexSql();
		for (const sql of indexStatements) {
			db.exec(sql);
		}
	},

	/**
	 * Drop a table if it exists
	 *
	 * @param name - Table name
	 * @param driver - Optional driver; uses getDriver() if not provided
	 *
	 * @example
	 * ```ts
	 * Schema.dropTable("users");
	 * ```
	 */
	dropTable(name: string, driver?: DatabaseDriver): void {
		const db = driver ?? getDriver();
		const quoted = `"${name.replace(/"/g, '""')}"`;
		db.exec(`DROP TABLE IF EXISTS ${quoted}`);
	},

	/**
	 * Alter an existing table (minimal: add columns)
	 *
	 * @param name - Table name
	 * @param callback - Function that receives a TableBuilder; only new columns are added
	 * @param driver - Optional driver; uses getDriver() if not provided
	 *
	 * @example
	 * ```ts
	 * Schema.table("users", (table) => {
	 *   table.text("phone");
	 * });
	 * ```
	 */
	table(
		name: string,
		callback: TableBuilderCallback,
		driver?: DatabaseDriver,
	): void {
		const db = driver ?? getDriver();
		const builder = new SqliteTableBuilder(name, true);
		callback(builder);

		const columns = (builder as SqliteTableBuilder).getAlterColumns();
		const quotedTable = `"${name.replace(/"/g, '""')}"`;
		for (const col of columns) {
			let def = col.sql;

			// Handle NOT NULL
			if (col.notNull) {
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
			if (col.unique) {
				def += " UNIQUE";
			}

			db.exec(`ALTER TABLE ${quotedTable} ADD COLUMN ${def}`);
		}
	},

	/**
	 * Check if a table exists
	 *
	 * @param name - Table name
	 * @param driver - Optional driver; uses getDriver() if not provided
	 * @returns true if table exists, false otherwise
	 *
	 * @example
	 * ```ts
	 * if (Schema.hasTable("users")) {
	 *   Schema.dropTable("users");
	 * }
	 * ```
	 */
	hasTable(name: string, driver?: DatabaseDriver): boolean {
		const db = driver ?? getDriver();
		const quoted = `"${name.replace(/"/g, '""')}"`;
		const result = db
			.query(
				`SELECT name FROM sqlite_master WHERE type='table' AND name=${quoted}`,
			)
			.get();
		return result !== null;
	},

	/**
	 * Check if a column exists in a table
	 *
	 * @param table - Table name
	 * @param column - Column name
	 * @param driver - Optional driver; uses getDriver() if not provided
	 * @returns true if column exists, false otherwise
	 *
	 * @example
	 * ```ts
	 * if (!Schema.hasColumn("users", "email")) {
	 *   Schema.table("users", (table) => {
	 *     table.text("email");
	 *   });
	 * }
	 * ```
	 */
	hasColumn(table: string, column: string, driver?: DatabaseDriver): boolean {
		const db = driver ?? getDriver();
		const quotedTable = `"${table.replace(/"/g, '""')}"`;
		const info = db.query(`PRAGMA table_info(${quotedTable})`).all();
		return info.some(
			(col: { name?: string }) => col.name === column,
		);
	},

	/**
	 * Rename a table
	 *
	 * @param oldName - Current table name
	 * @param newName - New table name
	 * @param driver - Optional driver; uses getDriver() if not provided
	 *
	 * @example
	 * ```ts
	 * Schema.renameTable("users", "accounts");
	 * ```
	 */
	renameTable(
		oldName: string,
		newName: string,
		driver?: DatabaseDriver,
	): void {
		const db = driver ?? getDriver();
		const quotedOld = `"${oldName.replace(/"/g, '""')}"`;
		const quotedNew = `"${newName.replace(/"/g, '""')}"`;
		db.exec(`ALTER TABLE ${quotedOld} RENAME TO ${quotedNew}`);
	},
};
