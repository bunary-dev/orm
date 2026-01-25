/**
 * Model - Eloquent-like ORM interface
 */
import { QueryBuilderImpl } from "./query-builder.js";
import type { QueryBuilder } from "./types.js";

/**
 * Model class providing Eloquent-like query interface
 *
 * @example
 * ```ts
 * import { Model } from "@bunary/orm";
 *
 * // Find a user by ID
 * const user = await Model.table("users").find(1);
 *
 * // Get all users
 * const users = await Model.table("users").all();
 *
 * // Select specific columns
 * const users = await Model.table("users")
 *   .select("id", "name", "email")
 *   .all();
 *
 * // Exclude columns
 * const users = await Model.table("users")
 *   .exclude("password")
 *   .all();
 * ```
 */
export class Model {
	/**
	 * Start a query for a specific table
	 *
	 * @param tableName - The name of the table to query
	 * @returns QueryBuilder instance for chaining
	 *
	 * @example
	 * ```ts
	 * const users = await Model.table("users").all();
	 * ```
	 */
	static table(tableName: string): QueryBuilder {
		return new QueryBuilderImpl(tableName);
	}
}
