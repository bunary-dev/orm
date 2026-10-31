/**
 * ormProvider / DatabaseToken: core integration on the `database` config key.
 */
import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunaryError, createApp } from "@bunary/core";
import { is, relations, sql } from "drizzle-orm";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { PgDatabase } from "drizzle-orm/pg-core";
import {
	BaseSQLiteDatabase,
	integer,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { type DatabaseConfig, defineModel } from "../src/index.js";
import { DatabaseToken, ormProvider } from "../src/provider.js";
import { persisted } from "./helpers/persisted.js";

const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
});
const posts = sqliteTable("posts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	authorId: integer("author_id").notNull(),
	title: text("title").notNull(),
});
const schema = {
	users,
	posts,
	usersRelations: relations(users, ({ many }) => ({ posts: many(posts) })),
	postsRelations: relations(posts, ({ one }) => ({
		author: one(users, { fields: [posts.authorId], references: [users.id] }),
	})),
};
type Db = BunSQLiteDatabase<typeof schema>;

const dir = mkdtempSync(join(tmpdir(), "orm-provider-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function boot(
	database: DatabaseConfig | undefined,
	providerSchema?: Record<string, unknown>,
) {
	return createApp({
		config: { app: { name: "orm-test" }, database },
		providers: [ormProvider(providerSchema ? { schema: providerSchema } : {})],
	}).boot();
}

const createTables = (db: Db) => {
	db.run(
		sql`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`,
	);
	db.run(
		sql`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_id INTEGER NOT NULL, title TEXT NOT NULL)`,
	);
};

describe("ormProvider", () => {
	it("is a named core provider", () => {
		expect(ormProvider().name).toBe("@bunary/orm");
		expect(String(DatabaseToken)).toBe("Token(orm.database)");
	});

	it("builds a working SQLite db from the database config key", async () => {
		const app = await boot({ dialect: "sqlite", path: ":memory:" }, schema);
		const db = app.get(DatabaseToken) as Db;
		expect(is(db, BaseSQLiteDatabase)).toBe(true);
		createTables(db);

		const User = defineModel(db, users);
		const Post = defineModel(db, posts);
		const ada = persisted(await User.create({ name: "Ada" }));
		await Post.create({ authorId: ada.id, title: "Notes" });

		expect((await User.findOrFail(ada.id)).name).toBe("Ada");
		const loaded = await User.with({ posts: Post }).findOrFail(ada.id);
		expect(loaded.posts.map((p) => p.title)).toEqual(["Notes"]);
	});

	it("opens the SQLite file at the configured path", async () => {
		const path = join(dir, "app.sqlite");
		const first = await boot({ dialect: "sqlite", path });
		const db = first.get(DatabaseToken) as Db;
		createTables(db);
		await defineModel(db, users).create({ name: "Ada" });

		const second = await boot({ dialect: "sqlite", path });
		const again = defineModel(second.get(DatabaseToken) as Db, users);
		expect((await again.where(undefined).get()).map((u) => u.name)).toEqual([
			"Ada",
		]);
	});

	it("gives every app its own db", async () => {
		const a = await boot({ dialect: "sqlite", path: ":memory:" });
		const b = await boot({ dialect: "sqlite", path: ":memory:" });
		expect(a.get(DatabaseToken)).not.toBe(b.get(DatabaseToken));
	});

	it("builds a Postgres db (drizzle-orm/bun-sql) without connecting", async () => {
		const app = await boot({
			dialect: "postgres",
			url: "postgres://user:pass@127.0.0.1:1/unused",
		});
		const db = app.get(DatabaseToken) as BunSQLDatabase;
		expect(is(db, PgDatabase)).toBe(true);
	});

	it.skipIf(!process.env.TEST_POSTGRES_URL)(
		"builds a working Postgres db",
		async () => {
			const app = await boot({
				dialect: "postgres",
				url: process.env.TEST_POSTGRES_URL as string,
			});
			const db = app.get(DatabaseToken) as BunSQLDatabase;
			const rows = await db.execute(sql`select 1 as one`);
			expect([...rows]).toEqual([{ one: 1 }]);
			await (
				db as unknown as { $client: { close(): Promise<void> } }
			).$client.close();
		},
	);

	it("rejects boot without a database config", async () => {
		const failed = boot(undefined);
		await expect(failed).rejects.toBeInstanceOf(BunaryError);
		await expect(failed).rejects.toThrow(
			'BunaryConfig: "database" is required by ormProvider',
		);
	});

	it("rejects boot for an invalid database config", async () => {
		const cases: [unknown, string][] = [
			["sqlite", 'BunaryConfig: "database" must be an object'],
			[
				{ dialect: "mysql" },
				'BunaryConfig: "database.dialect" must be "sqlite" or "postgres"',
			],
			[
				{ dialect: "sqlite" },
				'BunaryConfig: "database.path" must be a non-empty string',
			],
			[
				{ dialect: "postgres", url: "" },
				'BunaryConfig: "database.url" must be a non-empty string',
			],
		];
		for (const [database, message] of cases) {
			await expect(boot(database as DatabaseConfig)).rejects.toThrow(message);
		}
	});
});
