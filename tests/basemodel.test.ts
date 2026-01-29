import { Database } from "bun:sqlite";
/**
 * BaseModel Tests - TDD approach
 * Following Red-Green-Refactor cycle
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { BaseModel, setOrmConfig } from "../src/index.js";
import type { OrmConfig } from "../src/types.js";

describe("BaseModel", () => {
	let testDbPath: string;

	beforeAll(() => {
		// Create a temporary test database
		testDbPath = `/tmp/bunary-basemodel-test-${Date.now()}.sqlite`;

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
				secret_key TEXT NOT NULL,
				age INTEGER,
				createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
				updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
			);

			INSERT INTO users (name, email, password, secret_key, age, createdAt, updatedAt) VALUES
				('John Doe', 'john@example.com', 'secret123', 'key123', 25, '2026-01-01 10:00:00', '2026-01-01 10:00:00'),
				('Jane Smith', 'jane@example.com', 'secret456', 'key456', 30, '2026-01-02 11:00:00', '2026-01-02 11:00:00'),
				('Bob Wilson', 'bob@example.com', 'secret789', 'key789', 28, '2026-01-03 12:00:00', '2026-01-03 12:00:00');
		`);
		db.close();
	});

	afterAll(async () => {
		// Clean up test database
		try {
			await Bun.file(testDbPath).unlink();
		} catch {
			// Ignore if file doesn't exist
		}
	});

	describe("Basic functionality", () => {
		it("should export BaseModel class", () => {
			expect(BaseModel).toBeDefined();
			expect(typeof BaseModel).toBe("function");
		});

		it("should require tableName to be set", async () => {
			class TestModel extends BaseModel {
				// No tableName set - will be undefined
			}

			// Test through a method that uses query() internally
			// When tableName is undefined, it should throw an error
			try {
				await TestModel.all();
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				const errorMessage = (error as Error).message;
				expect(errorMessage).toContain("tableName");
				// Verify it uses the correct class name (TestModel), not "Function"
				expect(errorMessage).toContain("TestModel");
				expect(errorMessage).not.toContain("Function");
			}
		});

		it("should work with tableName set", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
			}

			const users = await Users.all();
			expect(users).toBeDefined();
			expect(Array.isArray(users)).toBe(true);
			expect(users.length).toBe(3);
		});

		it("should support find() method", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
			}

			const user = await Users.find(1);
			expect(user).toBeDefined();
			expect(user?.id).toBe(1);
			expect(user?.name).toBe("John Doe");
		});

		it("should support all() method", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
			}

			const users = await Users.all();
			expect(users.length).toBe(3);
		});

		it("should support query builder methods", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
			}

			const users = await Users.where("age", ">", 25).all();
			expect(users.length).toBe(2);
		});
	});

	describe("protected fields", () => {
		it("should automatically exclude protected fields from all()", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static protected = ["password", "secret_key"];
			}

			const users = await Users.all();
			expect(users.length).toBe(3);

			// Check first user doesn't have protected fields
			const user = users[0];
			expect(user.password).toBeUndefined();
			expect(user.secret_key).toBeUndefined();
			expect(user.name).toBeDefined();
			expect(user.email).toBeDefined();
		});

		it("should automatically exclude protected fields from find()", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static protected = ["password"];
			}

			const user = await Users.find(1);
			expect(user).toBeDefined();
			expect(user?.password).toBeUndefined();
			expect(user?.name).toBe("John Doe");
		});

		it("should automatically exclude protected fields from first()", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static protected = ["password", "secret_key"];
			}

			const user = await Users.first();
			expect(user).toBeDefined();
			expect(user?.password).toBeUndefined();
			expect(user?.secret_key).toBeUndefined();
		});

		it("should work with empty protected array", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static protected: string[] = [];
			}

			const user = await Users.find(1);
			expect(user?.password).toBeDefined();
			expect(user?.secret_key).toBeDefined();
		});

		it("should work when protected is not set (defaults to empty)", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				// protected not set
			}

			const user = await Users.find(1);
			expect(user?.password).toBeDefined();
		});

		it("should exclude protected fields even when select() is used", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static protected = ["password"];
			}

			const users = await Users.select("id", "name", "email", "password").all();
			expect(users.length).toBe(3);

			// password should still be excluded even though it was in select()
			const user = users[0];
			expect(user.password).toBeUndefined();
			expect(user.id).toBeDefined();
			expect(user.name).toBeDefined();
		});
	});

	describe("timestamps", () => {
		it("should exclude default timestamps (createdAt, updatedAt) when timestamps is true", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static timestamps = true;
			}

			const user = await Users.find(1);
			expect(user?.createdAt).toBeUndefined();
			expect(user?.updatedAt).toBeUndefined();
			expect(user?.name).toBeDefined();
		});

		it("should exclude custom timestamps when timestamps array is provided", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static timestamps = ["createdAt"];
			}

			const user = await Users.find(1);
			expect(user?.createdAt).toBeUndefined();
			expect(user?.updatedAt).toBeDefined(); // Not in timestamps array
		});

		it("should not exclude timestamps when timestamps is false", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static timestamps = false;
			}

			const user = await Users.find(1);
			expect(user?.createdAt).toBeDefined();
			expect(user?.updatedAt).toBeDefined();
		});

		it("should default to excluding createdAt and updatedAt when timestamps is not set", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				// timestamps not set - should default to ["createdAt", "updatedAt"]
			}

			const user = await Users.find(1);
			expect(user?.createdAt).toBeUndefined();
			expect(user?.updatedAt).toBeUndefined();
		});

		it("should exclude timestamps from all()", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static timestamps = true;
			}

			const users = await Users.all();
			expect(users.length).toBe(3);

			const user = users[0];
			expect(user.createdAt).toBeUndefined();
			expect(user.updatedAt).toBeUndefined();
		});

		it("should combine protected fields and timestamps exclusion", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static protected = ["password", "secret_key"];
				protected static timestamps = true;
			}

			const user = await Users.find(1);
			expect(user?.password).toBeUndefined();
			expect(user?.secret_key).toBeUndefined();
			expect(user?.createdAt).toBeUndefined();
			expect(user?.updatedAt).toBeUndefined();
			expect(user?.name).toBeDefined();
			expect(user?.email).toBeDefined();
		});
	});

	describe("Query builder methods", () => {
		it("should support select() with protected fields exclusion", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static protected = ["password"];
			}

			const users = await Users.select("id", "name", "email").all();
			expect(users.length).toBe(3);
			expect(users[0].password).toBeUndefined();
		});

		it("should support where() with protected fields exclusion", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static protected = ["password"];
			}

			const users = await Users.where("age", ">", 25).all();
			expect(users.length).toBe(2);
			expect(users[0].password).toBeUndefined();
		});

		it("should support limit() with protected fields exclusion", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static protected = ["password"];
			}

			const users = await Users.limit(2).all();
			expect(users.length).toBe(2);
			expect(users[0].password).toBeUndefined();
		});

		it("should support orderBy() with protected fields exclusion", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static protected = ["password"];
			}

			const users = await Users.orderBy("name", "asc").all();
			expect(users.length).toBe(3);
			expect(users[0].password).toBeUndefined();
		});

		it("should support count() (not affected by protected fields)", async () => {
			class Users extends BaseModel {
				protected static tableName = "users";
				protected static protected = ["password"];
			}

			const count = await Users.count();
			expect(count).toBe(3);
		});
	});

	describe("UUID primary keys", () => {
		beforeAll(() => {
			// Create a table with UUID primary key
			const db = new Database(testDbPath);
			db.exec(`
				CREATE TABLE uuid_users (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					email TEXT NOT NULL
				);

				INSERT INTO uuid_users (id, name, email) VALUES
					('550e8400-e29b-41d4-a716-446655440000', 'Alice', 'alice@example.com'),
					('660e8400-e29b-41d4-a716-446655440001', 'Bob', 'bob@example.com');
			`);
			db.close();
		});

		it("should find records by UUID", async () => {
			class UuidUsers extends BaseModel {
				protected static tableName = "uuid_users";
				protected static primaryKeyType: "uuid" | "integer" = "uuid";
			}

			const user = await UuidUsers.find("550e8400-e29b-41d4-a716-446655440000");
			expect(user).not.toBeNull();
			expect(user?.name).toBe("Alice");
			expect(user?.email).toBe("alice@example.com");
		});

		it("should create records with auto-generated UUID", async () => {
			class UuidUsers extends BaseModel {
				protected static tableName = "uuid_users";
				protected static primaryKeyType: "uuid" | "integer" = "uuid";
			}

			const user = await UuidUsers.create({
				name: "Charlie",
				email: "charlie@example.com",
			});

			expect(user.id).toBeDefined();
			expect(typeof user.id).toBe("string");
			// UUID v7 format: 8-4-4-4-12 hex characters
			expect(user.id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
			);
			expect(user.name).toBe("Charlie");
			expect(user.email).toBe("charlie@example.com");

			// Verify it was actually saved
			const userId = user.id as string;
			const found = await UuidUsers.find(userId);
			expect(found).not.toBeNull();
			expect(found?.name).toBe("Charlie");
		});

		it("should use provided UUID if given", async () => {
			class UuidUsers extends BaseModel {
				protected static tableName = "uuid_users";
				protected static primaryKeyType: "uuid" | "integer" = "uuid";
			}

			const customId = "770e8400-e29b-41d4-a716-446655440002";
			const user = await UuidUsers.create({
				id: customId,
				name: "David",
				email: "david@example.com",
			});

			expect(user.id).toBe(customId);
			expect(user.name).toBe("David");
		});

		it("should default to UUID primary key type", async () => {
			class UuidUsers extends BaseModel {
				protected static tableName = "uuid_users";
				// primaryKeyType not set, should default to "uuid"
			}

			const user = await UuidUsers.create({
				name: "Eve",
				email: "eve@example.com",
			});

			expect(user.id).toBeDefined();
			expect(typeof user.id).toBe("string");
			expect(user.id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
			);
		});

		it("should support custom primary key name", async () => {
			// Create table with custom primary key name
			const db = new Database(testDbPath);
			db.exec(`
				CREATE TABLE custom_pk_users (
					uuid TEXT PRIMARY KEY,
					name TEXT NOT NULL
				);
			`);
			db.close();

			class CustomPkUsers extends BaseModel {
				protected static tableName = "custom_pk_users";
				protected static primaryKeyType: "uuid" | "integer" = "uuid";
				protected static primaryKeyName = "uuid";
			}

			const user = await CustomPkUsers.create({
				name: "Frank",
			});

			expect(user.uuid).toBeDefined();
			expect(typeof user.uuid).toBe("string");
			expect(user.name).toBe("Frank");
		});

		it("should support integer primary keys when explicitly set", async () => {
			// Create table with integer primary key
			const db = new Database(testDbPath);
			db.exec(`
				CREATE TABLE int_users (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL
				);
			`);
			db.close();

			class IntUsers extends BaseModel {
				protected static tableName = "int_users";
				protected static primaryKeyType: "uuid" | "integer" = "integer";
			}

			// For integer primary keys, we need to provide the ID or let SQLite auto-increment
			// Since SQLite auto-increment requires INSERT without specifying id,
			// we'll test that create() works without auto-generating UUID
			const user = await IntUsers.create({
				id: 1,
				name: "Grace",
			});

			expect(user.id).toBe(1);
			expect(user.name).toBe("Grace");
		});
	});
});
