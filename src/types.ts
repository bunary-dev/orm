/**
 * @bunary/orm - Type Definitions
 */

/**
 * Database connection types
 */
export type DatabaseType = "sqlite" | "mysql" | "postgres";

/**
 * SQLite connection configuration
 */
export interface SqliteConfig {
	/** Database file path */
	path: string;
}

/**
 * MySQL connection configuration
 */
export interface MysqlConfig {
	/** Database host */
	host: string;
	/** Database port (default: 3306) */
	port?: number;
	/** Database user */
	user: string;
	/** Database password */
	password: string;
	/** Database name */
	database: string;
}

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
	/** Database type */
	type: DatabaseType;
	/** SQLite-specific configuration (when type is "sqlite") */
	sqlite?: SqliteConfig;
	/** MySQL-specific configuration (when type is "mysql") */
	mysql?: MysqlConfig;
	// Future: postgres?: PostgresConfig;
}

/**
 * ORM configuration
 */
export interface OrmConfig {
	/** Database connection configuration */
	database: DatabaseConfig;
}

/**
 * Model instance data
 */
export type ModelData = Record<string, unknown>;

/**
 * Query builder interface for chainable queries
 */
export interface QueryBuilder {
	/**
	 * Select specific columns
	 * @param columns - Column names to select
	 * @returns QueryBuilder for chaining
	 */
	select(...columns: string[]): QueryBuilder;

	/**
	 * Exclude specific columns from results
	 * @param columns - Column names to exclude
	 * @returns QueryBuilder for chaining
	 */
	exclude(...columns: string[]): QueryBuilder;

	/**
	 * Limit the number of results returned
	 * @param count - Maximum number of results to return
	 * @returns QueryBuilder for chaining
	 */
	limit(count: number): QueryBuilder;

	/**
	 * Skip a number of results (for pagination)
	 * @param count - Number of results to skip
	 * @returns QueryBuilder for chaining
	 */
	offset(count: number): QueryBuilder;

	/**
	 * Order results by a column
	 * @param column - Column name to order by
	 * @param direction - Order direction: "asc" or "desc" (default: "asc")
	 * @returns QueryBuilder for chaining
	 */
	orderBy(column: string, direction?: "asc" | "desc"): QueryBuilder;

	/**
	 * Add a WHERE condition
	 * @param column - Column name
	 * @param operatorOrValue - Operator ("=", ">", "<", etc.) or value (for = operator)
	 * @param value - Value to compare (required if operatorOrValue is an operator)
	 * @returns QueryBuilder for chaining
	 */
	where(
		column: string,
		operatorOrValue: string | number | boolean,
		value?: string | number | boolean,
	): QueryBuilder;

	/**
	 * Execute query and return all results
	 * @returns Promise resolving to array of model instances
	 */
	all(): Promise<ModelData[]>;

	/**
	 * Get the first result
	 * @returns Promise resolving to model instance or null
	 */
	first(): Promise<ModelData | null>;

	/**
	 * Find a record by ID
	 * @param id - The ID to find
	 * @returns Promise resolving to model instance or null
	 */
	find(id: string | number): Promise<ModelData | null>;

	/**
	 * Get the count of matching records
	 * @returns Promise resolving to number of records
	 */
	count(): Promise<number>;
}
