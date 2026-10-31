/**
 * Type-level checks for defineModel, compiled by `bun run typecheck`.
 */
import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { SQL } from "bun";
import { drizzle as drizzlePg } from "drizzle-orm/bun-sql";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { pgTable, text as pgText, serial } from "drizzle-orm/pg-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { defineModel, type ModelInstance } from "../src/index.js";

const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	nickname: text("nickname"),
});
const tags = sqliteTable("tags", {
	slug: text("slug").notNull(),
	label: text("label").notNull(),
});
const pgUsers = pgTable("users", {
	id: serial("id").primaryKey(),
	name: pgText("name"),
});

const db = drizzle({ client: new Database(":memory:") });
const pg = drizzlePg({ client: new SQL("postgres://localhost/unused") });

// Only type-checked; never awaited.
async function typeChecks() {
	const User = defineModel(db, users);
	const user = await User.findOrFail(1);
	const id: number = user.id;
	const name: string = user.name;
	const nickname: string | null = user.nickname;
	const saved: typeof user = await user.save();
	const dirty: Partial<{ name: string }> = user.getDirty();
	user.isDirty("name");
	// @ts-expect-error not a column
	user.isDirty("nope");
	// @ts-expect-error id is a number
	await User.find("1");
	// @ts-expect-error name is required
	await User.create({ nickname: "x" });
	await User.create({ name: "x" });
	const first: ModelInstance<typeof users> | null =
		await User.where(undefined).first();
	const rows: { id: number; name: string }[] = await User.query();

	const Tag = defineModel(db, tags, { primaryKey: tags.slug });
	await Tag.find("bun");
	// @ts-expect-error slug is a string
	await Tag.find(1);

	// @ts-expect-error a SQLite table cannot be used with a Postgres database
	defineModel(pg, users);
	const PgUser = defineModel(pg, pgUsers);
	await db.transaction(async (tx) => {
		await User.create({ name: "x" }, { tx });
		// @ts-expect-error a SQLite transaction cannot be used with a Postgres model
		await PgUser.create({ name: "x" }, { tx });
	});

	return [id, name, nickname, saved, dirty, first, rows];
}

describe("types", () => {
	it("compiles", () => {
		expect(typeof typeChecks).toBe("function");
	});
});
