/**
 * Driver Caching and Reuse Tests
 */
import { beforeEach, describe, expect, it } from "bun:test";
import {
	clearOrmConfig,
	closeDriver,
	getDriver,
	resetDriver,
	setOrmConfig,
} from "../src/index.js";

describe("Driver Caching and Reuse", () => {
	beforeEach(() => {
		// Clear config and driver cache before each test
		clearOrmConfig();
		resetDriver();
	});

	describe("getDriver() caching", () => {
		it("should return the same driver instance on repeated calls", () => {
			setOrmConfig({
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-cache.sqlite",
					},
				},
			});

			const driver1 = getDriver();
			const driver2 = getDriver();
			const driver3 = getDriver();

			expect(driver1).toBe(driver2);
			expect(driver2).toBe(driver3);
			expect(driver1).toBe(driver3);

			driver1.close();
		});

		it("should return the same driver instance for the same config", () => {
			const config = {
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-same-config.sqlite",
					},
				},
			};

			setOrmConfig(config);
			const driver1 = getDriver();

			setOrmConfig(config);
			const driver2 = getDriver();

			expect(driver1).toBe(driver2);

			driver1.close();
		});
	});

	describe("Config change invalidation", () => {
		it("should create new driver when config changes", () => {
			setOrmConfig({
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-config1.sqlite",
					},
				},
			});

			const driver1 = getDriver();

			setOrmConfig({
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-config2.sqlite",
					},
				},
			});

			const driver2 = getDriver();

			expect(driver1).not.toBe(driver2);

			driver1.close();
			driver2.close();
		});

		it("should create new driver when database type changes", () => {
			setOrmConfig({
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-type1.sqlite",
					},
				},
			});

			const driver1 = getDriver();

			// Change to different path (same type)
			setOrmConfig({
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-type2.sqlite",
					},
				},
			});

			const driver2 = getDriver();

			expect(driver1).not.toBe(driver2);

			driver1.close();
			driver2.close();
		});
	});

	describe("closeDriver()", () => {
		it("should close the cached driver", () => {
			setOrmConfig({
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-close.sqlite",
					},
				},
			});

			const driver1 = getDriver();
			closeDriver();

			// After closing, getDriver() should create a new instance
			const driver2 = getDriver();

			expect(driver1).not.toBe(driver2);

			driver2.close();
		});

		it("should be safe to call closeDriver() multiple times", () => {
			setOrmConfig({
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-close-multiple.sqlite",
					},
				},
			});

			getDriver();
			closeDriver();
			expect(() => closeDriver()).not.toThrow();
		});

		it("should be safe to call closeDriver() when no driver is cached", () => {
			expect(() => closeDriver()).not.toThrow();
		});
	});

	describe("resetDriver()", () => {
		it("should clear the cached driver without closing it", () => {
			setOrmConfig({
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-reset.sqlite",
					},
				},
			});

			const driver1 = getDriver();
			resetDriver();

			// After reset, getDriver() should create a new instance
			const driver2 = getDriver();

			expect(driver1).not.toBe(driver2);

			// Original driver should still be usable (not closed)
			expect(() => driver1.query("SELECT 1")).not.toThrow();

			driver1.close();
			driver2.close();
		});

		it("should be safe to call resetDriver() multiple times", () => {
			setOrmConfig({
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-reset-multiple.sqlite",
					},
				},
			});

			getDriver();
			resetDriver();
			expect(() => resetDriver()).not.toThrow();
		});

		it("should be safe to call resetDriver() when no driver is cached", () => {
			expect(() => resetDriver()).not.toThrow();
		});
	});

	describe("Integration with config changes", () => {
		it("should handle config change after resetDriver()", () => {
			setOrmConfig({
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-integration1.sqlite",
					},
				},
			});

			const driver1 = getDriver();
			resetDriver();

			setOrmConfig({
				database: {
					type: "sqlite" as const,
					sqlite: {
						path: "/tmp/test-integration2.sqlite",
					},
				},
			});

			const driver2 = getDriver();

			expect(driver1).not.toBe(driver2);

			driver1.close();
			driver2.close();
		});
	});
});
