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

	describe("Schema.hasTable()", () => {
		it("should return false when table does not exist", () => {
			expect(Schema.hasTable("nonexistent")).toBe(false);
		});

		it("should return true when table exists", () => {
			Schema.createTable("exists_test", (table) => {
				table.increments("id");
			});

			expect(Schema.hasTable("exists_test")).toBe(true);
		});
	});

	describe("Schema.hasColumn()", () => {
		it("should return false when column does not exist", () => {
			Schema.createTable("column_test", (table) => {
				table.increments("id");
			});

			expect(Schema.hasColumn("column_test", "nonexistent")).toBe(false);
		});

		it("should return true when column exists", () => {
			Schema.createTable("column_test2", (table) => {
				table.increments("id");
				table.text("email");
			});

			expect(Schema.hasColumn("column_test2", "email")).toBe(true);
		});
	});

	describe("Schema.renameTable()", () => {
		it("should rename a table", () => {
			Schema.createTable("old_name", (table) => {
				table.increments("id");
			});

			Schema.renameTable("old_name", "new_name");

			expect(Schema.hasTable("old_name")).toBe(false);
			expect(Schema.hasTable("new_name")).toBe(true);
		});
	});

	describe("Column modifiers", () => {
		it("should support nullable() modifier", () => {
			Schema.createTable("nullable_test", (table) => {
				table.increments("id");
				table.text("optional").nullable();
			});

			const info = getDriver().query("PRAGMA table_info(nullable_test)").all();
			const optionalCol = info.find(
				(c) => (c as { name: string }).name === "optional",
			);
			expect(optionalCol).toBeDefined();
			// SQLite doesn't enforce NOT NULL by default, so nullable() is implicit
		});

		it("should support notNull() modifier", () => {
			Schema.createTable("notnull_test", (table) => {
				table.increments("id");
				table.text("required").notNull();
			});

			const driver = getDriver();
			const info = driver.query("PRAGMA table_info(notnull_test)").all();
			const requiredCol = info.find(
				(c) => (c as { name: string }).name === "required",
			);
			expect(requiredCol).toBeDefined();
			expect((requiredCol as { notnull: number }).notnull).toBe(1);
		});

		it("should support default() modifier", () => {
			Schema.createTable("default_test", (table) => {
				table.increments("id");
				table.text("status").default("active");
				table.integer("count").default(0);
				table.boolean("enabled").default(true);
			});

			const info = getDriver().query("PRAGMA table_info(default_test)").all();
			const statusCol = info.find(
				(c) => (c as { name: string }).name === "status",
			);
			expect(statusCol).toBeDefined();
			expect((statusCol as { dflt_value: string }).dflt_value).toBe("'active'");
		});

		it("should support primary() modifier", () => {
			Schema.createTable("primary_test", (table) => {
				table.integer("custom_id").primary();
				table.text("name");
			});

			const driver = getDriver();
			const info = driver.query("PRAGMA table_info(primary_test)").all();
			const idCol = info.find(
				(c) => (c as { name: string }).name === "custom_id",
			);
			expect(idCol).toBeDefined();
			expect((idCol as { pk: number }).pk).toBe(1);
		});
	});

	describe("New column types", () => {
		it("should support string() column type", () => {
			Schema.createTable("string_test", (table) => {
				table.increments("id");
				table.string("name", 255);
			});

			const driver = getDriver();
			const info = driver.query("PRAGMA table_info(string_test)").all();
			const nameCol = info.find((c) => (c as { name: string }).name === "name");
			expect(nameCol).toBeDefined();
			expect((nameCol as { type: string }).type).toBe("TEXT");
		});

		it("should support timestamp() column type", () => {
			Schema.createTable("timestamp_test", (table) => {
				table.increments("id");
				table.timestamp("deleted_at").nullable();
			});

			const driver = getDriver();
			const info = driver.query("PRAGMA table_info(timestamp_test)").all();
			const tsCol = info.find(
				(c) => (c as { name: string }).name === "deleted_at",
			);
			expect(tsCol).toBeDefined();
			expect((tsCol as { type: string }).type).toBe("TEXT");
		});

		it("should support foreignId() column type", () => {
			Schema.createTable("users_fk", (table) => {
				table.increments("id");
				table.text("name");
			});

			Schema.createTable("posts_fk", (table) => {
				table.increments("id");
				table.foreignId("user_id").references("users_fk", "id");
			});

			const driver = getDriver();
			const info = driver.query("PRAGMA table_info(posts_fk)").all();
			const fkCol = info.find(
				(c) => (c as { name: string }).name === "user_id",
			);
			expect(fkCol).toBeDefined();
			expect((fkCol as { type: string }).type).toBe("INTEGER");
			expect((fkCol as { notnull: number }).notnull).toBe(1);
		});

		it("should support foreign() constraint", () => {
			Schema.createTable("categories", (table) => {
				table.increments("id");
				table.text("name");
			});

			Schema.createTable("products", (table) => {
				table.increments("id");
				table.integer("category_id");
				table.foreign("category_id").references("categories", "id");
			});

			const driver = getDriver();
			const fkInfo = driver.query("PRAGMA foreign_key_list(products)").all();
			expect(fkInfo.length).toBeGreaterThan(0);
		});
	});
});
