import { Database } from "bun:sqlite";
/**
 * Integration Tests
 *
 * Tests the complete flow: ORM Connection → Database Driver → Models → Database
 * Verifies the abstraction layer works end-to-end
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Model, createDriver, getDriver, setOrmConfig } from "../src/index.js";
import type { DatabaseConfig, OrmConfig } from "../src/types.js";

describe("ORM Integration - Full Flow", () => {
	describe("Model → Query Builder → Driver → Database", () => {
		let testDbPath: string;

		beforeAll(() => {
			testDbPath = `/tmp/bunary-integration-test-${Date.now()}.sqlite`;

			const config: OrmConfig = {
				database: {
					type: "sqlite",
					sqlite: {
						path: testDbPath,
					},
				},
			};

			setOrmConfig(config);

			// Create test table using direct database access
			const db = new Database(testDbPath);
			db.exec(`
				CREATE TABLE products (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL,
					price REAL NOT NULL,
					description TEXT,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP
				);

				INSERT INTO products (name, price, description, created_at) VALUES
					('Laptop', 999.99, 'High-performance laptop', '2026-01-01 10:00:00'),
					('Mouse', 29.99, 'Wireless mouse', '2026-01-02 11:00:00'),
					('Keyboard', 79.99, 'Mechanical keyboard', '2026-01-03 12:00:00');
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

		it("should use abstraction layer: Model.table() → Query Builder → Driver → Database", async () => {
			// Verify the driver is accessible through the abstraction
			const driver = getDriver();
			expect(driver).toBeDefined();
			expect(typeof driver.query).toBe("function");

			// Model should use the same driver through abstraction
			const products = await Model.table("products").all();

			expect(products).toHaveLength(3);
			expect(products[0].name).toBe("Laptop");
			expect(products[1].name).toBe("Mouse");
			expect(products[2].name).toBe("Keyboard");
		});

		it("should work with find() through abstraction layer", async () => {
			const product = await Model.table("products").find(1);

			expect(product).not.toBeNull();
			expect(product?.id).toBe(1);
			expect(product?.name).toBe("Laptop");
			expect(product?.price).toBe(999.99);
		});

		it("should work with select() through abstraction layer", async () => {
			const products = await Model.table("products")
				.select("id", "name", "price")
				.all();

			expect(products).toHaveLength(3);
			expect(products[0]).toHaveProperty("id");
			expect(products[0]).toHaveProperty("name");
			expect(products[0]).toHaveProperty("price");
			expect(products[0]).not.toHaveProperty("description");
			expect(products[0]).not.toHaveProperty("created_at");
		});

		it("should work with exclude() through abstraction layer", async () => {
			const products = await Model.table("products")
				.exclude("description", "created_at")
				.all();

			expect(products).toHaveLength(3);
			expect(products[0]).toHaveProperty("id");
			expect(products[0]).toHaveProperty("name");
			expect(products[0]).toHaveProperty("price");
			expect(products[0]).not.toHaveProperty("description");
			expect(products[0]).not.toHaveProperty("created_at");
		});
	});

	describe("Connection Manager Integration", () => {
		it("should create driver that works with Model", async () => {
			const testDbPath = `/tmp/bunary-connection-test-${Date.now()}.sqlite`;

			// Create database and table
			const db = new Database(testDbPath);
			db.exec(`
				CREATE TABLE test_table (
					id INTEGER PRIMARY KEY,
					value TEXT
				);
				INSERT INTO test_table (id, value) VALUES (1, 'test');
			`);
			db.close();

			// Create driver directly
			const config: DatabaseConfig = {
				type: "sqlite",
				sqlite: { path: testDbPath },
			};
			const driver = createDriver(config);

			// Set config for Model to use
			setOrmConfig({
				database: config,
			});

			// Model should work with the same driver
			const result = await Model.table("test_table").find(1);
			expect(result).not.toBeNull();
			expect(result?.value).toBe("test");

			// Cleanup
			driver.close();
			try {
				await Bun.file(testDbPath).unlink();
			} catch {
				// Ignore
			}
		});

		it("should handle driver switching (when multiple drivers exist)", async () => {
			// Test that we can switch between different database configurations
			const db1Path = `/tmp/bunary-switch-test-1-${Date.now()}.sqlite`;
			const db2Path = `/tmp/bunary-switch-test-2-${Date.now()}.sqlite`;

			// Create first database
			const db1 = new Database(db1Path);
			db1.exec(`
				CREATE TABLE table1 (id INTEGER PRIMARY KEY, value TEXT);
				INSERT INTO table1 (id, value) VALUES (1, 'db1-value');
			`);
			db1.close();

			// Create second database
			const db2 = new Database(db2Path);
			db2.exec(`
				CREATE TABLE table1 (id INTEGER PRIMARY KEY, value TEXT);
				INSERT INTO table1 (id, value) VALUES (1, 'db2-value');
			`);
			db2.close();

			// Switch to first database
			setOrmConfig({
				database: {
					type: "sqlite",
					sqlite: { path: db1Path },
				},
			});

			let result = await Model.table("table1").find(1);
			expect(result?.value).toBe("db1-value");

			// Switch to second database
			setOrmConfig({
				database: {
					type: "sqlite",
					sqlite: { path: db2Path },
				},
			});

			result = await Model.table("table1").find(1);
			expect(result?.value).toBe("db2-value");

			// Cleanup
			try {
				await Bun.file(db1Path).unlink();
				await Bun.file(db2Path).unlink();
			} catch {
				// Ignore
			}
		});
	});

	describe("Abstraction Layer Verification", () => {
		it("should verify Model uses getDriver() internally", async () => {
			const testDbPath = `/tmp/bunary-abstraction-test-${Date.now()}.sqlite`;

			// Create database
			const db = new Database(testDbPath);
			db.exec(`
				CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT);
				INSERT INTO test (id, name) VALUES (1, 'test');
			`);
			db.close();

			setOrmConfig({
				database: {
					type: "sqlite",
					sqlite: { path: testDbPath },
				},
			});

			// Get driver directly
			const directDriver = getDriver();
			const directResult = directDriver
				.query("SELECT * FROM test WHERE id = ?", 1)
				.get();

			// Use Model (which should use the same driver through abstraction)
			const modelResult = await Model.table("test").find(1);

			// Both should return the same data (proving abstraction works)
			expect(modelResult).toEqual(directResult);

			// Cleanup
			directDriver.close();
			try {
				await Bun.file(testDbPath).unlink();
			} catch {
				// Ignore
			}
		});

		it("should verify query builder uses driver abstraction", async () => {
			const testDbPath = `/tmp/bunary-query-builder-test-${Date.now()}.sqlite`;

			// Create database
			const db = new Database(testDbPath);
			db.exec(`
				CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, price REAL);
				INSERT INTO items (id, name, price) VALUES 
					(1, 'Item 1', 10.99),
					(2, 'Item 2', 20.99);
			`);
			db.close();

			setOrmConfig({
				database: {
					type: "sqlite",
					sqlite: { path: testDbPath },
				},
			});

			// Query builder should use the driver abstraction
			const allItems = await Model.table("items").all();
			expect(allItems).toHaveLength(2);

			const selectedItems = await Model.table("items")
				.select("id", "name")
				.all();
			expect(selectedItems).toHaveLength(2);
			expect(selectedItems[0]).not.toHaveProperty("price");

			// Cleanup
			try {
				await Bun.file(testDbPath).unlink();
			} catch {
				// Ignore
			}
		});
	});
});
