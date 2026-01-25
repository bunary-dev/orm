/**
 * Query Builder - Builds and executes SQL queries
 */
import { getDriver } from "./connection.js";
import type { ModelData, QueryBuilder } from "./types.js";

/**
 * Where condition
 */
interface WhereCondition {
	column: string;
	operator: string;
	value: unknown;
}

/**
 * Order by clause
 */
interface OrderByClause {
	column: string;
	direction: "asc" | "desc";
}

/**
 * Internal query builder state
 */
interface QueryState {
	table: string;
	selectColumns?: string[];
	excludeColumns?: string[];
	limitCount?: number;
	offsetCount?: number;
	orderByClause?: OrderByClause;
	whereConditions: WhereCondition[];
}

/**
 * Query Builder implementation
 */
export class QueryBuilderImpl implements QueryBuilder {
	private state: QueryState;

	constructor(table: string) {
		this.state = {
			table,
			whereConditions: [],
		};
	}

	/**
	 * Select specific columns
	 */
	select(...columns: string[]): QueryBuilder {
		if (!this.state.selectColumns) {
			this.state.selectColumns = [];
		}
		this.state.selectColumns.push(...columns);
		return this;
	}

	/**
	 * Exclude specific columns from results
	 */
	exclude(...columns: string[]): QueryBuilder {
		if (!this.state.excludeColumns) {
			this.state.excludeColumns = [];
		}
		this.state.excludeColumns.push(...columns);
		return this;
	}

	/**
	 * Limit the number of results returned
	 */
	limit(count: number): QueryBuilder {
		this.state.limitCount = count;
		return this;
	}

	/**
	 * Skip a number of results (for pagination)
	 */
	offset(count: number): QueryBuilder {
		this.state.offsetCount = count;
		return this;
	}

	/**
	 * Order results by a column
	 */
	orderBy(column: string, direction: "asc" | "desc" = "asc"): QueryBuilder {
		this.state.orderByClause = {
			column,
			direction,
		};
		return this;
	}

	/**
	 * Add a WHERE condition
	 */
	where(
		column: string,
		operatorOrValue: string | number | boolean,
		value?: string | number | boolean,
	): QueryBuilder {
		let operator: string;
		let conditionValue: unknown;

		// If value is provided, operatorOrValue is the operator
		if (value !== undefined) {
			operator = String(operatorOrValue);
			conditionValue = value;
		} else {
			// Otherwise, operatorOrValue is the value and operator is "="
			operator = "=";
			conditionValue = operatorOrValue;
		}

		this.state.whereConditions.push({
			column,
			operator,
			value: conditionValue,
		});

		return this;
	}

	/**
	 * Execute query and return all results
	 */
	async all(): Promise<ModelData[]> {
		const driver = getDriver();
		const { sql, params } = this.buildSelectQuery();
		const results =
			params.length > 0
				? driver.query(sql, ...params).all()
				: driver.query(sql).all();

		// Apply column filtering
		return this.filterColumns(results);
	}

	/**
	 * Get the first result
	 */
	async first(): Promise<ModelData | null> {
		const driver = getDriver();
		// Use limit(1) for first()
		const originalLimit = this.state.limitCount;
		this.state.limitCount = 1;
		const { sql, params } = this.buildSelectQuery();
		const result =
			params.length > 0
				? driver.query(sql, ...params).get()
				: driver.query(sql).get();

		// Restore original limit
		this.state.limitCount = originalLimit;

		if (!result) {
			return null;
		}

		// Apply column filtering
		const filtered = this.filterColumns([result]);
		return filtered[0] || null;
	}

	/**
	 * Get the count of matching records
	 */
	async count(): Promise<number> {
		const driver = getDriver();
		const { sql, params } = this.buildCountQuery();
		const result =
			params.length > 0
				? driver.query(sql, ...params).get()
				: driver.query(sql).get();

		if (!result) {
			return 0;
		}

		// COUNT(*) returns { "COUNT(*)": number } in SQLite
		const countValue = result["COUNT(*)"] || result["count(*)"] || 0;
		return Number(countValue);
	}

