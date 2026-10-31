/**
 * BunaryConfig augmentation: `@bunary/orm` adds `database?: DatabaseConfig`
 * to `@bunary/core`'s BunaryConfig in its published declarations, without
 * making the optional @bunary/core peer a requirement for typechecking.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type BunaryConfig, defineConfig } from "@bunary/core";
import type { DatabaseConfig } from "../src/index.js";

const ROOT = resolve(import.meta.dir, "..");

// Type-level checks, compiled by `bun run typecheck`. They rely only on the
// augmentation shipped from src/ (no test-local `declare module`).
const typed = defineConfig({
	app: { name: "TestApp" },
	database: { dialect: "sqlite", path: "./db.sqlite" },
});
const databaseKey: DatabaseConfig | undefined = typed.database;

defineConfig({
	app: { name: "TestApp" },
	database: { dialect: "postgres", url: "postgres://localhost/app" },
});

defineConfig({
	app: { name: "TestApp" },
	database: {
		dialect: "sqlite",
		path: "x",
		// @ts-expect-error unknown keys under `database` are rejected
		bogus: true,
	},
});

defineConfig({
	app: { name: "TestApp" },
	// @ts-expect-error `postgres` needs a url, not a path
	database: { dialect: "postgres", path: "x" },
});

defineConfig({
	app: { name: "TestApp" },
	// @ts-expect-error unsupported dialect
	database: { dialect: "mysql", url: "x" },
});

/**
 * tsc errors outside drizzle-orm: its own declarations do not pass
 * TypeScript 7's lib check, which a consumer turns off with skipLibCheck.
 */
function ownErrors(output: string): string[] {
	return output
		.split("\n")
		.filter((line) => / error TS\d+:/.test(line))
		.filter((line) => !line.includes("node_modules/drizzle-orm/"));
}

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
	it("types defineConfig({ database }) with DatabaseConfig", () => {
		const database: BunaryConfig["database"] = databaseKey;
		expect(database?.dialect).toBe("sqlite");
	});

	describe("published declarations", () => {
		let temp: string;
		let distDir: string;
		let consumerDir: string;

		beforeAll(() => {
			temp = mkdtempSync(join(tmpdir(), "orm-dts-"));
			distDir = join(temp, "dist");
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
			consumerDir = join(temp, "consumer");
			const pkgDir = join(consumerDir, "node_modules/@bunary/orm");
			mkdirSync(pkgDir, { recursive: true });
			cpSync(join(ROOT, "package.json"), join(pkgDir, "package.json"));
			cpSync(distDir, join(pkgDir, "dist"), { recursive: true });
			mkdirSync(join(consumerDir, "node_modules/@types"), { recursive: true });
			for (const dep of ["@types/bun", "bun-types", "drizzle-orm"]) {
				symlinkSync(
					join(ROOT, "node_modules", dep),
					join(consumerDir, "node_modules", dep),
				);
			}
			writeFileSync(
				join(consumerDir, "uses-orm.ts"),
				[
					'import { Database } from "bun:sqlite";',
					'import { drizzle } from "drizzle-orm/bun-sqlite";',
					'import { integer, sqliteTable } from "drizzle-orm/sqlite-core";',
					'import { type DatabaseConfig, defineModel } from "@bunary/orm";',
					'export const config: DatabaseConfig = { dialect: "sqlite", path: "x" };',
					'const t = sqliteTable("t", { id: integer().primaryKey() });',
					"export const T = defineModel(drizzle({ client: new Database() }), t);",
					"",
				].join("\n"),
			);
			writeFileSync(
				join(consumerDir, "uses-core.ts"),
				[
					'import { defineConfig } from "@bunary/core";',
					'import "@bunary/orm";',
					'import { DatabaseToken, ormProvider } from "@bunary/orm/provider";',
					"export const ok = defineConfig({",
					'\tapp: { name: "x" },',
					'\tdatabase: { dialect: "sqlite", path: "x" },',
					"});",
					"export const bad = defineConfig({",
					'\tapp: { name: "x" },',
					"\t// @ts-expect-error unknown key under database",
					'\tdatabase: { dialect: "sqlite", path: "x", bogus: 1 },',
					"});",
					"export const provider = ormProvider();",
					"export const token = DatabaseToken;",
					"",
				].join("\n"),
			);
			writeFileSync(
				join(consumerDir, "uses-provider.ts"),
				[
					'import { ormProvider } from "@bunary/orm/provider";',
					"export const provider = ormProvider();",
					"",
				].join("\n"),
			);
		});

		afterAll(() => rmSync(temp, { recursive: true, force: true }));

		const consumerTsconfig = (files: string[]) =>
			JSON.stringify({
				compilerOptions: {
					strict: true,
					module: "Preserve",
					moduleResolution: "bundler",
					noEmit: true,
					// Lib check on, so a missing module in our .d.ts is reported.
					skipLibCheck: false,
					types: ["bun"],
				},
				files,
			});

		it("ships the declare module block without importing @bunary/core", () => {
			const dts = readFileSync(join(distDir, "config.d.ts"), "utf8");
			expect(dts).toMatch(
				/declare module "@bunary\/core" \{\s*interface BunaryConfig \{\s*(\/\*\*[\s\S]*?\*\/\s*)?database\?: DatabaseConfig;/,
			);
			expect(dts).not.toMatch(/^import .*@bunary\/core/m);
			const index = readFileSync(join(distDir, "index.d.ts"), "utf8");
			expect(index).not.toMatch(/from "\.\/provider\.js"/);
		});

		it("typechecks for a consumer without @bunary/core installed", () => {
			writeFileSync(
				join(consumerDir, "tsconfig.json"),
				consumerTsconfig(["uses-orm.ts"]),
			);
			const result = tsc(consumerDir, "-p", ".");
			expect(ownErrors(result.output)).toEqual([]);
		}, 60_000);

		it("reports the missing peer for @bunary/orm/provider without @bunary/core", () => {
			writeFileSync(
				join(consumerDir, "tsconfig.json"),
				consumerTsconfig(["uses-provider.ts"]),
			);
			const result = tsc(consumerDir, "-p", ".");
			const errors = ownErrors(result.output).join("\n");
			expect(errors).toContain("dist/provider.d.ts");
			expect(errors).toContain("Cannot find module '@bunary/core'");
		}, 60_000);

		it("types defineConfig({ database }) for a consumer with @bunary/core", () => {
			symlinkSync(
				join(ROOT, "node_modules/@bunary/core"),
				join(consumerDir, "node_modules/@bunary/core"),
			);
			symlinkSync(
				join(ROOT, "node_modules/@standard-schema"),
				join(consumerDir, "node_modules/@standard-schema"),
			);
			writeFileSync(
				join(consumerDir, "tsconfig.json"),
				consumerTsconfig(["uses-orm.ts", "uses-core.ts"]),
			);
			const result = tsc(consumerDir, "-p", ".");
			expect(ownErrors(result.output)).toEqual([]);
		}, 60_000);
	});
});
