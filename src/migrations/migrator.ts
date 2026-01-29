/**
 * Migrator runner - discovers and runs migrations
 *
 * Discovers migration files, runs pending migrations in order,
 * and supports rollback. Uses transactions for safety.
 */

import { getDriver } from "../connection.js";
import { MigrationsRepository } from "./repository.js";
import type { MigrationRecord } from "./types.js";

/**
 * Migration module interface
 */
export interface MigrationModule {
	/**
	 * Run the migration (up)
	 */
	up(): Promise<void> | void;
	/**
	 * Rollback the migration (down)
	 */
	down(): Promise<void> | void;
}

/**
 * Migrator options
 */
export interface MigratorOptions {
	/**
	 * Path to migrations directory (default: "./migrations")
	 */
	migrationsPath?: string;
	/**
	 * Name of migrations table (default: "migrations")
	 */
	tableName?: string;
}

/**
 * Migration status
 */
export interface MigrationStatus {
	/**
	 * List of applied migration names (ordered)
	 */
	ran: string[];
	/**
	 * List of pending migration names (ordered)
	 */
	pending: string[];
}

/**
 * Create a migrator instance
 *
 * @param options - Migrator options
 * @returns Migrator instance
 *
 * @example
 * ```ts
 * const migrator = createMigrator({ migrationsPath: "./database/migrations" });
 * await migrator.up(); // Run all pending migrations
 * await migrator.down(); // Rollback last batch
 * const status = await migrator.status();
 * ```
 */
export function createMigrator(options: MigratorOptions = {}): Migrator {
	return new Migrator(options);
}

/**
 * Migrator runner for database migrations
 */
export class Migrator {
	private migrationsPath: string;
	private repository: MigrationsRepository;

	constructor(options: MigratorOptions = {}) {
		this.migrationsPath = options.migrationsPath ?? "./migrations";
		this.repository = new MigrationsRepository();
	}

	/**
	 * Get migration status (ran vs pending)
	 */
	async status(): Promise<MigrationStatus> {
		this.repository.ensureTable();

		const files = await this.discoverMigrations();
		const applied = this.repository.listApplied();
		const appliedNames = new Set(applied.map((m) => m.name));

		const ran: string[] = [];
		const pending: string[] = [];

		for (const name of files) {
			if (appliedNames.has(name)) {
				ran.push(name);
			} else {
				pending.push(name);
			}
		}

		return { ran, pending };
	}

	/**
	 * Run all pending migrations in order
	 *
	 * Uses transactions - if any migration fails, all changes are rolled back.
	 */
	async up(): Promise<void> {
		this.repository.ensureTable();

		const status = await this.status();
		if (status.pending.length === 0) {
			return; // Nothing to do
		}

		const driver = getDriver();
		const batch = this.repository.getNextBatchNumber();

		await driver.transaction(async (tx) => {
			for (const name of status.pending) {
				const module = await this.loadMigration(name);
				await module.up();
				// Log migration within transaction
				// Use transaction driver for logging
				const repo = new MigrationsRepository(tx);
				repo.ensureTable(); // Ensure table exists in transaction
				repo.log(name, batch);
			}
		});
	}

	/**
	 * Rollback migrations
	 *
	 * @param options - Rollback options
	 * @param options.steps - Number of batches to rollback (default: 1)
	 *
	 * Rolls back migrations in reverse order within each batch.
	 */
	async down(options: { steps?: number } = {}): Promise<void> {
		this.repository.ensureTable();

		const steps = options.steps ?? 1;
		const applied = this.repository.listApplied();

		if (applied.length === 0) {
			throw new Error("No migrations to rollback");
		}

		// Group migrations by batch
		const batches = new Map<number, MigrationRecord[]>();
		for (const migration of applied) {
			const batchMigrations = batches.get(migration.batch) ?? [];
			batchMigrations.push(migration);
			batches.set(migration.batch, batchMigrations);
		}

		// Get batches to rollback (highest first)
		const batchNumbers = Array.from(batches.keys()).sort((a, b) => b - a);
		const batchesToRollback = batchNumbers.slice(0, steps);

		if (batchesToRollback.length === 0) {
			throw new Error("No migrations to rollback");
		}

		const driver = getDriver();

		await driver.transaction(async (tx) => {
			// Rollback batches in reverse order (highest batch first)
			for (const batchNum of batchesToRollback) {
				const migrations = batches.get(batchNum);
				if (!migrations) {
					continue; // Skip if batch not found (shouldn't happen)
				}
				// Rollback migrations in reverse order (last applied first)
				const reversed = [...migrations].reverse();

				for (const migration of reversed) {
					const module = await this.loadMigration(migration.name);
					await module.down();
				}

				// Delete batch log within transaction
				const repo = new MigrationsRepository(tx);
				repo.ensureTable(); // Ensure table exists
				repo.deleteBatch(batchNum);
			}
		});
	}

	/**
	 * Discover migration files in migrations directory
	 *
	 * Returns migration names sorted by filename (timestamp prefix)
	 */
	private async discoverMigrations(): Promise<string[]> {
		try {
			const files: string[] = [];
			const glob = new Bun.Glob("*.ts");

			// Scan directory for .ts files
			// If directory doesn't exist, scan will just return empty iterator
			for await (const file of glob.scan(this.migrationsPath)) {
				// Extract migration name (filename without extension)
				// glob returns just the filename relative to scan path
				const name = file.replace(/\.ts$/, "");
				if (name && !name.startsWith(".")) {
					files.push(name);
				}
			}

			// Sort by filename (timestamp prefix ensures chronological order)
			return files.sort();
		} catch {
			// Return empty array on error (directory doesn't exist, etc.)
			return [];
		}
	}

	/**
	 * Load a migration module by name
	 *
	 * @param name - Migration name (filename without extension)
	 */
	private async loadMigration(name: string): Promise<MigrationModule> {
		const path = `${this.migrationsPath}/${name}.ts`;
		const module = await import(path);
		if (typeof module.up !== "function" || typeof module.down !== "function") {
			throw new Error(
				`Migration "${name}" must export async functions "up" and "down"`,
			);
		}
		return module as MigrationModule;
	}
}
