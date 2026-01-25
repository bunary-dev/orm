import { Database } from "bun:sqlite";
/**
 * OrderBy Tests - TDD approach
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Model, setOrmConfig } from "../src/index.js";
import type { OrmConfig } from "../src/types.js";

describe("orderBy()", () => {
	let testDbPath: string;

	beforeAll(() => {
		testDbPath = `/tmp/bunary-orderby-test-${Date.now()}.sqlite`;

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
			CREATE TABLE products (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				price REAL NOT NULL
			);

			INSERT INTO products (name, price) VALUES
				('Zebra', 50.00),
				('Apple', 10.00),
				('Banana', 20.00);
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

	it("should order by column ascending (default)", async () => {
		const products = await Model.table("products").orderBy("name").all();

		expect(products).toHaveLength(3);
		expect(products[0].name).toBe("Apple");
		expect(products[1].name).toBe("Banana");
		expect(products[2].name).toBe("Zebra");
	});

	it("should order by column ascending (explicit)", async () => {
		const products = await Model.table("products").orderBy("name", "asc").all();

		expect(products).toHaveLength(3);
		expect(products[0].name).toBe("Apple");
		expect(products[1].name).toBe("Banana");
		expect(products[2].name).toBe("Zebra");
	});

	it("should order by column descending", async () => {
		const products = await Model.table("products")
			.orderBy("name", "desc")
			.all();

		expect(products).toHaveLength(3);
		expect(products[0].name).toBe("Zebra");
		expect(products[1].name).toBe("Banana");
		expect(products[2].name).toBe("Apple");
	});

	it("should order by numeric column", async () => {
		const products = await Model.table("products")
			.orderBy("price", "asc")
			.all();

		expect(products).toHaveLength(3);
		expect(products[0].price).toBe(10.0);
		expect(products[1].price).toBe(20.0);
		expect(products[2].price).toBe(50.0);
	});

	it("should work with limit()", async () => {
		const products = await Model.table("products")
			.orderBy("price", "asc")
			.limit(2)
			.all();

		expect(products).toHaveLength(2);
		expect(products[0].price).toBe(10.0);
		expect(products[1].price).toBe(20.0);
	});

	it("should work with first()", async () => {
		const product = await Model.table("products")
			.orderBy("price", "desc")
			.first();

		expect(product).not.toBeNull();
		expect(product?.price).toBe(50.0);
		expect(product?.name).toBe("Zebra");
	});

	it("should allow chaining multiple orderBy() calls (last one wins)", async () => {
		const products = await Model.table("products")
			.orderBy("name", "asc")
			.orderBy("price", "desc")
			.all();

		expect(products).toHaveLength(3);
		// Should be ordered by price desc (last orderBy wins)
		expect(products[0].price).toBe(50.0);
		expect(products[1].price).toBe(20.0);
		expect(products[2].price).toBe(10.0);
	});
});
