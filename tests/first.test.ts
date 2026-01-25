import { Database } from "bun:sqlite";
/**
 * First Tests - TDD approach
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Model, setOrmConfig } from "../src/index.js";
import type { OrmConfig } from "../src/types.js";

describe("first()", () => {
	let testDbPath: string;

	beforeAll(() => {
		testDbPath = `/tmp/bunary-first-test-${Date.now()}.sqlite`;

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
				email TEXT NOT NULL
			);

			INSERT INTO users (name, email) VALUES
				('John Doe', 'john@example.com'),
				('Jane Smith', 'jane@example.com'),
				('Bob Wilson', 'bob@example.com');
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

	it("should return first record", async () => {
		const user = await Model.table("users").first();

		expect(user).not.toBeNull();
		expect(user?.id).toBe(1);
		expect(user?.name).toBe("John Doe");
	});

	it("should return null when table is empty", async () => {
		const emptyDbPath = `/tmp/bunary-first-empty-${Date.now()}.sqlite`;
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

		const result = await Model.table("empty_table").first();
		expect(result).toBeNull();

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

	it("should work with select()", async () => {
		const user = await Model.table("users").select("id", "name").first();

		expect(user).not.toBeNull();
		expect(user?.id).toBe(1);
		expect(user?.name).toBe("John Doe");
		expect(user).not.toHaveProperty("email");
	});

	it("should work with exclude()", async () => {
		const user = await Model.table("users").exclude("email").first();

		expect(user).not.toBeNull();
		expect(user?.id).toBe(1);
		expect(user?.name).toBe("John Doe");
		expect(user).not.toHaveProperty("email");
	});
});
