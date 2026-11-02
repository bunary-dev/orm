import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("package metadata (0.4.0 baseline)", () => {
	test("version is 0.4.0", () => {
		expect(pkg.version).toBe("0.4.0");
	});

	test("@bunary/core is an optional ^0.4.0 peer", () => {
		expect(pkg.peerDependencies["@bunary/core"]).toBe("^0.4.0");
		expect(pkg.peerDependenciesMeta["@bunary/core"].optional).toBe(true);
	});

	test("@bunary/core devDependency comes from npm, not vendor/", () => {
		expect(pkg.devDependencies["@bunary/core"]).toBe("^0.4.0");
		expect(existsSync(join(ROOT, "vendor"))).toBe(false);
	});

	test("ships only dist/, README, CHANGELOG and LICENSE", () => {
		expect(pkg.files).toEqual(["dist", "README.md", "CHANGELOG.md", "LICENSE"]);
	});
});

describe("publish scripts (#97)", () => {
	test("clean empties dist/", () => {
		expect(pkg.scripts.clean).toBe("rm -rf dist");
	});

	test("build starts from a clean dist/", () => {
		expect(pkg.scripts.build.startsWith("bun run clean && ")).toBe(true);
	});

	test("prepublishOnly runs clean, then build, then tests and typecheck", () => {
		const steps = pkg.scripts.prepublishOnly
			.split("&&")
			.map((s: string) => s.trim());
		expect(steps).toEqual([
			"bun run clean",
			"bun run build",
			"bun test",
			"bun run typecheck",
		]);
	});
});
