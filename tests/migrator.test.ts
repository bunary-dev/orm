/**
 * Migrator Runner Tests
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	getDriver,
	MigrationsRepository,
	resetDriver,
	setOrmConfig,
} from "../src/index.js";
import { createMigrator } from "../src/migrations/migrator.js";

describe("Migrator", () => {
	let testDbPath: string;
	let migrationsPath: string;

	beforeEach(async () => {
		// Use unique paths for each test
		const timestamp = Date.now();
		testDbPath = `/tmp/test-migrator-${timestamp}.sqlite`;
		migrationsPath = `/tmp/test-migrations-${timestamp}`;

		setOrmConfig({
			database: {
				type: "sqlite" as const,
				sqlite: { path: testDbPath },
			},
		});

		// Create migrations directory
		await Bun.write(`${migrationsPath}/.gitkeep`, "");
	});

	// Helper to create migration file with correct import path
	const createMigrationFile = async (
		name: string,
		content: string,
	): Promise<void> => {
		// Replace placeholder with actual package path
		const packagePath = `${import.meta.dir}/../src/index.js`;
		const finalContent = content.replace(/__PACKAGE_PATH__/g, packagePath);
		await Bun.write(`${migrationsPath}/${name}.ts`, finalContent);
	};

	afterEach(async () => {
		resetDriver();
		try {
			if (testDbPath) {
				await Bun.file(testDbPath).unlink();
			}
		} catch {
			// ignore
		}
		try {
			if (migrationsPath) {
				// Clean up migration files
				const glob = new Bun.Glob("**/*.ts");
				for await (const file of glob.scan(migrationsPath)) {
					try {
						const fullPath = `${migrationsPath}/${file}`;
						await Bun.file(fullPath).unlink();
					} catch {
						// ignore
					}
				}
				// Remove .gitkeep
				try {
					await Bun.file(`${migrationsPath}/.gitkeep`).unlink();
				} catch {
					// ignore
				}
			}
		} catch {
			// ignore
		}
	});

	describe("createMigrator()", () => {
		it("should create migrator with default migrations path", () => {
			const migrator = createMigrator();
			expect(migrator).toBeDefined();
		});

		it("should create migrator with custom migrations path", () => {
			const migrator = createMigrator({ migrationsPath: "./custom" });
			expect(migrator).toBeDefined();
		});
	});

	describe("status()", () => {
		it("should return empty arrays when no migrations exist", async () => {
			const migrator = createMigrator({ migrationsPath });
			const status = await migrator.status();
			expect(status.ran).toEqual([]);
			expect(status.pending).toEqual([]);
		});

		it("should list pending migrations when none are applied", async () => {
			// Create migration files
			await Bun.write(
				`${migrationsPath}/20260101000000_create_users.ts`,
				"export async function up() {} export async function down() {}",
			);
			await Bun.write(
				`${migrationsPath}/20260102000000_add_email.ts`,
				"export async function up() {} export async function down() {}",
			);

			const migrator = createMigrator({ migrationsPath });
			const status = await migrator.status();

			expect(status.ran).toEqual([]);
			expect(status.pending).toHaveLength(2);
			expect(status.pending[0]).toBe("20260101000000_create_users");
			expect(status.pending[1]).toBe("20260102000000_add_email");
		});

		it("should list ran migrations and exclude them from pending", async () => {
			// Create migration files
			await Bun.write(
				`${migrationsPath}/20260101000000_create_users.ts`,
				"export async function up() {} export async function down() {}",
			);
			await Bun.write(
				`${migrationsPath}/20260102000000_add_email.ts`,
				"export async function up() {} export async function down() {}",
			);

			// Manually log one migration as applied
			const repo = new MigrationsRepository();
			repo.ensureTable();
			repo.log("20260101000000_create_users", 1);

			const migrator = createMigrator({ migrationsPath });
			const status = await migrator.status();

			expect(status.ran).toHaveLength(1);
			expect(status.ran[0]).toBe("20260101000000_create_users");
			expect(status.pending).toHaveLength(1);
			expect(status.pending[0]).toBe("20260102000000_add_email");
		});
	});

	describe("up()", () => {
		it("should run all pending migrations in order", async () => {
			// Create migration files that create tables
			await createMigrationFile(
				"20260101000000_create_users",
				`
				import { getDriver } from "__PACKAGE_PATH__";
				export async function up() {
					const driver = getDriver();
					driver.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
				}
				export async function down() {
					const driver = getDriver();
					driver.exec("DROP TABLE users");
				}
				`,
			);
			await createMigrationFile(
				"20260102000000_create_posts",
				`
				import { getDriver } from "__PACKAGE_PATH__";
				export async function up() {
					const driver = getDriver();
					driver.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)");
				}
				export async function down() {
					const driver = getDriver();
					driver.exec("DROP TABLE posts");
				}
				`,
			);

			const migrator = createMigrator({ migrationsPath });
			const repo = new MigrationsRepository();
			repo.ensureTable();

			await migrator.up();

			// Verify migrations were logged
			const applied = repo.listApplied();
			expect(applied).toHaveLength(2);
			expect(applied[0].name).toBe("20260101000000_create_users");
			expect(applied[1].name).toBe("20260102000000_create_posts");
			expect(applied[0].batch).toBe(1);
			expect(applied[1].batch).toBe(1);

			// Verify tables were created
			const driver = getDriver();
			const usersTable = driver
				.query(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
				)
				.get();
			const postsTable = driver
				.query(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='posts'",
				)
				.get();
			expect(usersTable).not.toBeNull();
			expect(postsTable).not.toBeNull();
		});

		it("should skip already-applied migrations", async () => {
			await createMigrationFile(
				"20260101000000_create_users",
				`
				import { getDriver } from "__PACKAGE_PATH__";
				export async function up() {
					const driver = getDriver();
					driver.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
				}
				export async function down() {
					const driver = getDriver();
					driver.exec("DROP TABLE users");
				}
				`,
			);
			await createMigrationFile(
				"20260102000000_create_posts",
				`
				import { getDriver } from "__PACKAGE_PATH__";
				export async function up() {
					const driver = getDriver();
					driver.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)");
				}
				export async function down() {
					const driver = getDriver();
					driver.exec("DROP TABLE posts");
				}
				`,
			);

			const migrator = createMigrator({ migrationsPath });
			const repo = new MigrationsRepository();
			repo.ensureTable();

			// Manually log first migration
			repo.log("20260101000000_create_users", 1);

			await migrator.up();

			// Only second migration should be logged
			const applied = repo.listApplied();
			expect(applied).toHaveLength(2);
			expect(applied[1].name).toBe("20260102000000_create_posts");
			expect(applied[1].batch).toBe(2); // New batch
		});

		it("should rollback on migration failure", async () => {
			await createMigrationFile(
				"20260101000000_create_users",
				`
				import { getDriver } from "__PACKAGE_PATH__";
				export async function up() {
					const driver = getDriver();
					driver.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
				}
				export async function down() {
					const driver = getDriver();
					driver.exec("DROP TABLE users");
				}
				`,
			);
			await Bun.write(
				`${migrationsPath}/20260102000000_failing_migration.ts`,
				`
				export async function up() {
					throw new Error("Migration failed");
				}
				export async function down() {
					// no-op
				}
				`,
			);

			const migrator = createMigrator({ migrationsPath });
			const repo = new MigrationsRepository();
			repo.ensureTable();

			// Should throw error
			await expect(migrator.up()).rejects.toThrow("Migration failed");

			// No migrations should be logged (transaction rolled back)
			const applied = repo.listApplied();
			expect(applied).toHaveLength(0);

			// Table should not exist (transaction rolled back)
			const driver = getDriver();
			const usersTable = driver
				.query(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
				)
				.get();
			expect(usersTable).toBeNull();
		});
	});

	describe("down()", () => {
		it("should rollback last batch in reverse order", async () => {
			await createMigrationFile(
				"20260101000000_create_users",
				`
				import { getDriver } from "__PACKAGE_PATH__";
				export async function up() {
					const driver = getDriver();
					driver.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
				}
				export async function down() {
					const driver = getDriver();
					driver.exec("DROP TABLE users");
				}
				`,
			);
			await createMigrationFile(
				"20260102000000_create_posts",
				`
				import { getDriver } from "__PACKAGE_PATH__";
				export async function up() {
					const driver = getDriver();
					driver.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)");
				}
				export async function down() {
					const driver = getDriver();
					driver.exec("DROP TABLE posts");
				}
				`,
			);

			const migrator = createMigrator({ migrationsPath });
			const repo = new MigrationsRepository();
			repo.ensureTable();

			// Run migrations
			await migrator.up();

			// Verify tables exist
			const driver = getDriver();
			expect(
				driver
					.query(
						"SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
					)
					.get(),
			).not.toBeNull();
			expect(
				driver
					.query(
						"SELECT name FROM sqlite_master WHERE type='table' AND name='posts'",
					)
					.get(),
			).not.toBeNull();

			// Rollback last batch
			await migrator.down();

			// Verify migrations were removed from log
			const applied = repo.listApplied();
			expect(applied).toHaveLength(0);

			// Verify tables were dropped (down() was called)
			expect(
				driver
					.query(
						"SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
					)
					.get(),
			).toBeNull();
			expect(
				driver
					.query(
						"SELECT name FROM sqlite_master WHERE type='table' AND name='posts'",
					)
					.get(),
			).toBeNull();
		});

		it("should rollback multiple batches when steps specified", async () => {
			await createMigrationFile(
				"20260101000000_create_users",
				`
				import { getDriver } from "__PACKAGE_PATH__";
				export async function up() {
					const driver = getDriver();
					driver.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
				}
				export async function down() {
					const driver = getDriver();
					driver.exec("DROP TABLE users");
				}
				`,
			);
			await createMigrationFile(
				"20260102000000_create_posts",
				`
				import { getDriver } from "__PACKAGE_PATH__";
				export async function up() {
					const driver = getDriver();
					driver.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)");
				}
				export async function down() {
					const driver = getDriver();
					driver.exec("DROP TABLE posts");
				}
				`,
			);

			const migrator = createMigrator({ migrationsPath });
			const repo = new MigrationsRepository();
			repo.ensureTable();

			// Run first migration
			repo.log("20260101000000_create_users", 1);
			const driver = getDriver();
			driver.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

			// Run second migration
			await migrator.up();

			// Rollback 2 batches
			await migrator.down({ steps: 2 });

			// All migrations should be removed
			const applied = repo.listApplied();
			expect(applied).toHaveLength(0);
		});

		it("should throw error when no migrations to rollback", async () => {
			const migrator = createMigrator({ migrationsPath });
			const repo = new MigrationsRepository();
			repo.ensureTable();

			await expect(migrator.down()).rejects.toThrow(
				"No migrations to rollback",
			);
		});
	});
});
