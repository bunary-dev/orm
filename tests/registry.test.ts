/**
 * Driver Registry Tests
 */
import { beforeEach, describe, expect, it } from "bun:test";
import {
	clearDriverRegistry,
	createDriver,
	registerDriver,
} from "../src/connection.js";
import type { DatabaseDriver } from "../src/drivers/types.js";
import type { DatabaseConfig } from "../src/types.js";

describe("Driver Registry", () => {
	beforeEach(() => {
		// Clear registry before each test
		clearDriverRegistry();
	});

	describe("registerDriver()", () => {
		it("should register a custom driver factory", () => {
			const mockDriver: DatabaseDriver = {
				query: () => ({
					all: () => [],
					get: () => null,
				}),
				exec: () => 0,
				transaction: async (fn) => fn(mockDriver),
				close: () => {},
			};

			const factory = (config: DatabaseConfig) => {
				expect(config.type as string).toBe("custom");
				return mockDriver;
			};

			registerDriver("custom", factory);

			const config = {
				type: "custom",
			} as unknown as DatabaseConfig;

			const driver = createDriver(config);
			expect(driver).toBe(mockDriver);
		});

		it("should allow overriding built-in drivers", () => {
			const mockSqliteDriver: DatabaseDriver = {
				query: () => ({
					all: () => [{ id: 1, name: "test" }],
					get: () => ({ id: 1, name: "test" }),
				}),
				exec: () => 1,
				transaction: async (fn) => fn(mockSqliteDriver),
				close: () => {},
			};

			const factory = () => mockSqliteDriver;

			registerDriver("sqlite", factory);

			const config: DatabaseConfig = {
				type: "sqlite",
				sqlite: {
					path: "/tmp/test.sqlite",
				},
			};

			const driver = createDriver(config);
			expect(driver).toBe(mockSqliteDriver);
			expect(driver.query("SELECT * FROM users").all()).toEqual([
				{ id: 1, name: "test" },
			]);
		});

		it("should throw error when registering invalid factory", () => {
			expect(() => {
				registerDriver("invalid", null as unknown as () => DatabaseDriver);
			}).toThrow("must be a function");
		});
	});

	describe("createDriver() with registry", () => {
		it("should use registered driver when available", () => {
			const customDriver: DatabaseDriver = {
				query: () => ({
					all: () => [],
					get: () => null,
				}),
				exec: () => 0,
				transaction: async (fn) => fn(customDriver),
				close: () => {},
			};

			registerDriver("postgres", () => customDriver);

			const config: DatabaseConfig = {
				type: "postgres",
			};

			const driver = createDriver(config);
			expect(driver).toBe(customDriver);
		});

		it("should fall back to built-in drivers when not registered", () => {
			const config: DatabaseConfig = {
				type: "sqlite",
				sqlite: {
					path: "/tmp/test-fallback.sqlite",
				},
			};

			// Don't register sqlite, should use built-in
			const driver = createDriver(config);
			expect(driver).toBeDefined();
			expect(typeof driver.query).toBe("function");
			driver.close();
		});

		it("should throw error for unknown driver type when not registered", () => {
			const config = {
				type: "unknown",
			} as unknown as DatabaseConfig;

			expect(() => createDriver(config)).toThrow("not supported");
		});
	});

	describe("Registry isolation", () => {
		it("should support multiple driver registrations", () => {
			const driver1: DatabaseDriver = {
				query: () => ({
					all: () => [],
					get: () => null,
				}),
				exec: () => 0,
				transaction: async (fn) => fn(driver1),
				close: () => {},
			};

			const driver2: DatabaseDriver = {
				query: () => ({
					all: () => [],
					get: () => null,
				}),
				exec: () => 0,
				transaction: async (fn) => fn(driver2),
				close: () => {},
			};

			registerDriver("type1", () => driver1);
			registerDriver("type2", () => driver2);

			const config1 = { type: "type1" } as unknown as DatabaseConfig;
			const config2 = { type: "type2" } as unknown as DatabaseConfig;

			expect(createDriver(config1)).toBe(driver1);
			expect(createDriver(config2)).toBe(driver2);
		});
	});
});
