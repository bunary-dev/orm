import type { OrmConfig } from "./types.js";

let globalOrmConfig: OrmConfig | null = null;
let shouldUseCoreConfig = false;
let coreConfigCache: OrmConfig | null = null;

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
 * This will override any ORM config from @bunary/core.
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
	shouldUseCoreConfig = false; // Override core config when explicitly set
	coreConfigCache = null; // Clear cache when explicitly setting
}

/**
 * Get the global ORM configuration
 *
 * If `useCoreConfig` is true, attempts to read from @bunary/core config first,
 * then falls back to the ORM-specific config if set.
 *
 * @returns The current ORM configuration
 * @throws If configuration has not been set
 */
function tryGetCoreConfig(): OrmConfig | null {
	// Try to get from core config
	// This works if core has been loaded and defineConfig() has been called
	try {
		const coreModuleId = "@bunary/core";
		// biome-ignore lint/suspicious/noExplicitAny: Core module type is dynamic
		let coreModule: any = null;

		// Try to get from Bun's module cache first (fastest)
		// biome-ignore lint/suspicious/noExplicitAny: Bun internal API
		const moduleCache = (globalThis as any).__bun?.moduleCache;
		if (moduleCache?.[coreModuleId]) {
			coreModule = moduleCache[coreModuleId].exports;
		} else {
			// Fallback: try require (works in Bun runtime)
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			coreModule = require(coreModuleId);
		}

		// Check if getBunaryConfig exists
		if (coreModule?.getBunaryConfig) {
			const coreConfig = coreModule.getBunaryConfig();
			if (coreConfig?.orm) {
				coreConfigCache = coreConfig.orm;
				return coreConfig.orm;
			}
		}
	} catch {
		// Core not available, not loaded yet, or require doesn't work
		// This is expected if core config hasn't been set up yet
		// Fall back to explicit ORM config
	}
	return null;
}

export function getOrmConfig(): OrmConfig {
	// If we have an explicit ORM config, use it (overrides core)
	if (globalOrmConfig) {
		return globalOrmConfig;
	}

	// Try cached core config first
	if (coreConfigCache) {
		return coreConfigCache;
	}

	// Always try to get from core config if no explicit config is set
	// This allows ORM to work automatically with core config
	const coreConfig = tryGetCoreConfig();
	if (coreConfig) {
		return coreConfig;
	}

	// Also try if explicitly enabled
	if (shouldUseCoreConfig) {
		const coreConfig2 = tryGetCoreConfig();
		if (coreConfig2) {
			return coreConfig2;
		}
	}

	// No config found anywhere
	throw new Error(
		"ORM configuration not set. Call setOrmConfig() or defineOrmConfig() first, or configure via @bunary/core defineConfig({ orm: {...} }).",
	);
}

/**
 * Enable reading ORM config from @bunary/core
 *
 * When enabled, getOrmConfig() will first check @bunary/core config for ORM settings.
 * You can still override with setOrmConfig() if needed.
 *
 * @example
 * ```ts
 * import { enableCoreConfig } from "@bunary/orm";
 *
 * // Enable reading from core config
 * enableCoreConfig();
 * ```
 */
export function enableCoreConfig(): void {
	shouldUseCoreConfig = true;
}

/**
 * Clear the global ORM configuration (useful for testing)
 *
 * @internal
 */
export function clearOrmConfig(): void {
	globalOrmConfig = null;
	shouldUseCoreConfig = false;
	coreConfigCache = null;
}
