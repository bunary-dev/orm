/**
 * Database Driver Tests
 * Testing the abstraction layer
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { MysqlDriver } from "../src/drivers/mysql-driver.js";
import { SqliteDriver } from "../src/drivers/sqlite-driver.js";
import type { DatabaseDriver } from "../src/drivers/types.js";

describe("Database Drivers", () => {
	describe("SqliteDriver", () => {
		let testDbPath: string;
		let driver: SqliteDriver;

		beforeAll(() => {
			testDbPath = `/tmp/bunary-driver-test-${Date.now()}.sqlite`;
			driver = new SqliteDriver(testDbPath);

			// Create test table
			driver.exec(`
				CREATE TABLE users (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL,
					email TEXT NOT NULL
				);

				INSERT INTO users (name, email) VALUES
					('John Doe', 'john@example.com'),
					('Jane Smith', 'jane@example.com');
			`);
		});

		afterAll(() => {
			driver.close();
			try {
				Bun.file(testDbPath).unlink();
			} catch {
				// Ignore cleanup errors
			}
		});

		it("should execute queries and return all results", () => {
			const result = driver.query("SELECT * FROM users");
			const all = result.all();

			expect(all).toHaveLength(2);
			expect(all[0].name).toBe("John Doe");
			expect(all[1].name).toBe("Jane Smith");
		});

		it("should execute queries with parameters and get single result", () => {
			const result = driver.query("SELECT * FROM users WHERE id = ?", 1);
			const row = result.get();

			expect(row).not.toBeNull();
			expect(row?.id).toBe(1);
			expect(row?.name).toBe("John Doe");
		});

		it("should execute DDL statements", () => {
			driver.exec(`
				CREATE TABLE test_table (
					id INTEGER PRIMARY KEY,
					value TEXT
				);
			`);

			const result = driver.query(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'",
			);
			const table = result.get();
			expect(table).not.toBeNull();
		});

		it("should execute parameterized statements", () => {
			driver.exec(
				"INSERT INTO users (name, email) VALUES (?, ?)",
				"Bob Wilson",
				"bob@example.com",
			);

			// Verify the insert worked by querying
			const result = driver.query(
				"SELECT * FROM users WHERE name = ?",
				"Bob Wilson",
			);
			const user = result.get();
			expect(user).not.toBeNull();
			expect(user?.name).toBe("Bob Wilson");
			expect(user?.email).toBe("bob@example.com");
		});

		it("should close the connection", () => {
			const newDriver = new SqliteDriver(
				`/tmp/bunary-driver-close-test-${Date.now()}.sqlite`,
			);
			expect(() => newDriver.close()).not.toThrow();
		});
	});

	describe("MysqlDriver", () => {
		it("should throw error when instantiated (not yet implemented)", () => {
			expect(() => {
				new MysqlDriver({
					host: "localhost",
					user: "root",
					password: "password",
					database: "test",
				});
			}).toThrow("MySQL driver is not yet implemented");
		});
	});

	describe("DatabaseDriver Interface", () => {
		it("should implement the DatabaseDriver interface", () => {
			const testDbPath = `/tmp/bunary-interface-test-${Date.now()}.sqlite`;
			const driver: DatabaseDriver = new SqliteDriver(testDbPath);

			expect(typeof driver.query).toBe("function");
			expect(typeof driver.exec).toBe("function");
			expect(typeof driver.close).toBe("function");

			driver.close();
			try {
				Bun.file(testDbPath).unlink();
			} catch {
				// Ignore
			}
		});
	});
});
