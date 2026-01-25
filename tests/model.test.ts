/**
 * Model Tests - TDD approach
 * Following Red-Green-Refactor cycle
 */
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Model, setOrmConfig } from "../src/index.js";
import type { OrmConfig } from "../src/types.js";

describe("Model", () => {
	let testDbPath: string;

	it("should export Model class", () => {
		expect(Model).toBeDefined();
		expect(typeof Model).toBe("function"); // Class is a function in JS
		expect(typeof Model.table).toBe("function");
		// Ensure class itself is referenced (for coverage)
		const ModelRef = Model;
		expect(ModelRef).toBe(Model);
	});

	it("should return QueryBuilder instance from table()", () => {
		const query = Model.table("users");
		expect(query).toBeDefined();
		expect(typeof query.all).toBe("function");
		expect(typeof query.find).toBe("function");
		expect(typeof query.select).toBe("function");
		expect(typeof query.exclude).toBe("function");
		expect(typeof query.limit).toBe("function");
		expect(typeof query.offset).toBe("function");
		expect(typeof query.orderBy).toBe("function");
		expect(typeof query.where).toBe("function");
		expect(typeof query.first).toBe("function");
		expect(typeof query.count).toBe("function");
	});

	beforeAll(() => {
		// Create a temporary test database
		testDbPath = `/tmp/bunary-orm-test-${Date.now()}.sqlite`;

		const config: OrmConfig = {
			database: {
				type: "sqlite",
				sqlite: {
					path: testDbPath,
				},
			},
		};

		setOrmConfig(config);

		// Create test table
		const db = new Database(testDbPath);
		db.exec(`
			CREATE TABLE users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				email TEXT NOT NULL,
				password TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			);

			INSERT INTO users (name, email, password, created_at) VALUES
				('John Doe', 'john@example.com', 'secret123', '2026-01-01 10:00:00'),
				('Jane Smith', 'jane@example.com', 'secret456', '2026-01-02 11:00:00'),
				('Bob Wilson', 'bob@example.com', 'secret789', '2026-01-03 12:00:00');
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

	describe("find()", () => {
		it("should find a record by id", async () => {
			const user = await Model.table("users").find(1);

			expect(user).not.toBeNull();
			expect(user?.id).toBe(1);
			expect(user?.name).toBe("John Doe");
			expect(user?.email).toBe("john@example.com");
		});

		it("should return null when record not found", async () => {
			const user = await Model.table("users").find(999);

			expect(user).toBeNull();
		});

		it("should work with string id", async () => {
			const user = await Model.table("users").find("1");

			expect(user).not.toBeNull();
			expect(user?.id).toBe(1);
		});
	});

	describe("all()", () => {
		it("should return all records", async () => {
			const users = await Model.table("users").all();

			expect(users).toHaveLength(3);
			expect(users[0].name).toBe("John Doe");
			expect(users[1].name).toBe("Jane Smith");
			expect(users[2].name).toBe("Bob Wilson");
		});

		it("should return empty array when table is empty", async () => {
			// Create empty table
			const emptyDbPath = `/tmp/bunary-orm-test-empty-${Date.now()}.sqlite`;
			const db = new Database(emptyDbPath);
			db.exec(`
				CREATE TABLE empty_table (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT
				);
			`);
			db.close();

			const config: OrmConfig = {
				database: {
					type: "sqlite",
					sqlite: {
						path: emptyDbPath,
					},
				},
			};
			setOrmConfig(config);

			const results = await Model.table("empty_table").all();

			expect(results).toHaveLength(0);

			// Cleanup
			try {
				const db2 = new Database(emptyDbPath);
				db2.close();
				await Bun.file(emptyDbPath).unlink();
			} catch {
				// Ignore
			}

			// Reset to test db
			setOrmConfig({
				database: {
					type: "sqlite",
					sqlite: { path: testDbPath },
				},
			});
		});
	});

	describe("select()", () => {
		it("should select specific columns", async () => {
			const users = await Model.table("users")
				.select("id", "name", "created_at")
				.all();

			expect(users).toHaveLength(3);
			expect(users[0]).toHaveProperty("id");
			expect(users[0]).toHaveProperty("name");
			expect(users[0]).toHaveProperty("created_at");
			expect(users[0]).not.toHaveProperty("email");
			expect(users[0]).not.toHaveProperty("password");
		});

		it("should work with find()", async () => {
			const user = await Model.table("users")
				.select("id", "name")
				.find(1);

			expect(user).not.toBeNull();
			expect(user?.id).toBe(1);
			expect(user?.name).toBe("John Doe");
			expect(user).not.toHaveProperty("email");
			expect(user).not.toHaveProperty("password");
		});

		it("should allow chaining select() calls", async () => {
			const users = await Model.table("users")
				.select("id")
				.select("name")
				.all();

			expect(users[0]).toHaveProperty("id");
			expect(users[0]).toHaveProperty("name");
			expect(users[0]).not.toHaveProperty("email");
		});
	});

	describe("exclude()", () => {
		it("should exclude specific columns", async () => {
			const users = await Model.table("users").exclude("password").all();

			expect(users).toHaveLength(3);
			expect(users[0]).toHaveProperty("id");
			expect(users[0]).toHaveProperty("name");
			expect(users[0]).toHaveProperty("email");
			expect(users[0]).toHaveProperty("created_at");
			expect(users[0]).not.toHaveProperty("password");
		});

		it("should work with find()", async () => {
			const user = await Model.table("users").exclude("password").find(1);

			expect(user).not.toBeNull();
			expect(user?.id).toBe(1);
			expect(user?.name).toBe("John Doe");
			expect(user?.email).toBe("john@example.com");
			expect(user).not.toHaveProperty("password");
		});

		it("should allow excluding multiple columns", async () => {
			const users = await Model.table("users")
				.exclude("password", "created_at")
				.all();

			expect(users[0]).toHaveProperty("id");
			expect(users[0]).toHaveProperty("name");
			expect(users[0]).toHaveProperty("email");
			expect(users[0]).not.toHaveProperty("password");
			expect(users[0]).not.toHaveProperty("created_at");
		});

		it("should allow chaining exclude() calls", async () => {
			const users = await Model.table("users")
				.exclude("password")
				.exclude("created_at")
				.all();

			expect(users[0]).not.toHaveProperty("password");
			expect(users[0]).not.toHaveProperty("created_at");
		});
	});

	describe("select() and exclude() together", () => {
		it("should prioritize select() over exclude()", async () => {
			// When both are used, select() should take precedence
			const users = await Model.table("users")
				.select("id", "name")
				.exclude("password")
				.all();

			// Should only have id and name (select takes precedence)
			expect(users[0]).toHaveProperty("id");
			expect(users[0]).toHaveProperty("name");
			expect(users[0]).not.toHaveProperty("email");
			expect(users[0]).not.toHaveProperty("password");
		});
	});

	describe("limit()", () => {
		it("should limit results through Model API", async () => {
			const users = await Model.table("users").limit(2).all();

			expect(users).toHaveLength(2);
			expect(users[0].name).toBe("John Doe");
			expect(users[1].name).toBe("Jane Smith");
		});

		it("should work with select() and limit()", async () => {
			const users = await Model.table("users")
				.select("id", "name")
				.limit(1)
				.all();

			expect(users).toHaveLength(1);
			expect(users[0]).toHaveProperty("id");
			expect(users[0]).toHaveProperty("name");
			expect(users[0]).not.toHaveProperty("email");
		});
	});

	describe("offset()", () => {
		it("should skip records through Model API", async () => {
			const users = await Model.table("users").offset(1).all();

			expect(users).toHaveLength(2);
			expect(users[0].name).toBe("Jane Smith");
			expect(users[1].name).toBe("Bob Wilson");
		});

		it("should work with limit() and offset() for pagination", async () => {
			const users = await Model.table("users")
				.limit(1)
				.offset(1)
				.all();

			expect(users).toHaveLength(1);
			expect(users[0].name).toBe("Jane Smith");
		});
	});

	describe("orderBy()", () => {
		it("should order results ascending through Model API", async () => {
			const users = await Model.table("users")
				.orderBy("name", "asc")
				.all();

			expect(users).toHaveLength(3);
			expect(users[0].name).toBe("Bob Wilson");
			expect(users[1].name).toBe("Jane Smith");
			expect(users[2].name).toBe("John Doe");
		});

		it("should order results descending through Model API", async () => {
			const users = await Model.table("users")
				.orderBy("name", "desc")
				.all();

			expect(users).toHaveLength(3);
			expect(users[0].name).toBe("John Doe");
			expect(users[1].name).toBe("Jane Smith");
			expect(users[2].name).toBe("Bob Wilson");
		});

		it("should work with limit() and orderBy()", async () => {
			const users = await Model.table("users")
				.orderBy("name", "desc")
				.limit(2)
				.all();

			expect(users).toHaveLength(2);
			expect(users[0].name).toBe("John Doe");
			expect(users[1].name).toBe("Jane Smith");
		});
	});

	describe("where()", () => {
		it("should filter results through Model API", async () => {
			const users = await Model.table("users")
				.where("name", "John Doe")
				.all();

			expect(users).toHaveLength(1);
			expect(users[0].name).toBe("John Doe");
		});

		it("should filter with operator through Model API", async () => {
			const users = await Model.table("users")
				.where("name", "!=", "John Doe")
				.all();

			expect(users).toHaveLength(2);
			expect(users.some((u) => u.name === "Jane Smith")).toBe(true);
			expect(users.some((u) => u.name === "Bob Wilson")).toBe(true);
		});

		it("should work with multiple where() conditions", async () => {
			const users = await Model.table("users")
				.where("name", "!=", "John Doe")
				.where("name", "!=", "Bob Wilson")
				.all();

			expect(users).toHaveLength(1);
			expect(users[0].name).toBe("Jane Smith");
		});

		it("should work with where() and limit()", async () => {
			const users = await Model.table("users")
				.where("name", "!=", "John Doe")
				.limit(1)
				.all();

			expect(users).toHaveLength(1);
			expect(users[0].name).not.toBe("John Doe");
		});

		it("should work with where() and orderBy()", async () => {
			const users = await Model.table("users")
				.where("name", "!=", "John Doe")
				.orderBy("name", "asc")
				.all();

			expect(users).toHaveLength(2);
			expect(users[0].name).toBe("Bob Wilson");
			expect(users[1].name).toBe("Jane Smith");
		});
	});

	describe("first()", () => {
		it("should return first record through Model API", async () => {
			const user = await Model.table("users").first();

			expect(user).not.toBeNull();
			expect(user?.id).toBe(1);
			expect(user?.name).toBe("John Doe");
		});

		it("should work with where() and first()", async () => {
			const user = await Model.table("users")
				.where("name", "Jane Smith")
				.first();

			expect(user).not.toBeNull();
			expect(user?.name).toBe("Jane Smith");
		});

		it("should work with orderBy() and first()", async () => {
			const user = await Model.table("users")
				.orderBy("name", "desc")
				.first();

			expect(user).not.toBeNull();
			expect(user?.name).toBe("John Doe");
		});

		it("should work with select() and first()", async () => {
			const user = await Model.table("users")
				.select("id", "name")
				.first();

			expect(user).not.toBeNull();
			expect(user?.id).toBe(1);
			expect(user?.name).toBe("John Doe");
			expect(user).not.toHaveProperty("email");
		});
	});

	describe("count()", () => {
		it("should return total count through Model API", async () => {
			const count = await Model.table("users").count();

			expect(count).toBe(3);
		});

		it("should work with where() and count()", async () => {
			const count = await Model.table("users")
				.where("name", "John Doe")
				.count();

			expect(count).toBe(1);
		});

		it("should work with multiple where() and count()", async () => {
			const count = await Model.table("users")
				.where("name", "!=", "John Doe")
				.where("name", "!=", "Bob Wilson")
				.count();

			expect(count).toBe(1);
		});

		it("should ignore select() when counting", async () => {
			const count = await Model.table("users")
				.select("id", "name")
				.count();

			expect(count).toBe(3);
		});

		it("should ignore limit() when counting", async () => {
			const count = await Model.table("users")
				.limit(1)
				.count();

			expect(count).toBe(3);
		});
	});

	describe("complex queries through Model API", () => {
		it("should support complex chaining: where + orderBy + limit", async () => {
			const users = await Model.table("users")
				.where("name", "!=", "Bob Wilson")
				.orderBy("name", "asc")
				.limit(1)
				.all();

			expect(users).toHaveLength(1);
			expect(users[0].name).toBe("Jane Smith");
		});

		it("should support pagination: limit + offset + orderBy", async () => {
			const users = await Model.table("users")
				.orderBy("name", "asc")
				.limit(1)
				.offset(1)
				.all();

			expect(users).toHaveLength(1);
			expect(users[0].name).toBe("Jane Smith");
		});

		it("should support where + select + orderBy + limit", async () => {
			const users = await Model.table("users")
				.where("name", "!=", "Bob Wilson")
				.select("id", "name")
				.orderBy("name", "desc")
				.limit(1)
				.all();

			expect(users).toHaveLength(1);
			expect(users[0].name).toBe("John Doe");
			expect(users[0]).toHaveProperty("id");
			expect(users[0]).toHaveProperty("name");
			expect(users[0]).not.toHaveProperty("email");
		});

		it("should support where + exclude + orderBy + first", async () => {
			const user = await Model.table("users")
				.where("name", "!=", "Bob Wilson")
				.exclude("password")
				.orderBy("name", "asc")
				.first();

			expect(user).not.toBeNull();
			expect(user?.name).toBe("Jane Smith");
			expect(user).not.toHaveProperty("password");
		});
	});
});
