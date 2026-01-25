/**
 * BaseModel - Base class for Eloquent-like models
 *
 * Extend this class to create model classes that map to database tables.
 * Each model should set the `tableName` property to the table it represents.
 *
 * Features:
 * - Automatic exclusion of protected fields (like Laravel's $guarded)
 * - Automatic exclusion of timestamps (createdAt, updatedAt by default)
 * - All query builder methods available as static methods
 *
 * @example
 * ```ts
 * class Users extends BaseModel {
 *   protected static tableName = "users";
 *   protected static protected = ["password", "secret_key"];
 *   protected static timestamps = true; // or ["createdAt", "updatedAt"] or false
 * }
 *
 * // Then use it like:
 * const users = await Users.all(); // password and timestamps automatically excluded
 * const user = await Users.find(1);
 * ```
 */

import { Model, type ModelData, type QueryBuilder } from "./index.js";

export abstract class BaseModel {
	/**
	 * The table name this model represents
	 * Must be set by subclasses
	 */
	protected static tableName: string;

	/**
	 * Fields that should be automatically excluded from query results
	 * Similar to Laravel's $guarded property
	 *
	 * @example
	 * ```ts
	 * protected static protected = ["password", "secret_key"];
	 * ```
	 */
	protected static protected?: string[];

	/**
	 * Timestamp fields configuration
	 * - `true` or `["createdAt", "updatedAt"]` - Exclude default timestamps
	 * - `false` - Don't exclude timestamps
	 * - `string[]` - Custom timestamp fields to exclude
	 *
	 * @example
	 * ```ts
	 * protected static timestamps = true; // Exclude createdAt, updatedAt
	 * protected static timestamps = false; // Don't exclude timestamps
	 * protected static timestamps = ["createdAt"]; // Only exclude createdAt
	 * ```
	 */
	protected static timestamps?: boolean | string[];

	/**
	 * Get a query builder instance for this model's table
	 * Automatically applies protected fields and timestamps exclusion
	 */
	protected static query(): QueryBuilder {
		if (!this.tableName) {
			throw new Error(
				`Model ${this.constructor.name} must define a tableName property`,
			);
		}

		let query = Model.table(this.tableName);

		// Get fields to exclude
		const fieldsToExclude = this.getFieldsToExclude();

		// If there are fields to exclude, add them to the query
		if (fieldsToExclude.length > 0) {
			query = query.exclude(...fieldsToExclude);
		}

		return query;
	}

	/**
	 * Get the list of fields that should be excluded from queries
	 * Combines protected fields and timestamps
	 */
	protected static getFieldsToExclude(): string[] {
		const excluded: string[] = [];

		// Add protected fields
		if (this.protected && Array.isArray(this.protected)) {
			excluded.push(...this.protected);
		}

		// Add timestamp fields
		const timestampFields = this.getTimestampFields();
		if (timestampFields.length > 0) {
			excluded.push(...timestampFields);
		}

		return excluded;
	}

	/**
	 * Get the timestamp fields that should be excluded
	 * Returns empty array if timestamps are disabled
	 */
	protected static getTimestampFields(): string[] {
		// If timestamps is explicitly false, don't exclude any
		if (this.timestamps === false) {
			return [];
		}

		// If timestamps is true or undefined, use default timestamps
		if (this.timestamps === true || this.timestamps === undefined) {
			return ["createdAt", "updatedAt"];
		}

		// If timestamps is an array, use those fields
		if (Array.isArray(this.timestamps)) {
			return this.timestamps;
		}

		return [];
	}

	/**
	 * Apply field exclusions to a result
	 * This is used when results come from methods that bypass the query builder
	 */
	protected static applyExclusions(data: ModelData | null): ModelData | null {
		if (!data) {
			return null;
		}

		const fieldsToExclude = this.getFieldsToExclude();
		if (fieldsToExclude.length === 0) {
			return data;
		}

		const result = { ...data };
		for (const field of fieldsToExclude) {
			delete result[field];
		}

		return result;
	}

