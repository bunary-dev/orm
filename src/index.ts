/**
 * @bunary/orm - ORM for Bunary
 *
 * A Bun-first ORM inspired by Laravel Eloquent with database abstraction layer.
 * Supports SQLite (MVP), with MySQL and PostgreSQL coming soon.
 *
 * @example
 * ```ts
 * import { Model, setOrmConfig } from "@bunary/orm";
 *
 * // Configure the ORM with credentials
 * setOrmConfig({
 *   database: {
 *     type: "sqlite",
 *     sqlite: {
 *       path: "./database.sqlite"
 *     }
 *   }
 * });
 *
 * // Or for MySQL (when implemented):
 * // setOrmConfig({
 * //   database: {
 * //     type: "mysql",
 * //     mysql: {
 * //       host: "localhost",
 * //       user: "root",
 * //       password: "password",
 * //       database: "mydb"
 * //     }
 * //   }
 * // });
 *
 * // Query the database through models
 * const user = await Model.table("users").find(1);
 * const users = await Model.table("users").all();
 * const users = await Model.table("users")
 *   .select("id", "name")
 *   .exclude("password")
 *   .all();
 * ```
 */

export { BaseModel } from "./basemodel.js";
// Configuration
export {
	clearOrmConfig,
	defineOrmConfig,
	enableCoreConfig,
	getOrmConfig,
	setOrmConfig,
} from "./config.js";
// Connection Management
export {
	clearDriverRegistry,
	closeDriver,
	createDriver,
	type DriverFactory,
	getDriver,
	registerDriver,
	resetDriver,
} from "./connection.js";
// Database Drivers
export { MysqlDriver, SqliteDriver } from "./drivers/index.js";
export type { DatabaseDriver, QueryResult } from "./drivers/types.js";
export type {
	MigrationModule,
	MigrationRecord,
	MigrationStatus,
	MigratorOptions,
} from "./migrations/index.js";
// Migrations repository
// Migrator runner
export {
	createMigrator,
	MigrationsRepository,
	Migrator,
} from "./migrations/index.js";
// Model
export { Model } from "./model.js";
export type { TableBuilder, TableBuilderCallback } from "./schema/index.js";
// Schema builder
export { Schema } from "./schema/index.js";

// Types
export type {
	DatabaseConfig,
	DatabaseType,
	ModelData,
	MysqlConfig,
	OrmConfig,
	QueryBuilder,
	SqliteConfig,
} from "./types.js";
