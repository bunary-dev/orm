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
			if (col.unique) {
				def += " UNIQUE";
			}
			db.exec(`ALTER TABLE ${quotedTable} ADD COLUMN ${def}`);
		}
	},
};
