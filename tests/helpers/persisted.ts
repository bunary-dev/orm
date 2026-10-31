/**
 * Narrow the result of `create()` / `save()` to the instance, failing the
 * test if a listener cancelled the write.
 */
export function persisted<T>(result: T | false): T {
	if (result === false) throw new Error("write was cancelled by a listener");
	return result;
}
