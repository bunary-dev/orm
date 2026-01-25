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

import { Model, type QueryBuilder, type ModelData } from "./index.js";

// biome-ignore lint/complexity/noStaticOnlyClass: Eloquent-like API requires static methods with inheritance
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
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass, not BaseModel
	protected static query(): QueryBuilder {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		if (!this.tableName) {
			// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
			throw new Error(
				// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
				`Model ${this.constructor.name} must define a tableName property`,
			);
		}

		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		let query = Model.table(this.tableName);

		// Get fields to exclude
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
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
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	protected static getFieldsToExclude(): string[] {
		const excluded: string[] = [];

		// Add protected fields
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		if (this.protected && Array.isArray(this.protected)) {
			// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
			excluded.push(...this.protected);
		}

		// Add timestamp fields
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
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
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	protected static getTimestampFields(): string[] {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		// If timestamps is explicitly false, don't exclude any
		if (this.timestamps === false) {
			return [];
		}

		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		// If timestamps is true or undefined, use default timestamps
		if (this.timestamps === true || this.timestamps === undefined) {
			return ["createdAt", "updatedAt"];
		}

		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		// If timestamps is an array, use those fields
		if (Array.isArray(this.timestamps)) {
			// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
			return this.timestamps;
		}

		return [];
	}

	/**
	 * Apply field exclusions to a result
	 * This is used when results come from methods that bypass the query builder
	 */
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	protected static applyExclusions(data: ModelData | null): ModelData | null {
		if (!data) {
			return null;
		}

		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
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
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	protected static applyExclusionsToArray(
		data: ModelData[],
	): ModelData[] {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		return data.map((item) => this.applyExclusions(item) as ModelData);
	}

	/**
	 * Create a wrapped QueryBuilder that applies exclusions to results
	 * This is needed when select() is used, since select() takes precedence over exclude()
	 */
	protected static createWrappedQueryBuilder(
		query: QueryBuilder,
	): QueryBuilder {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		const modelClass = this;

		// Create a wrapper object that implements QueryBuilder
		return {
			select: (...columns: string[]) => {
				const result = query.select(...columns);
				return modelClass.createWrappedQueryBuilder(result);
			},
			exclude: (...columns: string[]) => {
				const result = query.exclude(...columns);
				return modelClass.createWrappedQueryBuilder(result);
			},
			where: (
				column: string,
				operatorOrValue: string | number | boolean,
				value?: string | number | boolean,
			) => {
				const result = query.where(column, operatorOrValue, value);
				return modelClass.createWrappedQueryBuilder(result);
			},
			limit: (count: number) => {
				const result = query.limit(count);
				return modelClass.createWrappedQueryBuilder(result);
			},
			offset: (count: number) => {
				const result = query.offset(count);
				return modelClass.createWrappedQueryBuilder(result);
			},
			orderBy: (column: string, direction?: "asc" | "desc") => {
				const result = query.orderBy(column, direction);
				return modelClass.createWrappedQueryBuilder(result);
			},
			all: async () => {
				const results = await query.all();
				return modelClass.applyExclusionsToArray(results);
			},
			find: async (id: string | number) => {
				const result = await query.find(id);
				return modelClass.applyExclusions(result);
			},
			first: async () => {
				const result = await query.first();
				return modelClass.applyExclusions(result);
			},
			count: async () => {
				return query.count();
			},
		} as QueryBuilder;
	}

	/**
	 * Find a record by ID
	 */
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	static async find(id: string | number): Promise<ModelData | null> {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		const result = await this.query().find(id);
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		return this.applyExclusions(result);
	}

	/**
	 * Get all records
	 */
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	static async all(): Promise<ModelData[]> {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		const results = await this.query().all();
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		return this.applyExclusionsToArray(results);
	}

	/**
	 * Select specific columns
	 * Note: Protected fields and timestamps are still excluded even if selected
	 * This is handled by applying exclusions to results after the query executes
	 */
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	static select(...columns: string[]): QueryBuilder {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		// Create a query builder with select
		const baseQuery = Model.table(this.tableName);
		const selectQuery = baseQuery.select(...columns);

		// Return a wrapped query builder that applies exclusions to results
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		return this.createWrappedQueryBuilder(selectQuery);
	}

	/**
	 * Exclude specific columns
	 * This adds to the protected fields and timestamps exclusion
	 */
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	static exclude(...columns: string[]): QueryBuilder {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		const query = this.query();
		return query.exclude(...columns);
	}

	/**
	 * Add a where clause
	 */
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	static where(
		column: string,
		operatorOrValue: string | number | boolean,
		value?: string | number | boolean,
	): QueryBuilder {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		return this.query().where(column, operatorOrValue, value);
	}

	/**
	 * Limit the number of results
	 */
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	static limit(count: number): QueryBuilder {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		return this.query().limit(count);
	}

	/**
	 * Offset the results
	 */
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	static offset(count: number): QueryBuilder {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		return this.query().offset(count);
	}

	/**
	 * Order the results
	 */
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	static orderBy(
		column: string,
		direction?: "asc" | "desc",
	): QueryBuilder {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		return this.query().orderBy(column, direction);
	}

	/**
	 * Get the first record
	 */
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	static async first(): Promise<ModelData | null> {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		const result = await this.query().first();
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		return this.applyExclusions(result);
	}

	/**
	 * Count the records
	 */
	// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
	static async count(): Promise<number> {
		// biome-ignore lint/complexity/noThisInStatic: Need 'this' to refer to subclass
		return this.query().count();
	}
}
