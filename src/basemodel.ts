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

type BaseModelConstructor = typeof BaseModel;

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
	protected static queryForModel(
		modelClass: BaseModelConstructor,
	): QueryBuilder {
		if (!modelClass.tableName) {
			throw new Error(
				`Model ${modelClass.name} must define a tableName property`,
			);
		}

		let query = Model.table(modelClass.tableName);

		// Get fields to exclude
		const fieldsToExclude = BaseModel.getFieldsToExcludeForModel(modelClass);

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
	protected static getFieldsToExcludeForModel(
		modelClass: BaseModelConstructor,
	): string[] {
		const excluded: string[] = [];

		// Add protected fields
		if (modelClass.protected && Array.isArray(modelClass.protected)) {
			excluded.push(...modelClass.protected);
		}

		// Add timestamp fields
		const timestampFields = BaseModel.getTimestampFieldsForModel(modelClass);
		if (timestampFields.length > 0) {
			excluded.push(...timestampFields);
		}

		return excluded;
	}

	/**
	 * Get the timestamp fields that should be excluded
	 * Returns empty array if timestamps are disabled
	 */
	protected static getTimestampFieldsForModel(
		modelClass: BaseModelConstructor,
	): string[] {
		// If timestamps is explicitly false, don't exclude any
		if (modelClass.timestamps === false) {
			return [];
		}

		// If timestamps is true or undefined, use default timestamps
		if (modelClass.timestamps === true || modelClass.timestamps === undefined) {
			return ["createdAt", "updatedAt"];
		}

		// If timestamps is an array, use those fields
		if (Array.isArray(modelClass.timestamps)) {
			return modelClass.timestamps;
		}

		return [];
	}

	/**
	 * Apply field exclusions to a result
	 * This is used when results come from methods that bypass the query builder
	 */
	protected static applyExclusionsForModel(
		modelClass: BaseModelConstructor,
		data: ModelData | null,
	): ModelData | null {
		if (!data) {
			return null;
		}

		const fieldsToExclude = BaseModel.getFieldsToExcludeForModel(modelClass);
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
	protected static applyExclusionsToArrayForModel(
		modelClass: BaseModelConstructor,
		data: ModelData[],
	): ModelData[] {
		return data.map(
			(item) =>
				BaseModel.applyExclusionsForModel(modelClass, item) as ModelData,
		);
	}

	/**
	 * Create a wrapped QueryBuilder that applies exclusions to results
	 * This is needed when select() is used, since select() takes precedence over exclude()
	 */
	protected static createWrappedQueryBuilderForModel(
		modelClass: BaseModelConstructor,
		query: QueryBuilder,
	): QueryBuilder {
		// Create a wrapper object that implements QueryBuilder
		return {
			select: (...columns: string[]) => {
				const result = query.select(...columns);
				return BaseModel.createWrappedQueryBuilderForModel(modelClass, result);
			},
			exclude: (...columns: string[]) => {
				const result = query.exclude(...columns);
				return BaseModel.createWrappedQueryBuilderForModel(modelClass, result);
			},
			where: (
				column: string,
				operatorOrValue: string | number | boolean,
				value?: string | number | boolean,
			) => {
				const result = query.where(column, operatorOrValue, value);
				return BaseModel.createWrappedQueryBuilderForModel(modelClass, result);
			},
			limit: (count: number) => {
				const result = query.limit(count);
				return BaseModel.createWrappedQueryBuilderForModel(modelClass, result);
			},
			offset: (count: number) => {
				const result = query.offset(count);
				return BaseModel.createWrappedQueryBuilderForModel(modelClass, result);
			},
			orderBy: (column: string, direction?: "asc" | "desc") => {
				const result = query.orderBy(column, direction);
				return BaseModel.createWrappedQueryBuilderForModel(modelClass, result);
			},
			all: async () => {
				const results = await query.all();
				return BaseModel.applyExclusionsToArrayForModel(modelClass, results);
			},
			find: async (id: string | number) => {
				const result = await query.find(id);
				return BaseModel.applyExclusionsForModel(modelClass, result);
			},
			first: async () => {
				const result = await query.first();
				return BaseModel.applyExclusionsForModel(modelClass, result);
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
		// In TypeScript, 'this' in static methods refers to the class the method was called on.
		// When Users.find() is called, 'this' refers to Users (the subclass), not BaseModel.
		// This is the correct behavior for Eloquent-like inheritance and is required for the API.
		// Biome's noThisInStatic rule is disabled in biome.json for this legitimate use case.
		const modelClass = this as unknown as BaseModelConstructor;
		const result = await BaseModel.queryForModel(modelClass).find(id);
		return BaseModel.applyExclusionsForModel(modelClass, result);
	}

	/**
	 * Get all records
	 */
	static async all(): Promise<ModelData[]> {
		const modelClass = this as unknown as BaseModelConstructor;
		const results = await BaseModel.queryForModel(modelClass).all();
		return BaseModel.applyExclusionsToArrayForModel(modelClass, results);
	}

	/**
	 * Select specific columns
	 * Note: Protected fields and timestamps are still excluded even if selected
	 * This is handled by applying exclusions to results after the query executes
	 */
	static select(...columns: string[]): QueryBuilder {
		const modelClass = this as unknown as BaseModelConstructor;
		// Create a query builder with select
		const baseQuery = Model.table(modelClass.tableName);
		const selectQuery = baseQuery.select(...columns);

		// Return a wrapped query builder that applies exclusions to results
		return BaseModel.createWrappedQueryBuilderForModel(modelClass, selectQuery);
	}

	/**
	 * Exclude specific columns
	 * This adds to the protected fields and timestamps exclusion
	 */
	static exclude(...columns: string[]): QueryBuilder {
		const modelClass = this as unknown as BaseModelConstructor;
		const query = BaseModel.queryForModel(modelClass);
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
		const modelClass = this as unknown as BaseModelConstructor;
		return BaseModel.queryForModel(modelClass).where(
			column,
			operatorOrValue,
			value,
		);
	}

	/**
	 * Limit the number of results
	 */
	static limit(count: number): QueryBuilder {
		const modelClass = this as unknown as BaseModelConstructor;
		return BaseModel.queryForModel(modelClass).limit(count);
	}

	/**
	 * Offset the results
	 */
	static offset(count: number): QueryBuilder {
		const modelClass = this as unknown as BaseModelConstructor;
		return BaseModel.queryForModel(modelClass).offset(count);
	}

	/**
	 * Order the results
	 */
	static orderBy(column: string, direction?: "asc" | "desc"): QueryBuilder {
		const modelClass = this as unknown as BaseModelConstructor;
		return BaseModel.queryForModel(modelClass).orderBy(column, direction);
	}

	/**
	 * Get the first record
	 */
	static async first(): Promise<ModelData | null> {
		const modelClass = this as unknown as BaseModelConstructor;
		const result = await BaseModel.queryForModel(modelClass).first();
		return BaseModel.applyExclusionsForModel(modelClass, result);
	}

	/**
	 * Count the records
	 */
	static async count(): Promise<number> {
		const modelClass = this as unknown as BaseModelConstructor;
		return BaseModel.queryForModel(modelClass).count();
	}
}
