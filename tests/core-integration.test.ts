/**
 * Core Integration Tests - Testing @bunary/core integration
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { createConfig, defineConfig } from "@bunary/core";
import { clearOrmConfig, getOrmConfig } from "../src/config.js";

describe("Core Integration", () => {
	beforeEach(() => {
		clearOrmConfig();
		// Clear any global core config
		// biome-ignore lint/suspicious/noExplicitAny: Testing global state
		(globalThis as any).__bunaryCoreConfigStore = undefined;
	});

	it("should read ORM config from @bunary/core config store", () => {
		// Create a config store with ORM config
		const configStore = createConfig(
			defineConfig({
				app: {
					name: "TestApp",
					env: "development",
				},
				orm: {
					database: {
						type: "sqlite",
						sqlite: {
							path: "./test-db.sqlite",
						},
					},
				},
			}),
		);

		// Store the config store globally so ORM can access it
		// biome-ignore lint/suspicious/noExplicitAny: Testing global state
		(globalThis as any).__bunaryCoreConfigStore = configStore;

		// ORM should be able to read the config
		const ormConfig = getOrmConfig();
		expect(ormConfig.database.type).toBe("sqlite");
		expect(ormConfig.database.sqlite?.path).toBe("./test-db.sqlite");
	});

	it("should gracefully handle when core config is not available", () => {
		// No core config set up
		expect(() => {
			getOrmConfig();
		}).toThrow("ORM configuration not set");
	});

	it("should work when core config has no ORM config", () => {
		const configStore = createConfig(
			defineConfig({
				app: {
					name: "TestApp",
					env: "development",
				},
				// No ORM config
			}),
		);

		// biome-ignore lint/suspicious/noExplicitAny: Testing global state
		(globalThis as any).__bunaryCoreConfigStore = configStore;

		// Should throw because no ORM config in core
		expect(() => {
			getOrmConfig();
		}).toThrow("ORM configuration not set");
	});
});
