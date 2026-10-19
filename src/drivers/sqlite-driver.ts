/**
 * SQLite Database Driver Implementation
 */
import { Database } from "bun:sqlite";
import type { ModelData } from "../types.js";
import type { DatabaseDriver, QueryResult, RunResult } from "./types.js";

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
 * Runs tasks strictly one at a time, in submission order.
 */
class SerialQueue {
	private tail: Promise<unknown> = Promise.resolve();

	run<T>(task: () => Promise<T>): Promise<T> {
		const result = this.tail.then(task);
		this.tail = result.catch(() => undefined);
		return result;
	}
}

function rollbackQuietly(db: Database, sql: string): void {
	try {
		db.exec(sql);
	} catch {
		// Transaction may already have been rolled back by SQLite
	}
}

/**
 * SQLite database driver
 */
export class SqliteDriver implements DatabaseDriver {
	private db: Database;
	private queue = new SerialQueue();

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

	run(sql: string, ...params: unknown[]): RunResult {
		return this.db.query(sql).run(...(params as never[]));
	}

	/**
	 * Run a callback in a transaction.
	 *
	 * Top-level transactions are serialized: concurrent calls are queued and run
	 * one after another on the shared connection.
	 *
	 * Note: SQLite uses a single shared connection, so queries issued through
	 * this root driver while a transaction is open are NOT isolated from it. They
	 * execute inside the open transaction and are rolled back with it. Use the
	 * `tx` argument for work that belongs to the transaction, and avoid root
	 * driver writes while a transaction is in flight.
	 */
	transaction<T>(fn: (tx: DatabaseDriver) => Promise<T> | T): Promise<T> {
		return this.queue.run(async () => {
			this.db.exec("BEGIN TRANSACTION");
			try {
				const value = await fn(new SqliteTransactionDriver(this.db));
				this.db.exec("COMMIT");
				return value;
			} catch (error) {
				rollbackQuietly(this.db, "ROLLBACK");
				throw error;
			}
		});
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
	private static globalSavepointCounter = 0;
	private queue = new SerialQueue();

	constructor(db: Database) {
		this.db = db;
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

	run(sql: string, ...params: unknown[]): RunResult {
		return this.db.query(sql).run(...(params as never[]));
	}

	/**
	 * Nested transaction using a savepoint. Sibling savepoints on the same
	 * transaction are serialized so they can't be released out of order.
	 */
	transaction<T>(fn: (tx: DatabaseDriver) => Promise<T> | T): Promise<T> {
		return this.queue.run(async () => {
			SqliteTransactionDriver.globalSavepointCounter++;
			const name = `sp_${SqliteTransactionDriver.globalSavepointCounter}`;
			this.db.exec(`SAVEPOINT ${name}`);
			try {
				const value = await fn(new SqliteTransactionDriver(this.db));
				this.db.exec(`RELEASE SAVEPOINT ${name}`);
				return value;
			} catch (error) {
				rollbackQuietly(this.db, `ROLLBACK TO SAVEPOINT ${name}`);
				rollbackQuietly(this.db, `RELEASE SAVEPOINT ${name}`);
				throw error;
			}
		});
	}

	close(): void {
		// Transaction-scoped drivers don't close the underlying connection
		// The parent transaction manages the connection lifecycle
	}
}