	/**
	 * Find a record by ID
	 */
	async find(id: string | number): Promise<ModelData | null> {
		const driver = getDriver();
		// For find(), we use a simple WHERE id = ? query
		// Ignore other where conditions, limit, offset, orderBy for find()
		const baseQuery = this.buildSelectQueryWithoutLimit();
		const sql = `${baseQuery} WHERE id = ?`;
		const result = driver.query(sql, id).get();

		if (!result) {
			return null;
		}

		// Apply column filtering
		const filtered = this.filterColumns([result]);
		return filtered[0] || null;
	}

	/**
	 * Build the SELECT query SQL with parameters
	 */
	private buildSelectQuery(): { sql: string; params: unknown[] } {
		const baseQuery = this.buildSelectQueryWithoutLimit();
		const params: unknown[] = [];
		let sql = baseQuery;

		// Add WHERE clause
		if (this.state.whereConditions.length > 0) {
			const whereClauses: string[] = [];
			for (const condition of this.state.whereConditions) {
				whereClauses.push(`${condition.column} ${condition.operator} ?`);
				params.push(condition.value);
			}
			sql += ` WHERE ${whereClauses.join(" AND ")}`;
		}

		// Add ORDER BY clause
		if (this.state.orderByClause) {
			sql += ` ORDER BY ${this.state.orderByClause.column} ${this.state.orderByClause.direction.toUpperCase()}`;
		}

		// Add LIMIT and OFFSET clauses
		// SQLite syntax: LIMIT count OFFSET offset
		if (
			this.state.limitCount !== undefined &&
			this.state.offsetCount !== undefined
		) {
			sql += ` LIMIT ${this.state.limitCount} OFFSET ${this.state.offsetCount}`;
		} else if (this.state.limitCount !== undefined) {
			sql += ` LIMIT ${this.state.limitCount}`;
		} else if (this.state.offsetCount !== undefined) {
			sql += ` LIMIT -1 OFFSET ${this.state.offsetCount}`;
		}

		return { sql, params };
	}

	/**
	 * Build the SELECT query SQL without WHERE/ORDER BY/LIMIT/OFFSET clauses
	 * (used by find() which adds its own WHERE clause)
	 */
	private buildSelectQueryWithoutLimit(): string {
		if (this.state.selectColumns && this.state.selectColumns.length > 0) {
			// Select specific columns
			const columns = this.state.selectColumns.join(", ");
			return `SELECT ${columns} FROM ${this.state.table}`;
		}

		// Select all columns
		return `SELECT * FROM ${this.state.table}`;
	}

	/**
	 * Build the COUNT query SQL with parameters
	 */
	private buildCountQuery(): { sql: string; params: unknown[] } {
		let sql = `SELECT COUNT(*) FROM ${this.state.table}`;
		const params: unknown[] = [];

		// Add WHERE clause
		if (this.state.whereConditions.length > 0) {
			const whereClauses: string[] = [];
			for (const condition of this.state.whereConditions) {
				whereClauses.push(`${condition.column} ${condition.operator} ?`);
				params.push(condition.value);
			}
			sql += ` WHERE ${whereClauses.join(" AND ")}`;
		}

		return { sql, params };
	}

	/**
	 * Filter columns from results based on select/exclude
	 */
	private filterColumns(results: ModelData[]): ModelData[] {
		// If select() was used, only include those columns
		if (this.state.selectColumns && this.state.selectColumns.length > 0) {
			return results.map((row) => {
				const filtered: ModelData = {};
				const columns = this.state.selectColumns;
				if (columns) {
					for (const col of columns) {
						if (col in row) {
							filtered[col] = row[col];
						}
					}
				}
				return filtered;
			});
		}

		// If exclude() was used, remove those columns
		if (this.state.excludeColumns && this.state.excludeColumns.length > 0) {
			return results.map((row) => {
				const filtered: ModelData = { ...row };
				const columns = this.state.excludeColumns;
				if (columns) {
					for (const col of columns) {
						delete filtered[col];
					}
				}
				return filtered;
			});
		}

		// No filtering needed
		return results;
	}
}
