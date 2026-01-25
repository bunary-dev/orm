/**
 * Config Tests - TDD approach
 */
import { describe, expect, it, beforeEach } from "bun:test";
import {
	clearOrmConfig,
	defineOrmConfig,
	getOrmConfig,
	setOrmConfig,
} from "../src/config.js";
import type { OrmConfig } from "../src/types.js";

describe("Config", () => {
	beforeEach(() => {
		// Clear config before each test
		setOrmConfig({
			database: {
				type: "sqlite",
				sqlite: { path: "/tmp/test.sqlite" },
			},
		});
	});

	describe("defineOrmConfig()", () => {
		it("should define and return validated config", () => {
			const config: OrmConfig = {
				database: {
					type: "sqlite",
					sqlite: {
						path: "./database.sqlite",
					},
				},
			};

			const result = defineOrmConfig(config);

			expect(result).toEqual({
				database: {
					type: "sqlite",
					sqlite: {
						path: "./database.sqlite",
					},
					mysql: undefined,
				},
			});
		});

		it("should set global config when called", () => {
			const config: OrmConfig = {
				database: {
					type: "sqlite",
					sqlite: {
						path: "./test.sqlite",
					},
				},
			};

			defineOrmConfig(config);

			const globalConfig = getOrmConfig();
			expect(globalConfig.database.type).toBe("sqlite");
			expect(globalConfig.database.sqlite?.path).toBe("./test.sqlite");
		});

		it("should handle MySQL config structure", () => {
			const config: OrmConfig = {
				database: {
					type: "mysql",
					mysql: {
						host: "localhost",
						user: "root",
						password: "password",
						database: "test",
					},
				},
			};

			const result = defineOrmConfig(config);

			expect(result.database.type).toBe("mysql");
			expect(result.database.mysql?.host).toBe("localhost");
		});
	});

	describe("setOrmConfig()", () => {
		it("should set global configuration", () => {
			const config: OrmConfig = {
				database: {
					type: "sqlite",
					sqlite: {
						path: "./test.sqlite",
					},
				},
			};

			setOrmConfig(config);

			const globalConfig = getOrmConfig();
			expect(globalConfig.database.type).toBe("sqlite");
			expect(globalConfig.database.sqlite?.path).toBe("./test.sqlite");
		});

		it("should overwrite previous configuration", () => {
			setOrmConfig({
				database: {
					type: "sqlite",
					sqlite: { path: "./first.sqlite" },
				},
			});

			setOrmConfig({
				database: {
					type: "sqlite",
					sqlite: { path: "./second.sqlite" },
				},
			});

			const config = getOrmConfig();
			expect(config.database.sqlite?.path).toBe("./second.sqlite");
		});
	});

	describe("getOrmConfig()", () => {
		it("should return current global configuration", () => {
			const config: OrmConfig = {
				database: {
					type: "sqlite",
					sqlite: {
						path: "./test.sqlite",
					},
				},
			};

			setOrmConfig(config);
			const result = getOrmConfig();

			expect(result).toEqual(config);
		});

		it("should return config after defineOrmConfig()", () => {
			const config: OrmConfig = {
				database: {
					type: "sqlite",
					sqlite: { path: "./test.sqlite" },
				},
			};

			defineOrmConfig(config);
			const result = getOrmConfig();

			expect(result.database.type).toBe("sqlite");
			expect(result.database.sqlite?.path).toBe("./test.sqlite");
		});

		it("should throw error when config is not set", () => {
			// Clear config to test error path
			clearOrmConfig();

			expect(() => {
				getOrmConfig();
			}).toThrow("ORM configuration not set");
		});
	});
});
