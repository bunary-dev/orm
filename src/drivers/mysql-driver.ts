/**
 * MySQL Database Driver Implementation
 *
 * Structure for future MySQL support
 */

import type { DatabaseDriver, QueryResult } from "./types.js";

/**
 * MySQL connection configuration
 */
export interface MysqlConfig {
	host: string;
	port?: number;
	user: string;
	password: string;
	database: string;
}

/**
 * MySQL query result implementation
 * (Placeholder for future implementation)
 */
// class MysqlQueryResult implements QueryResult {
// 	private results: ModelData[];
//
// 	constructor(results: ModelData[]) {
// 		this.results = results;
// 	}
//
// 	all(): ModelData[] {
// 		return this.results;
// 	}
//
// 	get(..._params: unknown[]): ModelData | null {
// 		return this.results[0] || null;
// 	}
// }

/**
 * MySQL database driver
 *
 * @example
 * ```ts
 * // Future implementation
 * const driver = new MysqlDriver({
 *   host: "localhost",
 *   port: 3306,
 *   user: "root",
 *   password: "password",
 *   database: "mydb"
 * });
 * ```
 */
export class MysqlDriver implements DatabaseDriver {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(_config: MysqlConfig) {
		// TODO: Initialize MySQL connection when implementing
		throw new Error(
			"MySQL driver is not yet implemented. This is a placeholder for future development.",
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	query(_sql: string, ..._params: unknown[]): QueryResult {
		// TODO: Implement MySQL query execution
		throw new Error("MySQL driver not implemented");
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	exec(_sql: string, ..._params: unknown[]): number {
		// TODO: Implement MySQL exec
		throw new Error("MySQL driver not implemented");
	}

	transaction<T>(_fn: (tx: DatabaseDriver) => Promise<T> | T): Promise<T> {
		// TODO: Implement MySQL transaction support
		throw new Error("MySQL driver not implemented");
	}

	close(): void {
		// TODO: Close MySQL connection
		throw new Error("MySQL driver not implemented");
	}
}
