/**
 * BaseModel Tests - TDD approach
 * Following Red-Green-Refactor cycle
 */
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
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

		it("should require tableName to be set", () => {
			class TestModel extends BaseModel {
				// No tableName set
			}

			expect(() => {
				TestModel.query();
			}).toThrow("must define a tableName property");
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
});
