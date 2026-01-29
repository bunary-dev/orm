/**
 * SQLite Database Driver Implementation
 */
import { Database } from "bun:sqlite";
import type { ModelData } from "../types.js";
import type { DatabaseDriver, QueryResult } from "./types.js";

/**
 * SQLite query result implementation
 */
class SqliteQueryResult implements QueryResult {
	private stmt: ReturnType<Database["query"]>;
	private params: unknown[];

	constructor(stmt: ReturnType<Database["query"]>, params: unknown[] = []) {
		this.stmt = stmt;
		this.params = params;
	}

	all(): ModelData[] {
		if (this.params.length > 0) {
			return this.stmt.all(...(this.params as never[])) as ModelData[];
		}
		return this.stmt.all() as ModelData[];
	}

	get(...params: unknown[]): ModelData | null {
		// Use provided params or fall back to stored params
		const finalParams = params.length > 0 ? params : this.params;
		if (finalParams.length > 0) {
			return (this.stmt.get(...(finalParams as never[])) as ModelData) || null;
		}
		return (this.stmt.get() as ModelData) || null;
	}
}

/**
 * SQLite database driver
 */
export class SqliteDriver implements DatabaseDriver {
	private db: Database;
	private inTransaction = false;

	constructor(path: string) {
		this.db = new Database(path);
	}

	query(sql: string, ...params: unknown[]): QueryResult {
		const stmt = this.db.query(sql);
		return new SqliteQueryResult(stmt, params);
	}

	exec(sql: string, ...params: unknown[]): number {
		// SQLite exec doesn't support parameters in the same way
		// For parameterized exec, we'd need to use query + run
		if (params.length > 0) {
			const stmt = this.db.query(sql);
			stmt.run(...(params as never[]));
			// Return 1 to indicate success (Bun SQLite doesn't expose changes directly)
			return 1;
		}
		this.db.exec(sql);
		// Return 1 to indicate success
		return 1;
	}

	transaction<T>(fn: (tx: DatabaseDriver) => Promise<T> | T): Promise<T> {
		// Create a transaction-scoped driver instance
		const txDriver = new SqliteTransactionDriver(this.db, false);
		const result = fn(txDriver);

		// Check if result is a Promise (async callback)
		if (result instanceof Promise) {
			// For async callbacks, we need to manually handle BEGIN/COMMIT/ROLLBACK
			// because Bun's transaction() doesn't properly await async callbacks
			return new Promise<T>((resolve, reject) => {
				// Begin transaction
				this.db.exec("BEGIN TRANSACTION");
				this.inTransaction = true;

				result
					.then((value) => {
						// Commit on success
						this.db.exec("COMMIT");
						this.inTransaction = false;
						resolve(value);
					})
					.catch((error) => {
						// Rollback on error
						try {
							this.db.exec("ROLLBACK");
						} catch {
							// Ignore rollback errors
						}
						this.inTransaction = false;
						reject(error);
					});
			});
		}

		// For sync callbacks, use Bun's transaction() method
		// It automatically handles BEGIN, COMMIT, and ROLLBACK
		return this.db.transaction(() => {
			return result;
		})();
	}

	close(): void {
		this.db.close();
	}

	/**
	 * Get the underlying Bun SQLite database instance
	 * (for advanced use cases)
	 */
	getRawDatabase(): Database {
		return this.db;
	}
}

/**
 * Transaction-scoped SQLite driver
 *
 * Wraps a Bun SQLite Database instance within a transaction context.
 * Supports nested transactions via savepoints.
 */
class SqliteTransactionDriver implements DatabaseDriver {
	private db: Database;
	private savepointCounter = 0;
	private static globalSavepointCounter = 0;
	private inTransaction: boolean;

	constructor(db: Database, inTransaction: boolean = false) {
		this.db = db;
		this.inTransaction = inTransaction;
	}

	query(sql: string, ...params: unknown[]): QueryResult {
		const stmt = this.db.query(sql);
		return new SqliteQueryResult(stmt, params);
	}

	exec(sql: string, ...params: unknown[]): number {
		if (params.length > 0) {
			const stmt = this.db.query(sql);
			stmt.run(...(params as never[]));
			return 1;
		}
		this.db.exec(sql);
		return 1;
	}

	transaction<T>(fn: (tx: DatabaseDriver) => Promise<T> | T): Promise<T> {
		// Nested transaction using savepoint
		SqliteTransactionDriver.globalSavepointCounter++;
		const savepointName = `sp_${SqliteTransactionDriver.globalSavepointCounter}_${Date.now()}`;

		// Create savepoint
		this.db.exec(`SAVEPOINT ${savepointName}`);

		let savepointReleased = false;

		try {
			// Create nested transaction driver
			const nestedTxDriver = new SqliteTransactionDriver(this.db, true);
			const result = fn(nestedTxDriver);

			// Handle async/sync result
			if (result instanceof Promise) {
				return result
					.then((value) => {
						// Release savepoint on success
						if (!savepointReleased) {
							this.db.exec(`RELEASE SAVEPOINT ${savepointName}`);
							savepointReleased = true;
						}
						return value;
					})
					.catch((error) => {
						// Rollback to savepoint on error
						if (!savepointReleased) {
							try {
								this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
								savepointReleased = true;
							} catch {
								// Savepoint may have already been released/rolled back
							}
						}
						throw error;
					});
			}

			// Release savepoint on success (sync)
			if (!savepointReleased) {
				this.db.exec(`RELEASE SAVEPOINT ${savepointName}`);
				savepointReleased = true;
			}
			return Promise.resolve(result);
		} catch (error) {
			// Rollback to savepoint on error
			if (!savepointReleased) {
				try {
					this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
					savepointReleased = true;
				} catch {
					// Savepoint may have already been released/rolled back
				}
			}
			throw error;
		}
	}

	close(): void {
		// Transaction-scoped drivers don't close the underlying connection
		// The parent transaction manages the connection lifecycle
	}
}
