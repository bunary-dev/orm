/**
 * Migrations Repository Tests
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	getDriver,
	MigrationsRepository,
	resetDriver,
	setOrmConfig,
} from "../src/index.js";

describe("MigrationsRepository", () => {
	const testDbPath = `/tmp/test-migrations-repo-${Date.now()}.sqlite`;

	beforeEach(() => {
		setOrmConfig({
			database: {
				type: "sqlite" as const,
				sqlite: { path: testDbPath },
			},
		});
	});

	afterEach(async () => {
		resetDriver();
		try {
			await Bun.file(testDbPath).unlink();
		} catch {
			// ignore
		}
	});

	describe("ensureTable()", () => {
		it("should create migrations table if missing", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();

			const driver = getDriver();
			const result = driver
				.query(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'",
				)
				.get();
			expect(result).not.toBeNull();
			expect((result as { name: string }).name).toBe("migrations");
		});

		it("should be idempotent (safe to call multiple times)", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();
			repo.ensureTable();
			repo.ensureTable();

			const driver = getDriver();
			const info = driver.query("PRAGMA table_info(migrations)").all();
			expect(info.length).toBeGreaterThanOrEqual(4);
			const columns = info.map((c) => (c as { name: string }).name);
			expect(columns).toContain("id");
			expect(columns).toContain("name");
			expect(columns).toContain("batch");
			expect(columns).toContain("applied_at");
		});
	});

	describe("log()", () => {
		it("should record an applied migration", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();
			repo.log("20260101000000_create_users_table", 1);

			const driver = getDriver();
			const rows = driver.query("SELECT * FROM migrations").all();
			expect(rows.length).toBe(1);
			expect((rows[0] as { name: string }).name).toBe(
				"20260101000000_create_users_table",
			);
			expect((rows[0] as { batch: number }).batch).toBe(1);
		});

		it("should record multiple migrations in same batch", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();
			repo.log("migration_a", 1);
			repo.log("migration_b", 1);

			const rows = repo.listApplied();
			expect(rows.length).toBe(2);
			expect(rows[0].batch).toBe(1);
			expect(rows[1].batch).toBe(1);
		});
	});

	describe("listApplied()", () => {
		it("should return empty array when no migrations", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();

			const rows = repo.listApplied();
			expect(rows).toEqual([]);
		});

		it("should return applied migrations ordered by id", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();
			repo.log("second", 1);
			repo.log("first", 1);

			const rows = repo.listApplied();
			expect(rows.length).toBe(2);
			// Insertion order: id 1 = "second", id 2 = "first"
			expect(rows[0].name).toBe("second");
			expect(rows[1].name).toBe("first");
		});
	});

	describe("getNextBatchNumber()", () => {
		it("should return 1 when no migrations", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();

			expect(repo.getNextBatchNumber()).toBe(1);
		});

		it("should return 2 when batch 1 exists", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();
			repo.log("migration_1", 1);

			expect(repo.getNextBatchNumber()).toBe(2);
		});

		it("should return max batch + 1 when multiple batches", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();
			repo.log("a", 1);
			repo.log("b", 2);
			repo.log("c", 2);

			expect(repo.getNextBatchNumber()).toBe(3);
		});
	});

	describe("getLastBatch()", () => {
		it("should return empty array when no migrations", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();

			expect(repo.getLastBatch()).toEqual([]);
		});

		it("should return migrations in the last batch", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();
			repo.log("a", 1);
			repo.log("b", 2);
			repo.log("c", 2);

			const last = repo.getLastBatch();
			expect(last.length).toBe(2);
			expect(last.map((r) => r.name).sort()).toEqual(["b", "c"]);
			expect(last[0].batch).toBe(2);
		});
	});

	describe("deleteLog() (rollback)", () => {
		it("should delete a migration by name", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();
			repo.log("to_rollback", 1);
			repo.log("to_keep", 1);

			repo.deleteLog("to_rollback");

			const rows = repo.listApplied();
			expect(rows.length).toBe(1);
			expect(rows[0].name).toBe("to_keep");
		});

		it("should delete all migrations in a batch", () => {
			const repo = new MigrationsRepository();
			repo.ensureTable();
			repo.log("a", 1);
			repo.log("b", 2);
			repo.log("c", 2);

			repo.deleteBatch(2);

			const rows = repo.listApplied();
			expect(rows.length).toBe(1);
			expect(rows[0].name).toBe("a");
		});
	});
});
