import { Database } from "bun:sqlite";
/**
 * Limit Tests - TDD approach
 * Following Red-Green-Refactor cycle
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Model, setOrmConfig } from "../src/index.js";
import type { OrmConfig } from "../src/types.js";

describe("limit()", () => {
	let testDbPath: string;

	beforeAll(() => {
		// Create a temporary test database
		testDbPath = `/tmp/bunary-limit-test-${Date.now()}.sqlite`;

		const config: OrmConfig = {
			database: {
				type: "sqlite",
				sqlite: {
					path: testDbPath,
				},
			},
		};

		setOrmConfig(config);

		// Create test table with multiple records
		const db = new Database(testDbPath);
		db.exec(`
			CREATE TABLE items (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				price REAL NOT NULL
			);

			INSERT INTO items (name, price) VALUES
				('Item 1', 10.99),
				('Item 2', 20.99),
				('Item 3', 30.99),
				('Item 4', 40.99),
				('Item 5', 50.99);
		`);
		db.close();
	});

	afterAll(async () => {
		// Clean up test database
		try {
			const db = new Database(testDbPath);
			db.close();
			await Bun.file(testDbPath).unlink();
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("limit() with all()", () => {
		it("should limit results to specified number", async () => {
			const items = await Model.table("items").limit(2).all();

			expect(items).toHaveLength(2);
			expect(items[0].name).toBe("Item 1");
			expect(items[1].name).toBe("Item 2");
		});

		it("should limit to 1 result", async () => {
			const items = await Model.table("items").limit(1).all();

			expect(items).toHaveLength(1);
			expect(items[0].name).toBe("Item 1");
		});

		it("should return all results when limit is greater than total", async () => {
			const items = await Model.table("items").limit(10).all();

			expect(items).toHaveLength(5);
		});

		it("should return empty array when limit is 0", async () => {
			const items = await Model.table("items").limit(0).all();

			expect(items).toHaveLength(0);
		});

		it("should work with select()", async () => {
			const items = await Model.table("items")
				.select("id", "name")
				.limit(2)
				.all();

			expect(items).toHaveLength(2);
			expect(items[0]).toHaveProperty("id");
			expect(items[0]).toHaveProperty("name");
			expect(items[0]).not.toHaveProperty("price");
		});

		it("should work with exclude()", async () => {
			const items = await Model.table("items").exclude("price").limit(2).all();

			expect(items).toHaveLength(2);
			expect(items[0]).not.toHaveProperty("price");
		});
	});

	describe("limit() with find()", () => {
		it("should still work with find() (limit is ignored for find)", async () => {
			const item = await Model.table("items").limit(2).find(1);

			expect(item).not.toBeNull();
			expect(item?.id).toBe(1);
			expect(item?.name).toBe("Item 1");
		});
	});

	describe("limit() chaining", () => {
		it("should allow chaining multiple limit() calls (last one wins)", async () => {
			const items = await Model.table("items").limit(3).limit(2).all();

			expect(items).toHaveLength(2);
		});
	});
});
