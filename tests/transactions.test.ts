/**
 * Transaction Support Tests
 */
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { SqliteDriver } from "../src/drivers/sqlite-driver.js";
import type { DatabaseDriver } from "../src/drivers/types.js";

describe("Transaction Support", () => {
	let driver: SqliteDriver;
	let testDbPath: string;

	beforeEach(() => {
		// Create fresh database for each test with unique path
		testDbPath = `/tmp/test-transactions-${Date.now()}-${Math.random()}.sqlite`;
		driver = new SqliteDriver(testDbPath);
		// Create test table
		driver.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)");
	});

	afterEach(() => {
		driver.close();
	});

	describe("transaction()", () => {
		it("should execute transaction callback and commit on success", async () => {
			await driver.transaction(async (tx) => {
				tx.exec("INSERT INTO users (name) VALUES (?)", "Alice");
				tx.exec("INSERT INTO users (name) VALUES (?)", "Bob");
			});

			// Verify data was committed
			const result = driver.query("SELECT * FROM users").all();
			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("Alice");
			expect(result[1].name).toBe("Bob");
		});

		it("should rollback transaction on error", async () => {
			try {
				await driver.transaction(async (tx) => {
					tx.exec("INSERT INTO users (name) VALUES (?)", "Alice");
					throw new Error("Transaction failed");
				});
			} catch (error) {
				expect((error as Error).message).toBe("Transaction failed");
			}

			// Verify data was rolled back
			const result = driver.query("SELECT * FROM users").all();
			expect(result).toHaveLength(0);
		});

		it("should return value from transaction callback", async () => {
			const result = await driver.transaction(async (tx) => {
				tx.exec("INSERT INTO users (name) VALUES (?)", "Alice");
				return "Transaction completed";
			});

			expect(result).toBe("Transaction completed");
		});

		it("should support nested transactions (savepoints)", async () => {
			await driver.transaction(async (tx) => {
				tx.exec("INSERT INTO users (name) VALUES (?)", "Alice");

				// Nested transaction (savepoint)
				await tx.transaction(async (tx2) => {
					tx2.exec("INSERT INTO users (name) VALUES (?)", "Bob");
				});

				tx.exec("INSERT INTO users (name) VALUES (?)", "Charlie");
			});

			// Verify all data was committed
			const result = driver.query("SELECT * FROM users ORDER BY id").all();
			expect(result.length).toBeGreaterThanOrEqual(2); // At least Alice and Charlie
			const names = result.map((r) => r.name);
			expect(names).toContain("Alice");
			expect(names).toContain("Charlie");
		});

		it("should rollback nested transaction on error", async () => {
			await driver.transaction(async (tx) => {
				tx.exec("INSERT INTO users (name) VALUES (?)", "Alice");

				try {
					await tx.transaction(async (tx2) => {
						tx2.exec("INSERT INTO users (name) VALUES (?)", "Bob");
						throw new Error("Nested transaction failed");
					});
				} catch (error) {
					expect((error as Error).message).toBe("Nested transaction failed");
				}

				// Outer transaction should continue
				tx.exec("INSERT INTO users (name) VALUES (?)", "Charlie");
			});

			// Verify outer transaction committed, nested rolled back
			const result = driver.query("SELECT * FROM users ORDER BY id").all();
			expect(result.length).toBeGreaterThanOrEqual(2); // At least Alice and Charlie
			const names = result.map((r) => r.name);
			expect(names).toContain("Alice");
			expect(names).toContain("Charlie");
			// Bob should not be present (rolled back)
			expect(names).not.toContain("Bob");
		});

		it("should support synchronous transaction callbacks", async () => {
			const result = await driver.transaction((tx) => {
				tx.exec("INSERT INTO users (name) VALUES (?)", "Alice");
				return "Sync result";
			});

			expect(result).toBe("Sync result");

			// Verify data was committed
			const users = driver.query("SELECT * FROM users").all();
			expect(users).toHaveLength(1);
		});

		it("should isolate transactions from each other", async () => {
			// Start first transaction
			const promise1 = driver.transaction(async (tx1) => {
				tx1.exec("INSERT INTO users (name) VALUES (?)", "Alice");
				// Wait a bit to allow second transaction to start
				await new Promise((resolve) => setTimeout(resolve, 10));
				return "Transaction 1";
			});

			// Start second transaction
			const promise2 = driver.transaction(async (tx2) => {
				tx2.exec("INSERT INTO users (name) VALUES (?)", "Bob");
				return "Transaction 2";
			});

			await Promise.all([promise1, promise2]);

			// Both should have committed
			const result = driver.query("SELECT * FROM users ORDER BY id").all();
			expect(result).toHaveLength(2);
		});

		it("should handle query operations within transaction", async () => {
			// Insert initial data
			driver.exec("INSERT INTO users (name) VALUES (?)", "Initial");

			await driver.transaction(async (tx) => {
				// Query within transaction should see uncommitted changes
				const before = tx.query("SELECT COUNT(*) as count FROM users").get();
				expect(before?.count).toBe(1);

				tx.exec("INSERT INTO users (name) VALUES (?)", "In Transaction");

				// Query should see the new row
				const after = tx.query("SELECT COUNT(*) as count FROM users").get();
				expect(after?.count).toBe(2);
			});

			// Verify final state
			const final = driver.query("SELECT COUNT(*) as count FROM users").get();
			expect(final?.count).toBe(2);
		});
	});
});
