import { Database } from "bun:sqlite";
/**
 * Count Tests - TDD approach
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Model, setOrmConfig } from "../src/index.js";
import type { OrmConfig } from "../src/types.js";

describe("count()", () => {
	let testDbPath: string;

	beforeAll(() => {
		testDbPath = `/tmp/bunary-count-test-${Date.now()}.sqlite`;

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
			CREATE TABLE users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				age INTEGER NOT NULL,
				active INTEGER NOT NULL DEFAULT 1
			);

			INSERT INTO users (name, age, active) VALUES
				('John Doe', 25, 1),
				('Jane Smith', 30, 1),
				('Bob Wilson', 20, 0),
				('Alice Brown', 35, 1),
				('Charlie Davis', 28, 0);
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

	it("should return total count of records", async () => {
		const count = await Model.table("users").count();

		expect(count).toBe(5);
	});

	it("should return 0 for empty table", async () => {
		const emptyDbPath = `/tmp/bunary-count-empty-${Date.now()}.sqlite`;
		const db = new Database(emptyDbPath);
		db.exec(`
			CREATE TABLE empty_table (
				id INTEGER PRIMARY KEY,
				name TEXT
			);
		`);
		db.close();

		setOrmConfig({
			database: {
				type: "sqlite",
				sqlite: { path: emptyDbPath },
			},
		});

		const count = await Model.table("empty_table").count();
		expect(count).toBe(0);

		// Cleanup
		try {
			const db2 = new Database(emptyDbPath);
			db2.close();
			await Bun.file(emptyDbPath).unlink();
		} catch {
			// Ignore
		}

		// Reset
		setOrmConfig({
			database: {
				type: "sqlite",
				sqlite: { path: testDbPath },
			},
		});
	});

	it("should work with where() conditions", async () => {
		const count = await Model.table("users").where("active", 1).count();

		expect(count).toBe(3);
	});

	it("should work with multiple where() conditions", async () => {
		const count = await Model.table("users")
			.where("active", 1)
			.where("age", ">", 25)
			.count();

		expect(count).toBe(2);
	});

	it("should ignore select() when counting", async () => {
		const count = await Model.table("users").select("id", "name").count();

		expect(count).toBe(5);
	});

	it("should ignore limit() when counting", async () => {
		const count = await Model.table("users").limit(2).count();

		expect(count).toBe(5);
	});

	it("should ignore offset() when counting", async () => {
		const count = await Model.table("users").offset(2).count();

		expect(count).toBe(5);
	});

	it("should ignore orderBy() when counting", async () => {
		const count = await Model.table("users").orderBy("name", "asc").count();

		expect(count).toBe(5);
	});
});
