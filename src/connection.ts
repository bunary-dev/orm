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
 * Factory function that creates a database driver from configuration
 *
 * @param config - Database configuration
 * @returns Database driver instance
 *
 * @example
 * ```ts
 * const factory: DriverFactory = (config) => {
 *   return new CustomDriver(config);
 * };
 * ```
 */
export type DriverFactory = (config: DatabaseConfig) => DatabaseDriver;

/**
 * Driver registry for third-party database providers
 *
 * Maps database type strings to driver factory functions.
 * This allows third-party packages to register custom drivers
 * without modifying core @bunary/orm code.
 */
const driverRegistry = new Map<string, DriverFactory>();

/**
 * Register a custom database driver factory
 *
 * Allows third-party packages to register custom drivers for database types.
 * Registered drivers take precedence over built-in drivers.
 *
 * @param type - Database type identifier (e.g., "postgres", "custom")
 * @param factory - Factory function that creates a driver from config
 * @throws If factory is not a function
 *
 * @example
 * ```ts
 * import { registerDriver } from "@bunary/orm";
 *
 * registerDriver("postgres", (config) => {
 *   return new PostgresDriver(config.postgres!);
 * });
 * ```
 */
export function registerDriver(type: string, factory: DriverFactory): void {
	if (typeof factory !== "function") {
		throw new Error(`Driver factory must be a function, got ${typeof factory}`);
	}
	driverRegistry.set(type, factory);
}

/**
 * Clear all registered drivers (useful for testing)
 *
 * @internal
 */
export function clearDriverRegistry(): void {
	driverRegistry.clear();
}

/**
 * Create a database driver based on configuration
 *
 * Checks the driver registry first, then falls back to built-in drivers.
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
	// Check registry first (allows third-party drivers and overrides)
	const registeredFactory = driverRegistry.get(config.type);
	if (registeredFactory) {
		return registeredFactory(config);
	}

	// Fall back to built-in drivers
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
		`Database type "${config.type}" is not supported. Supported types: sqlite (mysql and postgres coming soon). Register a custom driver using registerDriver() for other types.`,
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
