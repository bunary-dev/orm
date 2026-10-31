/**
 * @bunary/orm - Errors
 */

/**
 * Thrown by `findOrFail()`, and by `save()` / `refresh()` when the instance's
 * row no longer exists.
 *
 * @example
 * ```ts
 * try {
 *   await User.findOrFail(42);
 * } catch (error) {
 *   if (error instanceof ModelNotFoundError) {
 *     console.log(error.table, error.id); // "users", 42
 *   }
 * }
 * ```
 */
export class ModelNotFoundError extends Error {
	override readonly name = "ModelNotFoundError";

	constructor(
		/** Name of the table that was queried */
		readonly table: string,
		/** Primary key value that was looked up */
		readonly id: unknown,
	) {
		super(`No row in "${table}" with primary key ${String(id)}`);
	}
}
