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
	createDriver,
	getDriver,
	registerDriver,
	clearDriverRegistry,
	closeDriver,
	resetDriver,
	type DriverFactory,
} from "./connection.js";

// Model
export { Model } from "./model.js";
export { BaseModel } from "./basemodel.js";

// Database Drivers
export { SqliteDriver, MysqlDriver } from "./drivers/index.js";
export type { DatabaseDriver, QueryResult } from "./drivers/types.js";

// Types
export type {
	DatabaseType,
	DatabaseConfig,
	SqliteConfig,
	MysqlConfig,
	OrmConfig,
	ModelData,
	QueryBuilder,
} from "./types.js";
