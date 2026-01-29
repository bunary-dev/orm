/**
 * Database Driver Abstraction Layer
 *
 * This interface allows the ORM to work with any database type
 * through a unified API.
 */

import type { ModelData } from "../types.js";

/**
 * Query result from a database driver
 */
export interface QueryResult {
	/** All rows from the query */
	all(): ModelData[];
	/** Single row from the query, or null if not found */
	get(...params: unknown[]): ModelData | null;
}

/**
 * Database driver interface - abstraction for all database types
 */
export interface DatabaseDriver {
	/**
	 * Execute a raw SQL query
	 * @param sql - SQL query string
	 * @param params - Query parameters
	 * @returns Query result object
	 */
	query(sql: string, ...params: unknown[]): QueryResult;

	/**
	 * Execute a raw SQL statement (for DDL, INSERT, UPDATE, DELETE)
	 * @param sql - SQL statement
	 * @param params - Statement parameters
	 * @returns Number of affected rows
	 */
	exec(sql: string, ...params: unknown[]): number;

	/**
	 * Execute operations within a transaction
	 *
	 * Automatically begins a transaction, executes the callback, and commits on success.
	 * If the callback throws an error, the transaction is rolled back.
	 *
	 * @param fn - Callback function that receives a transaction-scoped driver instance
	 * @returns Promise resolving to the return value of the callback
	 *
	 * @example
	 * ```ts
	 * await driver.transaction(async (tx) => {
	 *   tx.exec("INSERT INTO users (name) VALUES (?)", "Alice");
	 *   tx.exec("INSERT INTO users (name) VALUES (?)", "Bob");
	 * });
	 * ```
	 */
	transaction<T>(fn: (tx: DatabaseDriver) => Promise<T> | T): Promise<T>;

	/**
	 * Close the database connection
	 */
	close(): void;
}
