/**
 * @bunary/orm - the `database` configuration key
 */

/**
 * SQLite through `bun:sqlite` and `drizzle-orm/bun-sqlite`.
 *
 * @example
 * ```ts
 * const database: SqliteDatabaseConfig = { dialect: "sqlite", path: "app.sqlite" };
 * ```
 */
export interface SqliteDatabaseConfig {
	dialect: "sqlite";
	/** Database file path, or `":memory:"`. */
	path: string;
}

/**
 * Postgres through `Bun.SQL` and `drizzle-orm/bun-sql`.
 *
 * @example
 * ```ts
 * const database: PostgresDatabaseConfig = {
 *   dialect: "postgres",
 *   url: "postgres://user:pass@localhost:5432/app",
 * };
 * ```
 */
export interface PostgresDatabaseConfig {
	dialect: "postgres";
	/** Connection URL. */
	url: string;
}

/**
 * The `database` key of the Bunary config, read by `ormProvider` from
 * `@bunary/orm/provider`.
 *
 * @example
 * ```ts
 * import { defineConfig } from "@bunary/core";
 *
 * export default defineConfig({
 *   app: { name: "my-app" },
 *   database: { dialect: "sqlite", path: "app.sqlite" },
 * });
 * ```
 */
export type DatabaseConfig = SqliteDatabaseConfig | PostgresDatabaseConfig;

// Each package augments core's BunaryConfig itself. The type-only import
// pulls @bunary/core into the program so the augmentation resolves when
// building; it is elided from the emitted .d.ts, so consumers without the
// optional @bunary/core peer are unaffected (an augmentation of a missing
// module is ignored in .d.ts files).
import type {} from "@bunary/core";

declare module "@bunary/core" {
	interface BunaryConfig {
		/** Database connection, read by `ormProvider` (`@bunary/orm`). */
		database?: DatabaseConfig;
	}
}
