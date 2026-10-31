/**
 * @bunary/orm - ORM for Bunary
 *
 * Laravel-style models on top of Drizzle: define your tables with Drizzle,
 * wrap them with `defineModel()` and get CRUD with dirty tracking. Supports
 * SQLite (`drizzle-orm/bun-sqlite`) and Postgres (`drizzle-orm/bun-sql`).
 *
 * @example
 * ```ts
 * import { Database } from "bun:sqlite";
 * import { eq } from "drizzle-orm";
 * import { drizzle } from "drizzle-orm/bun-sqlite";
 * import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
 * import { defineModel } from "@bunary/orm";
 *
 * const users = sqliteTable("users", {
 *   id: integer().primaryKey({ autoIncrement: true }),
 *   email: text().notNull(),
 * });
 * const User = defineModel(drizzle(new Database("app.sqlite")), users);
 *
 * const user = await User.create({ email: "ada@example.com" });
 * user.email = "ada@lovelace.dev";
 * await user.save();
 * const found = await User.where(eq(users.email, "ada@lovelace.dev")).first();
 * ```
 */

export { ModelNotFoundError } from "./errors.js";
export { defineModel } from "./model.js";
export type {
	AnyDatabase,
	DefineModelOptions,
	InstanceMethods,
	Model,
	ModelInstance,
	NewRowOf,
	PrimaryKeyColumn,
	QueryOptions,
	RowOf,
	SelectQuery,
	TableFor,
	TransactionFor,
	WhereQuery,
} from "./types.js";