	/**
	 * Apply field exclusions to an array of results
	 */
	protected static applyExclusionsToArray(data: ModelData[]): ModelData[] {
		return data.map((item) => this.applyExclusions(item) as ModelData);
	}

	/**
	 * Create a wrapped QueryBuilder that applies exclusions to results
	 * This is needed when select() is used, since select() takes precedence over exclude()
	 */
	protected static createWrappedQueryBuilder(
		query: QueryBuilder,
	): QueryBuilder {
		const fieldsToExclude = this.getFieldsToExclude();

		// Create a wrapper object that implements QueryBuilder
		return {
			select: (...columns: string[]) => {
				const result = query.select(...columns);
				return this.createWrappedQueryBuilder(result);
			},
			exclude: (...columns: string[]) => {
				const result = query.exclude(...columns);
				return this.createWrappedQueryBuilder(result);
			},
			where: (
				column: string,
				operatorOrValue: string | number | boolean,
				value?: string | number | boolean,
			) => {
				const result = query.where(column, operatorOrValue, value);
				return this.createWrappedQueryBuilder(result);
			},
			limit: (count: number) => {
				const result = query.limit(count);
				return this.createWrappedQueryBuilder(result);
			},
			offset: (count: number) => {
				const result = query.offset(count);
				return this.createWrappedQueryBuilder(result);
			},
			orderBy: (column: string, direction?: "asc" | "desc") => {
				const result = query.orderBy(column, direction);
				return this.createWrappedQueryBuilder(result);
			},
			all: async () => {
				const results = await query.all();
				return this.applyExclusionsToArray(results);
			},
			find: async (id: string | number) => {
				const result = await query.find(id);
				return this.applyExclusions(result);
			},
			first: async () => {
				const result = await query.first();
				return this.applyExclusions(result);
			},
			count: async () => {
				return query.count();
			},
		} as QueryBuilder;
	}

	/**
	 * Find a record by ID
	 */
	static async find(id: string | number): Promise<ModelData | null> {
		const result = await this.query().find(id);
		return this.applyExclusions(result);
	}

	/**
	 * Get all records
	 */
	static async all(): Promise<ModelData[]> {
		const results = await this.query().all();
		return this.applyExclusionsToArray(results);
	}

	/**
	 * Select specific columns
	 * Note: Protected fields and timestamps are still excluded even if selected
	 * This is handled by applying exclusions to results after the query executes
	 */
	static select(...columns: string[]): QueryBuilder {
		// Create a query builder with select
		const baseQuery = Model.table(this.tableName);
		const selectQuery = baseQuery.select(...columns);

		// Return a wrapped query builder that applies exclusions to results
		return this.createWrappedQueryBuilder(selectQuery);
	}

	/**
	 * Exclude specific columns
	 * This adds to the protected fields and timestamps exclusion
	 */
	static exclude(...columns: string[]): QueryBuilder {
		const query = this.query();
		return query.exclude(...columns);
	}

	/**
	 * Add a where clause
	 */
	static where(
		column: string,
		operatorOrValue: string | number | boolean,
		value?: string | number | boolean,
	): QueryBuilder {
		return this.query().where(column, operatorOrValue, value);
	}

	/**
	 * Limit the number of results
	 */
	static limit(count: number): QueryBuilder {
		return this.query().limit(count);
	}

	/**
	 * Offset the results
	 */
	static offset(count: number): QueryBuilder {
		return this.query().offset(count);
	}

	/**
	 * Order the results
	 */
	static orderBy(column: string, direction?: "asc" | "desc"): QueryBuilder {
		return this.query().orderBy(column, direction);
	}

	/**
	 * Get the first record
	 */
	static async first(): Promise<ModelData | null> {
		const result = await this.query().first();
		return this.applyExclusions(result);
	}

	/**
	 * Count the records
	 */
	static async count(): Promise<number> {
		return this.query().count();
	}
}
