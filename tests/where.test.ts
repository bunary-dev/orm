import { Database } from "bun:sqlite";
/**
 * Where Tests - TDD approach (basic implementation)
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Model, setOrmConfig } from "../src/index.js";
import type { OrmConfig } from "../src/types.js";

describe("where()", () => {
	let testDbPath: string;

	beforeAll(() => {
		testDbPath = `/tmp/bunary-where-test-${Date.now()}.sqlite`;

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
				email TEXT NOT NULL,
				active INTEGER NOT NULL DEFAULT 1
			);

			INSERT INTO users (name, age, email, active) VALUES
				('John Doe', 25, 'john@example.com', 1),
				('Jane Smith', 30, 'jane@example.com', 1),
				('Bob Wilson', 20, 'bob@example.com', 0),
				('Alice Brown', 35, 'alice@example.com', 1);
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

	describe("basic where conditions", () => {
		it("should filter with = operator (default)", async () => {
			const users = await Model.table("users").where("age", 25).all();

			expect(users).toHaveLength(1);
			expect(users[0].name).toBe("John Doe");
		});

		it("should filter with = operator (explicit)", async () => {
			const users = await Model.table("users").where("age", "=", 25).all();

			expect(users).toHaveLength(1);
			expect(users[0].name).toBe("John Doe");
		});

		it("should filter with > operator", async () => {
			const users = await Model.table("users").where("age", ">", 25).all();

			expect(users).toHaveLength(2);
			expect(users.some((u) => u.name === "Jane Smith")).toBe(true);
			expect(users.some((u) => u.name === "Alice Brown")).toBe(true);
		});

		it("should filter with < operator", async () => {
			const users = await Model.table("users").where("age", "<", 25).all();

			expect(users).toHaveLength(1);
			expect(users[0].name).toBe("Bob Wilson");
		});

		it("should filter with >= operator", async () => {
			const users = await Model.table("users").where("age", ">=", 30).all();

			expect(users).toHaveLength(2);
		});

		it("should filter with <= operator", async () => {
			const users = await Model.table("users").where("age", "<=", 25).all();

			expect(users).toHaveLength(2);
		});

		it("should filter with != operator", async () => {
			const users = await Model.table("users").where("age", "!=", 25).all();

			expect(users).toHaveLength(3);
		});

		it("should filter with <> operator (alternative to !=)", async () => {
			const users = await Model.table("users").where("age", "<>", 25).all();

			expect(users).toHaveLength(3);
		});
	});

	describe("where with other methods", () => {
		it("should work with limit()", async () => {
			const users = await Model.table("users")
				.where("active", 1)
				.limit(2)
				.all();

			expect(users.length).toBeLessThanOrEqual(2);
			for (const user of users) {
				expect(user.active).toBe(1);
			}
		});

		it("should work with first()", async () => {
			const user = await Model.table("users").where("age", ">", 25).first();

			expect(user).not.toBeNull();
			expect((user?.age as number) > 25).toBe(true);
		});

		it("should work with select()", async () => {
			const users = await Model.table("users")
				.where("active", 1)
				.select("id", "name")
				.all();

			expect(users.length).toBeGreaterThan(0);
			for (const user of users) {
				expect(user).toHaveProperty("id");
				expect(user).toHaveProperty("name");
				expect(user).not.toHaveProperty("age");
			}
		});

		it("should work with orderBy()", async () => {
			const users = await Model.table("users")
				.where("active", 1)
				.orderBy("age", "asc")
				.all();

			expect(users.length).toBeGreaterThan(0);
			// Verify ordering
			for (let i = 1; i < users.length; i++) {
				expect((users[i - 1].age as number) <= (users[i].age as number)).toBe(
					true,
				);
			}
		});
	});

	describe("multiple where conditions", () => {
		it("should chain multiple where conditions (AND)", async () => {
			const users = await Model.table("users")
				.where("age", ">", 25)
				.where("active", 1)
				.all();

			for (const user of users) {
				expect((user.age as number) > 25).toBe(true);
				expect(user.active).toBe(1);
			}
		});
	});
});
