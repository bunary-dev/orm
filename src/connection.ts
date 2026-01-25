/**
 * ORM Connection Manager
 *
 * Manages database connections and provides access to the database driver
 */
import { getOrmConfig } from "./config.js";
import { SqliteDriver } from "./drivers/index.js";
import type { DatabaseDriver } from "./drivers/types.js";
import type { DatabaseConfig } from "./types.js";

/**
 * Create a database driver based on configuration
 *
 * @param config - Database configuration
 * @returns Database driver instance
 * @throws If database type is not supported or configuration is invalid
 *
 * @example
 * ```ts
 * const driver = createDriver({
 *   type: "sqlite",
 *   sqlite: { path: "./database.sqlite" }
 * });
 * ```
 */
export function createDriver(config: DatabaseConfig): DatabaseDriver {
	if (config.type === "sqlite") {
		if (!config.sqlite?.path) {
			throw new Error(
				"SQLite path is required when using sqlite database type",
			);
		}
		return new SqliteDriver(config.sqlite.path);
	}

	if (config.type === "mysql") {
		// Future: return new MysqlDriver(config.mysql!);
		throw new Error(
			"MySQL driver is not yet implemented. Only SQLite is supported in MVP.",
		);
	}

	throw new Error(
		`Database type "${config.type}" is not supported. Supported types: sqlite (mysql and postgres coming soon)`,
	);
}

/**
 * Get the current database driver from global configuration
 *
 * @returns Database driver instance
 * @throws If ORM is not configured
 *
 * @example
 * ```ts
 * const driver = getDriver();
 * const result = driver.query("SELECT * FROM users").all();
 * ```
 */
export function getDriver(): DatabaseDriver {
	const config = getOrmConfig();
	return createDriver(config.database);
}
