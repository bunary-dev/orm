/**
 * Temp file helpers for tests.
 *
 * Every test that creates a SQLite database or directory under the OS temp
 * dir should get its path from a tracker and call `cleanup()` in an
 * `afterEach`/`afterAll` hook, so `bun test` leaves nothing behind.
 */
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Files SQLite may create next to a database file. */
const SQLITE_SUFFIXES = ["", "-journal", "-wal", "-shm"];

let counter = 0;

/**
 * Remove a SQLite database file and its journal/WAL/shared-memory sidecars.
 * Missing files are ignored.
 */
export function removeSqliteFile(path: string): void {
	for (const suffix of SQLITE_SUFFIXES) {
		rmSync(`${path}${suffix}`, { force: true });
	}
}

/** Remove a directory and everything in it. Missing directories are ignored. */
export function removeDir(path: string): void {
	rmSync(path, { recursive: true, force: true });
}

export interface TempFiles {
	/** Unique `<tmpdir>/<prefix>-….sqlite` path, removed (with sidecars) on cleanup. */
	sqlitePath(prefix: string): string;
	/** Unique `<tmpdir>/<prefix>-…` directory path, removed recursively on cleanup. */
	dirPath(prefix: string): string;
	/** Remove everything handed out since the last cleanup. */
	cleanup(): void;
}

/** Create a tracker that hands out unique temp paths and removes them on cleanup. */
export function createTempFiles(): TempFiles {
	const files: string[] = [];
	const dirs: string[] = [];
	const unique = (prefix: string) =>
		join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${++counter}`);

	return {
		sqlitePath(prefix) {
			const path = `${unique(prefix)}.sqlite`;
			files.push(path);
			return path;
		},
		dirPath(prefix) {
			const path = unique(prefix);
			dirs.push(path);
			return path;
		},
		cleanup() {
			for (const path of files.splice(0)) removeSqliteFile(path);
			for (const path of dirs.splice(0)) removeDir(path);
		},
	};
}
