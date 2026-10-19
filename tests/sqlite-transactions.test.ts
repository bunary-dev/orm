import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { SqliteDriver } from "../src/drivers/sqlite-driver.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("SqliteDriver transactions (concurrency)", () => {
	let driver: SqliteDriver;

	beforeEach(() => {
		driver = new SqliteDriver(":memory:");
		driver.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
	});
	afterEach(() => driver.close());

	const values = () =>
		(driver.query("SELECT v FROM t ORDER BY id").all() as { v: string }[]).map(
			(r) => r.v,
		);

	it("serializes concurrent top-level transactions", async () => {
		const order: string[] = [];
		const run = (name: string) =>
			driver.transaction(async (tx) => {
				order.push(`start ${name}`);
				tx.run("INSERT INTO t (v) VALUES (?)", name);
				await sleep(10);
				order.push(`end ${name}`);
				return name;
			});
		const results = await Promise.all([run("a"), run("b"), run("c")]);
		expect(results).toEqual(["a", "b", "c"]);
		expect(values()).toEqual(["a", "b", "c"]);
		expect(order).toEqual([
			"start a",
			"end a",
			"start b",
			"end b",
			"start c",
			"end c",
		]);
	});

	it("rolls back on async error and keeps the queue working", async () => {
		const failing = driver.transaction(async (tx) => {
			tx.run("INSERT INTO t (v) VALUES (?)", "bad");
			await sleep(5);
			throw new Error("boom");
		});
		const ok = driver.transaction(async (tx) => {
			tx.run("INSERT INTO t (v) VALUES (?)", "good");
		});
		await expect(failing).rejects.toThrow("boom");
		await ok;
		expect(values()).toEqual(["good"]);
	});

	it("rolls back and rejects when COMMIT fails", async () => {
		driver.exec("CREATE TABLE p (id INTEGER PRIMARY KEY)");
		driver.exec(
			"CREATE TABLE c (pid INTEGER REFERENCES p(id) DEFERRABLE INITIALLY DEFERRED)",
		);
		driver.exec("PRAGMA foreign_keys = ON");
		await expect(
			driver.transaction(async (tx) => {
				tx.run("INSERT INTO c (pid) VALUES (999)");
			}),
		).rejects.toThrow();
		expect(driver.getRawDatabase().inTransaction).toBe(false);
		expect(driver.query("SELECT * FROM c").all()).toEqual([]);
		await driver.transaction(async (tx) => {
			tx.run("INSERT INTO t (v) VALUES (?)", "after");
		});
		expect(values()).toEqual(["after"]);
	});

	it("supports nested savepoints, rolling back only the inner on error", async () => {
		await driver.transaction(async (tx) => {
			tx.run("INSERT INTO t (v) VALUES (?)", "outer");
			await expect(
				tx.transaction(async (inner) => {
					inner.run("INSERT INTO t (v) VALUES (?)", "inner-bad");
					await sleep(5);
					throw new Error("inner");
				}),
			).rejects.toThrow("inner");
			await tx.transaction(async (inner) => {
				inner.run("INSERT INTO t (v) VALUES (?)", "inner-ok");
			});
		});
		expect(values()).toEqual(["outer", "inner-ok"]);
	});

	it("serializes concurrent sibling savepoints", async () => {
		await driver.transaction(async (tx) => {
			await Promise.all([
				tx.transaction(async (s) => {
					s.run("INSERT INTO t (v) VALUES (?)", "s1");
					await sleep(15);
				}),
				tx
					.transaction(async (s) => {
						s.run("INSERT INTO t (v) VALUES (?)", "s2");
						throw new Error("s2 fails");
					})
					.catch(() => undefined),
			]);
		});
		expect(values()).toEqual(["s1"]);
	});

	it("rolls back the whole transaction when the outer callback fails after a nested one", async () => {
		await expect(
			driver.transaction(async (tx) => {
				await tx.transaction(async (s) => {
					s.run("INSERT INTO t (v) VALUES (?)", "x");
				});
				throw new Error("outer");
			}),
		).rejects.toThrow("outer");
		expect(values()).toEqual([]);
	});
});
