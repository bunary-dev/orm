/**
 * Migrations repository - tracks which migrations have been applied.
 *
 * Ensures the `migrations` table exists, records applied migrations,
 * and supports querying status and rollback (delete log).
 */

import { getDriver } from "../connection.js";
import type { DatabaseDriver } from "../drivers/types.js";
import type { MigrationRecord } from "./types.js";

const TABLE_NAME = "migrations";

/**
 * Migrations repository for tracking applied migrations.
 *
 * Uses the currently configured driver. Creates the migrations table
 * if missing. SQLite-compatible.
 *
 * @example
 * ```ts
 * const repo = new MigrationsRepository();
 * repo.ensureTable();
 * repo.log("20260101000000_create_users", repo.getNextBatchNumber());
 * const applied = repo.listApplied();
 * repo.deleteBatch(2); // rollback batch 2
 * ```
 */
export class MigrationsRepository {
	private driver?: DatabaseDriver;

	constructor(driver?: DatabaseDriver) {
		this.driver = driver;
	}

	private getDb(): DatabaseDriver {
		return this.driver ?? getDriver();
	}

	/**
	 * Ensure the migrations table exists (create if missing).
	 * Idempotent - safe to call multiple times.
	 */
	ensureTable(): void {
		const db = this.getDb();
		db.exec(`
			CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				batch INTEGER NOT NULL,
				applied_at TEXT NOT NULL
			)
		`);
	}

	/**
	 * Record an applied migration
	 *
	 * @param name - Migration name (e.g. filename)
	 * @param batch - Batch number
	 */
	log(name: string, batch: number): void {
		const db = this.getDb();
		const appliedAt = new Date().toISOString();
		db.exec(
			`INSERT INTO ${TABLE_NAME} (name, batch, applied_at) VALUES (?, ?, ?)`,
			name,
			batch,
			appliedAt,
		);
	}

	/**
	 * List all applied migrations, ordered by id
	 */
	listApplied(): MigrationRecord[] {
		const db = this.getDb();
		const rows = db
			.query(
				`SELECT id, name, batch, applied_at FROM ${TABLE_NAME} ORDER BY id`,
			)
			.all();
		return rows as unknown as MigrationRecord[];
	}

	/**
	 * Get the next batch number (max(batch) + 1, or 1 if none)
	 */
	getNextBatchNumber(): number {
		const db = this.getDb();
		const row = db
			.query(`SELECT COALESCE(MAX(batch), 0) as max_batch FROM ${TABLE_NAME}`)
			.get();
		const max = (row as { max_batch: number })?.max_batch ?? 0;
		return max + 1;
	}

	/**
	 * List migrations in the last (highest) batch
	 */
	getLastBatch(): MigrationRecord[] {
		const db = this.getDb();
		const rows = db
			.query(
				`SELECT id, name, batch, applied_at FROM ${TABLE_NAME} WHERE batch = (SELECT MAX(batch) FROM ${TABLE_NAME}) ORDER BY id`,
			)
			.all();
		return rows as unknown as MigrationRecord[];
	}

	/**
	 * Delete a migration record by name (for rollback of single migration)
	 *
	 * @param name - Migration name to remove from log
	 */
	deleteLog(name: string): void {
		const db = this.getDb();
		db.exec(`DELETE FROM ${TABLE_NAME} WHERE name = ?`, name);
	}

	/**
	 * Delete all migration records in a batch (for rollback batch)
	 *
	 * @param batch - Batch number to remove
	 */
	deleteBatch(batch: number): void {
		const db = this.getDb();
		db.exec(`DELETE FROM ${TABLE_NAME} WHERE batch = ?`, batch);
	}
}
