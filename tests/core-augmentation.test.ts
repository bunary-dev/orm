/**
 * BunaryConfig augmentation tests (#54)
 *
 * @bunary/core 0.2.0 has no built-in `orm` key; @bunary/orm must augment
 * BunaryConfig itself, in its published declarations, without making the
 * optional @bunary/core peer a hard requirement for consumers.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	cpSync,
	mkdirSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { type BunaryConfig, defineConfig } from "@bunary/core";
import type { OrmConfig } from "../src/index.js";
import { createTempFiles } from "./helpers/temp-files.js";

const ROOT = resolve(import.meta.dir, "..");
const temp = createTempFiles();

// Type-level checks, compiled by `bun run typecheck`. They rely only on the
// augmentation in src/types.ts (no test-local `declare module`).
const typed = defineConfig({
	app: { name: "TestApp", env: "development" },
	orm: { database: { type: "sqlite", sqlite: { path: "./db.sqlite" } } },
});
const ormKey: OrmConfig | undefined = typed.orm;

defineConfig({
	app: { name: "TestApp", env: "development" },
	orm: {
		database: { type: "sqlite" },
		// @ts-expect-error unknown keys under `orm` are rejected
		bogus: true,
	},
});

defineConfig({
	app: { name: "TestApp", env: "development" },
	// @ts-expect-error `orm` must be an OrmConfig
	orm: { database: { type: "oracle" } },
});

function tsc(cwd: string, ...args: string[]) {
	const result = Bun.spawnSync(
		[process.execPath, join(ROOT, "node_modules/typescript/bin/tsc"), ...args],
		{ cwd, env: { ...process.env, BUN_BE_BUN: undefined } },
	);
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

describe("BunaryConfig augmentation", () => {
	it("types defineConfig({ orm }) with OrmConfig", () => {
		const orm: BunaryConfig["orm"] = ormKey;
		expect(orm?.database.type).toBe("sqlite");
	});

	describe("published declarations", () => {
		let distDir: string;
		let consumerDir: string;

		beforeAll(() => {
			distDir = temp.dirPath("orm-dts");
			const build = tsc(
				ROOT,
				"-p",
				"tsconfig.build.json",
				"--outDir",
				distDir,
				"--declarationMap",
				"false",
			);
			expect(build.output).toBe("");
			expect(build.exitCode).toBe(0);

			// A consumer project that installs @bunary/orm but not @bunary/core.
			consumerDir = temp.dirPath("orm-consumer");
			const pkgDir = join(consumerDir, "node_modules/@bunary/orm");
			mkdirSync(pkgDir, { recursive: true });
			cpSync(join(ROOT, "package.json"), join(pkgDir, "package.json"));
			cpSync(distDir, join(pkgDir, "dist"), { recursive: true });
			mkdirSync(join(consumerDir, "node_modules/@types"), { recursive: true });
			symlinkSync(
				join(ROOT, "node_modules/@types/bun"),
				join(consumerDir, "node_modules/@types/bun"),
			);
			symlinkSync(
				join(ROOT, "node_modules/bun-types"),
				join(consumerDir, "node_modules/bun-types"),
			);
			writeFileSync(
				join(consumerDir, "uses-orm.ts"),
				[
					'import { type OrmConfig, setOrmConfig } from "@bunary/orm";',
					'const config: OrmConfig = { database: { type: "sqlite", sqlite: { path: "x" } } };',
					"setOrmConfig(config);",
					"",
				].join("\n"),
			);
			writeFileSync(
				join(consumerDir, "uses-core.ts"),
				[
					'import { defineConfig } from "@bunary/core";',
					'import "@bunary/orm";',
					"export const ok = defineConfig({",
					'\tapp: { name: "x", env: "development" },',
					'\torm: { database: { type: "sqlite", sqlite: { path: "x" } } },',
					"});",
					"export const bad = defineConfig({",
					'\tapp: { name: "x", env: "development" },',
					"\t// @ts-expect-error unknown key under orm",
					'\torm: { database: { type: "sqlite" }, bogus: 1 },',
					"});",
					"",
				].join("\n"),
			);
		});

		afterAll(() => temp.cleanup());

		const consumerTsconfig = (files: string[]) =>
			JSON.stringify({
				compilerOptions: {
					strict: true,
					module: "Preserve",
					moduleResolution: "bundler",
					noEmit: true,
					skipLibCheck: false,
					types: ["bun"],
				},
				files,
			});

		it("ships the declare module block in dist/types.d.ts", () => {
			const dts = readFileSync(join(distDir, "types.d.ts"), "utf8");
			expect(dts).toMatch(
				/declare module "@bunary\/core" \{\s*interface BunaryConfig \{\s*orm\?: OrmConfig;/,
			);
			// The shipped declarations must not hard-import the optional peer.
			expect(dts).not.toMatch(/^import .*@bunary\/core/m);
		});

		it("typechecks for a consumer without @bunary/core installed", () => {
			writeFileSync(
				join(consumerDir, "tsconfig.json"),
				consumerTsconfig(["uses-orm.ts"]),
			);
			const result = tsc(consumerDir, "-p", ".");
			expect(result.output).toBe("");
			expect(result.exitCode).toBe(0);
		}, 60_000);

		it("types defineConfig({ orm }) for a consumer with @bunary/core", () => {
			mkdirSync(join(consumerDir, "node_modules/@bunary"), { recursive: true });
			symlinkSync(
				join(ROOT, "node_modules/@bunary/core"),
				join(consumerDir, "node_modules/@bunary/core"),
			);
			writeFileSync(
				join(consumerDir, "tsconfig.json"),
				consumerTsconfig(["uses-orm.ts", "uses-core.ts"]),
			);
			const result = tsc(consumerDir, "-p", ".");
			expect(result.output).toBe("");
			expect(result.exitCode).toBe(0);
		}, 60_000);
	});
});
