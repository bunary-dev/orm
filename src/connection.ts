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
 * Cached driver instance
 */
let cachedDriver: DatabaseDriver | null = null;

/**
 * Cached config hash for change detection
 */
let cachedConfigHash: string | null = null;

/**
 * Generate a hash from database config for change detection
 *
 * @param config - Database configuration
 * @returns Hash string representing the config
 */
function hashConfig(config: DatabaseConfig): string {
	// Simple hash based on config properties
	// For SQLite, use path; for MySQL, use connection string components
	if (config.type === "sqlite") {
		return `sqlite:${config.sqlite?.path || ""}`;
	}
	if (config.type === "mysql") {
		const mysql = config.mysql;
		return `mysql:${mysql?.host || ""}:${mysql?.port || ""}:${mysql?.user || ""}:${mysql?.database || ""}`;
	}
	// For custom types, use type + JSON stringify
	return `${config.type}:${JSON.stringify(config)}`;
}

/**
 * Close the cached driver instance
 *
 * Closes the currently cached driver and clears the cache.
 * After calling this, the next `getDriver()` call will create a new driver instance.
 *
 * @example
 * ```ts
 * import { getDriver, closeDriver } from "@bunary/orm";
 *
 * const driver = getDriver();
 * // ... use driver ...
 * closeDriver(); // Explicitly close the cached driver
 * ```
 */
export function closeDriver(): void {
	if (cachedDriver) {
		cachedDriver.close();
		cachedDriver = null;
		cachedConfigHash = null;
	}
}

/**
 * Reset the cached driver instance without closing it
 *
 * Clears the cache so the next `getDriver()` call will create a new driver instance.
 * Unlike `closeDriver()`, this does not close the existing driver connection.
 * Useful for testing or when you want to force a new connection.
 *
 * @example
 * ```ts
 * import { getDriver, resetDriver } from "@bunary/orm";
 *
 * const driver1 = getDriver();
 * resetDriver(); // Clear cache
 * const driver2 = getDriver(); // Creates new instance
 * ```
 */
export function resetDriver(): void {
	cachedDriver = null;
	cachedConfigHash = null;
}

/**
 * Get the current database driver from global configuration
 *
 * Returns a cached driver instance if the configuration hasn't changed.
 * Creates a new driver instance if:
 * - No driver is cached
 * - Configuration has changed
 * - Previous driver was closed/reset
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
	const configHash = hashConfig(config.database);

	// Return cached driver if config hasn't changed
	if (cachedDriver && cachedConfigHash === configHash) {
		return cachedDriver;
	}

	// Close previous driver if config changed
	if (cachedDriver && cachedConfigHash !== configHash) {
		cachedDriver.close();
		cachedDriver = null;
	}

	// Create and cache new driver
	cachedDriver = createDriver(config.database);
	cachedConfigHash = configHash;

	return cachedDriver;
}
