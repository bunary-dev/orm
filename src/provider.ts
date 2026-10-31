/**
 * @bunary/orm/provider - @bunary/core integration
 *
 * Published on its own subpath: `@bunary/core` is an optional peer, and a
 * runtime import of it from the main entry would fail without it.
 */
import { Database } from "bun:sqlite";
import {
	type Application,
	BunaryError,
	createToken,
	type Provider,
} from "@bunary/core";
import { SQL } from "bun";
import { drizzle as drizzlePostgres } from "drizzle-orm/bun-sql";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import type { AnyDatabase } from "./types.js";

// Also keeps the BunaryConfig augmentation (`database`) in this entry's types.
export type {
	DatabaseConfig,
	PostgresDatabaseConfig,
	SqliteDatabaseConfig,
} from "./config.js";

/**
 * Token the Drizzle database built by {@link ormProvider} is bound under.
 * It is typed as any supported database; cast it to the database type of
 * your dialect and schema to define models on it.
 *
 * @example
 * ```ts
 * import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
 * import { DatabaseToken } from "@bunary/orm/provider";
 * import * as schema from "./schema";
 *
 * const db = app.get(DatabaseToken) as BunSQLiteDatabase<typeof schema>;
 * const User = defineModel(db, schema.users);
 * ```
 */
export const DatabaseToken = createToken<AnyDatabase>("orm.database");

/** Options for {@link ormProvider}. */
export interface OrmProviderOptions {
	/**
	 * Drizzle schema (tables and `relations()`) passed to `drizzle()`;
	 * needed for `with()` eager loading and `db.query`.
	 */
	schema?: Record<string, unknown>;
}

function fail(message: string): never {
	throw new BunaryError(`BunaryConfig: ${message}`);
}

function nonEmpty(value: unknown, key: string): string {
	if (typeof value !== "string" || value === "") {
		fail(`"database.${key}" must be a non-empty string`);
	}
	return value;
}

/** Build the Drizzle database for a `database` config value. */
function createDatabase(config: unknown, schema?: Record<string, unknown>) {
	if (config === undefined) {
		fail('"database" is required by ormProvider');
	}
	if (typeof config !== "object" || config === null || Array.isArray(config)) {
		fail('"database" must be an object');
	}
	const { dialect, path, url } = config as Record<string, unknown>;
	if (dialect === "sqlite") {
		const client = new Database(nonEmpty(path, "path"));
		return drizzleSqlite({ client, schema });
	}
	if (dialect === "postgres") {
		const client = new SQL(nonEmpty(url, "url"));
		return drizzlePostgres({ client, schema });
	}
	return fail('"database.dialect" must be "sqlite" or "postgres"');
}

/**
 * A `@bunary/core` provider that builds the Drizzle database described by the
 * `database` config key (SQLite via `drizzle-orm/bun-sqlite`, Postgres via
 * `drizzle-orm/bun-sql`) and binds it under {@link DatabaseToken}. Each app
 * gets its own database; models still take it explicitly with
 * `defineModel(db, table)`.
 *
 * @throws {BunaryError} (as a rejection of `app.boot()`) if `database` is
 * missing or invalid
 *
 * @example
 * ```ts
 * import { createApp } from "@bunary/core";
 * import { DatabaseToken, ormProvider } from "@bunary/orm/provider";
 * import * as schema from "./schema";
 *
 * const app = await createApp({
 *   config: {
 *     app: { name: "my-app" },
 *     database: { dialect: "sqlite", path: "app.sqlite" },
 *   },
 *   providers: [ormProvider({ schema })],
 * }).boot();
 *
 * const db = app.get(DatabaseToken);
 * ```
 */
export function ormProvider(options: OrmProviderOptions = {}): Provider {
	return {
		name: "@bunary/orm",
		register(app: Application): void {
			const db = createDatabase(app.config.get().database, options.schema);
			app.set(DatabaseToken, db as AnyDatabase);
		},
	};
}
