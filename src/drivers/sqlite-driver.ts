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
