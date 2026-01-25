import { Database } from "bun:sqlite";
/**
 * Offset Tests - TDD approach
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Model, setOrmConfig } from "../src/index.js";
import type { OrmConfig } from "../src/types.js";

describe("offset()", () => {
	let testDbPath: string;

	beforeAll(() => {
		testDbPath = `/tmp/bunary-offset-test-${Date.now()}.sqlite`;

		const config: OrmConfig = {
			database: {
				type: "sqlite",
				sqlite: {
					path: testDbPath,
				},
			},
		};

		setOrmConfig(config);

		const db = new Database(testDbPath);
		db.exec(`
			CREATE TABLE items (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL
			);

			INSERT INTO items (name) VALUES
				('Item 1'),
				('Item 2'),
				('Item 3'),
				('Item 4'),
				('Item 5');
		`);
		db.close();
	});

	afterAll(async () => {
		try {
			const db = new Database(testDbPath);
			db.close();
			await Bun.file(testDbPath).unlink();
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should skip specified number of records", async () => {
		const items = await Model.table("items").offset(2).all();

		expect(items).toHaveLength(3);
		expect(items[0].name).toBe("Item 3");
		expect(items[1].name).toBe("Item 4");
		expect(items[2].name).toBe("Item 5");
	});

	it("should work with limit() for pagination", async () => {
		const items = await Model.table("items").limit(2).offset(2).all();

		expect(items).toHaveLength(2);
		expect(items[0].name).toBe("Item 3");
		expect(items[1].name).toBe("Item 4");
	});

	it("should return empty array when offset exceeds total", async () => {
		const items = await Model.table("items").offset(10).all();

		expect(items).toHaveLength(0);
	});

	it("should work with offset 0 (no skip)", async () => {
		const items = await Model.table("items").offset(0).all();

		expect(items).toHaveLength(5);
		expect(items[0].name).toBe("Item 1");
	});

	it("should work with orderBy()", async () => {
		const items = await Model.table("items")
			.orderBy("name", "desc")
			.offset(2)
			.limit(2)
			.all();

		expect(items).toHaveLength(2);
		// When ordered DESC: Item 5, Item 4, Item 3, Item 2, Item 1
		// OFFSET 2 skips Item 5 and Item 4, so we get Item 3 and Item 2
		expect(items[0].name).toBe("Item 3");
		expect(items[1].name).toBe("Item 2");
	});

	it("should allow chaining multiple offset() calls (last one wins)", async () => {
		const items = await Model.table("items").offset(1).offset(2).all();

		expect(items).toHaveLength(3);
		expect(items[0].name).toBe("Item 3");
	});
});
