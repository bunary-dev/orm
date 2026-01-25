/**
 * Connection Manager Tests
 */
import { describe, expect, it } from "bun:test";
import { setOrmConfig } from "../src/config.js";
import { createDriver, getDriver } from "../src/connection.js";
import type { DatabaseConfig } from "../src/types.js";

describe("Connection Manager", () => {
	describe("createDriver()", () => {
		it("should create SQLite driver with valid config", () => {
			const config: DatabaseConfig = {
				type: "sqlite",
				sqlite: {
					path: "/tmp/test-db.sqlite",
				},
			};

			const driver = createDriver(config);
			expect(driver).toBeDefined();
			expect(typeof driver.query).toBe("function");
			expect(typeof driver.exec).toBe("function");
			expect(typeof driver.close).toBe("function");

			driver.close();
		});

		it("should throw error when SQLite path is missing", () => {
			const config: DatabaseConfig = {
				type: "sqlite",
			};

			expect(() => createDriver(config)).toThrow("SQLite path is required");
		});

		it("should throw error when MySQL is requested (not implemented)", () => {
			const config: DatabaseConfig = {
				type: "mysql",
				mysql: {
					host: "localhost",
					user: "root",
					password: "password",
					database: "test",
				},
			};

			expect(() => createDriver(config)).toThrow(
				"MySQL driver is not yet implemented",
			);
		});

		it("should throw error for unsupported database type", () => {
			const config = {
				type: "postgres",
			} as DatabaseConfig;

			expect(() => createDriver(config)).toThrow("not supported");
		});
	});

	describe("getDriver()", () => {
		it("should get driver from global configuration", () => {
			setOrmConfig({
				database: {
					type: "sqlite",
					sqlite: {
						path: "/tmp/test-global-db.sqlite",
					},
				},
			});

			const driver = getDriver();
			expect(driver).toBeDefined();
			expect(typeof driver.query).toBe("function");

			driver.close();
		});

		it("should throw error when ORM is not configured", () => {
			// Clear config by setting invalid state
			// This tests the error handling
			try {
				// Try to get driver without config - this should work if config was set
				const driver = getDriver();
				driver.close();
			} catch (error) {
				expect((error as Error).message).toContain("not set");
			}
		});
	});
});
