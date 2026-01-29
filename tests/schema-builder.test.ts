/**
 * Schema Builder Tests
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Schema, getDriver, resetDriver, setOrmConfig } from "../src/index.js";

describe("Schema Builder", () => {
	const testDbPath = `/tmp/test-schema-${Date.now()}.sqlite`;

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

	describe("Schema.createTable()", () => {
		it("should create a table with increments id", () => {
			Schema.createTable("users", (table) => {
				table.increments("id");
				table.text("name");
			});

			const driver = getDriver();
			const result = driver
				.query(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
				)
				.get();
			expect(result).not.toBeNull();
			expect(result?.name).toBe("users");

			// Verify columns
			const info = driver.query("PRAGMA table_info(users)").all();
			expect(info.length).toBeGreaterThanOrEqual(2);
			const idCol = info.find((c) => (c as { name: string }).name === "id");
			expect(idCol).toBeDefined();
			expect(idCol?.pk).toBe(1);
		});

		it("should create a table with integer, text, boolean columns", () => {
			Schema.createTable("posts", (table) => {
				table.increments("id");
				table.integer("user_id");
				table.text("title");
				table.text("body");
				table.boolean("published");
			});

			const driver = getDriver();
			const info = driver.query("PRAGMA table_info(posts)").all();
			expect(info.length).toBe(5);
			const columns = info.map((c) => (c as { name: string }).name);
			expect(columns).toContain("id");
			expect(columns).toContain("user_id");
			expect(columns).toContain("title");
			expect(columns).toContain("body");
			expect(columns).toContain("published");
		});

		it("should create a table with timestamps()", () => {
			Schema.createTable("items", (table) => {
				table.increments("id");
				table.text("name");
				table.timestamps();
			});

			const driver = getDriver();
			const info = driver.query("PRAGMA table_info(items)").all();
			const columns = info.map((c) => (c as { name: string }).name);
			expect(columns).toContain("createdAt");
			expect(columns).toContain("updatedAt");
		});

		it("should create a table with unique constraint", () => {
			Schema.createTable("users_unique", (table) => {
				table.increments("id");
				table.text("email").unique();
			});

			const driver = getDriver();
			const indexes = driver
				.query(
					"SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users_unique'",
				)
				.all();
			expect(indexes.length).toBeGreaterThanOrEqual(1);
		});

		it("should create a table with index()", () => {
			Schema.createTable("posts_indexed", (table) => {
				table.increments("id");
				table.integer("user_id");
				table.text("title");
				table.index("user_id");
			});

			const driver = getDriver();
			const indexes = driver
				.query(
					"SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='posts_indexed'",
				)
				.all();
			expect(indexes.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("Schema.dropTable()", () => {
		it("should drop an existing table", () => {
			Schema.createTable("to_drop", (table) => {
				table.increments("id");
			});

			const driver = getDriver();
			let result = driver
				.query(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='to_drop'",
				)
				.get();
			expect(result).not.toBeNull();

			Schema.dropTable("to_drop");

			result = driver
				.query(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='to_drop'",
				)
				.get();
			expect(result).toBeNull();
		});
	});

	describe("Schema.table() (alter)", () => {
		it("should support adding column via table()", () => {
			Schema.createTable("alter_test", (table) => {
				table.increments("id");
				table.text("name");
			});

			Schema.table("alter_test", (table) => {
				table.text("email");
			});

			const driver = getDriver();
			const info = driver.query("PRAGMA table_info(alter_test)").all();
			const columns = info.map((c) => (c as { name: string }).name);
			expect(columns).toContain("email");
		});
	});
});
