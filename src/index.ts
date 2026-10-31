/**
 * @bunary/orm - ORM for Bunary
 *
 * Laravel-style models on top of Drizzle: define your tables with Drizzle,
 * wrap them with `defineModel()` and get CRUD with dirty tracking, model
 * events, hidden columns, soft deletes, named scopes and eager loading of
 * Drizzle relations with `with()`. Supports
 * SQLite (`drizzle-orm/bun-sqlite`) and Postgres (`drizzle-orm/bun-sql`).
 * The `@bunary/core` integration (`ormProvider`, `DatabaseToken`) is on the
 * `@bunary/orm/provider` subpath.
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
 * if (!user) throw new Error("cancelled by a listener");
 * user.email = "ada@lovelace.dev";
 * await user.save();
 * const found = await User.where(eq(users.email, "ada@lovelace.dev")).first();
 * ```
 */

export type {
	DatabaseConfig,
	PostgresDatabaseConfig,
	SqliteDatabaseConfig,
} from "./config.js";
export { ModelNotFoundError } from "./errors.js";
export { defineModel } from "./model.js";
export type {
	AnyDatabase,
	CheckRelationNames,
	CheckReservedColumns,
	CheckReservedScopes,
	DefineModelOptions,
	InstanceMethods,
	InstanceOf,
	LoadedRelations,
	Model,
	ModelEvent,
	ModelEventTargets,
	ModelInstance,
	ModelListener,
	ModelListeners,
	ModelMethods,
	ModelQuery,
	NewRowOf,
	NoRelations,
	NoScopes,
	PrimaryKeyColumn,
	QueryMethods,
	QueryOptions,
	RelatedModel,
	RelationsJson,
	RelationsOf,
	ReservedColumnName,
	ReservedScopeName,
	RowOf,
	Scope,
	ScopeConstraint,
	ScopeMap,
	ScopeMethods,
	ScopesOf,
	SelectQuery,
	SoftDeleteInstanceMethods,
	SoftDeleteQueryMethods,
	SoftDeletesRequiresDeletedAt,
	SupportsSoftDeletes,
	TableFor,
	TransactionFor,
	WithRelations,
} from "./types.js";
