import type { OrmConfig } from "./types.js";

let globalOrmConfig: OrmConfig | null = null;

/**
 * Define ORM configuration with type safety
 *
 * @param config - ORM configuration object
 * @returns The validated configuration
 *
 * @example
 * ```ts
 * import { defineOrmConfig } from "@bunary/orm";
 *
 * export default defineOrmConfig({
 *   database: {
 *     type: "sqlite",
 *     sqlite: {
 *       path: "./database.sqlite"
 *     }
 *   }
 * });
 * ```
 */
export function defineOrmConfig(config: OrmConfig): OrmConfig {
	const validated = {
		database: {
			type: config.database.type,
			sqlite: config.database.sqlite,
			mysql: config.database.mysql,
		},
	};
	globalOrmConfig = validated;
	return validated;
}

/**
 * Set the global ORM configuration
 *
 * @param config - ORM configuration object
 *
 * @example
 * ```ts
 * import { setOrmConfig } from "@bunary/orm";
 *
 * setOrmConfig({
 *   database: {
 *     type: "sqlite",
 *     sqlite: { path: "./database.sqlite" }
 *   }
 * });
 * ```
 */
export function setOrmConfig(config: OrmConfig): void {
	globalOrmConfig = config;
}

/**
 * Get the global ORM configuration
 *
 * @returns The current ORM configuration
 * @throws If configuration has not been set
 */
export function getOrmConfig(): OrmConfig {
	if (!globalOrmConfig) {
		throw new Error(
			"ORM configuration not set. Call setOrmConfig() or defineOrmConfig() first.",
		);
	}
	return globalOrmConfig;
}

/**
 * Clear the global ORM configuration (useful for testing)
 *
 * @internal
 */
export function clearOrmConfig(): void {
	globalOrmConfig = null;
}
