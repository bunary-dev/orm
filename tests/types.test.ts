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
	const saved: typeof user | false = await user.save();
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

	// Events: listeners get the instance (or, for creating, the insert values).
	const Evented = defineModel(db, users, {
		events: {
			creating: (values) => {
				const n: string = values.name;
				// @ts-expect-error not a column
				values.nope;
				return n !== "";
			},
			updating: [async (u) => u.isDirty("name"), (u) => void u.name],
			saving: (target) => {
				if ("isDirty" in target) target.isDirty();
			},
			deleting: async () => {},
		},
	});
	const off: () => void = Evented.on("deleting", (u) => u.id > 0);
	// @ts-expect-error not a model event
	Evented.on("created", () => {});
	// @ts-expect-error not an event listed in options
	defineModel(db, users, { events: { deleted: () => {} } });
	const createdOrFalse = await Evented.create({ name: "x" });
	// @ts-expect-error create() may resolve to false
	createdOrFalse.id;
	const savedOrFalse: typeof user | false = await user.save();
	const deletedOrFalse: boolean = await user.delete();
	const updatedCount: number = await User.where(undefined).update({
		name: "y",
	});
	// @ts-expect-error not a column
	await User.where(undefined).update({ nope: 1 });
	const deletedCount: number = await User.where(undefined).delete();

	// Hidden columns are usable on the instance but missing from toJSON().
	const Hidden = defineModel(db, users, { hidden: ["nickname"] });
	const secret = await Hidden.findOrFail(1);
	const nick: string | null = secret.nickname;
	const json = secret.toJSON();
	const jsonName: string = json.name;
	// @ts-expect-error hidden from toJSON()
	json.nickname;
	// @ts-expect-error not a column
	defineModel(db, users, { hidden: ["nope"] });

	// Reserved names: a column key shadowing an instance method is a type error.
	const clash = sqliteTable("clash", {
		id: integer("id").primaryKey(),
		save: text("save"),
	});
	const clashToJSON = sqliteTable("clash2", {
		id: integer("id").primaryKey(),
		toJSON: text("to_json"),
	});
	// @ts-expect-error column "save" is reserved
	defineModel(db, clash);
	// @ts-expect-error column "toJSON" is reserved
	defineModel(db, clashToJSON);
	const renamed = sqliteTable("renamed", {
		id: integer("id").primaryKey(),
		saveFlag: text("save"),
	});
	defineModel(db, renamed);

	// Soft deletes need a nullable Date `deletedAt` column.
	const notes = sqliteTable("notes", {
		id: integer("id").primaryKey(),
		title: text("title").notNull(),
		active: integer("active", { mode: "boolean" }).notNull(),
		deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
	});
	const textDeletedAt = sqliteTable("text_deleted_at", {
		id: integer("id").primaryKey(),
		deletedAt: text("deleted_at"),
	});
	// @ts-expect-error softDeletes requires a deletedAt column
	defineModel(db, users, { softDeletes: true });
	// @ts-expect-error deletedAt must be a nullable Date column
	defineModel(db, textDeletedAt, { softDeletes: true });
	defineModel(db, users, { softDeletes: false });
	const Note = defineModel(db, notes, { softDeletes: true });
	const note = await Note.findOrFail(1);
	const isTrashed: boolean = note.trashed();
	const restored: typeof note | false = await note.restore();
	const forced: boolean = await note.forceDelete();
	const withTrashed: (typeof note)[] = await Note.withTrashed().get();
	await Note.where(undefined).onlyTrashed().first();
	const restoredCount: number = await Note.onlyTrashed().restore();
	const forcedCount: number = await Note.where(undefined).forceDelete();
	Note.on("deleting", (n) => n.trashed());
	// @ts-expect-error no soft deletes on this model
	user.trashed();
	// @ts-expect-error no soft deletes on this model
	await user.restore();
	// @ts-expect-error no soft deletes on this model
	await user.forceDelete();
	// @ts-expect-error no soft deletes on this model
	User.withTrashed();
	// @ts-expect-error no soft deletes on this model
	User.where(undefined).onlyTrashed();

	// Scopes: names and arguments are inferred.
	const Scoped = defineModel(db, notes, {
		softDeletes: true,
		scopes: {
			active: (q) => q.where(undefined).withTrashed(),
			titled: (q, _title: string) => q.where(undefined),
		},
	});
	const scoped: (typeof note)[] = await Scoped.active().get();
	await Scoped.active().where(undefined).titled("x").first();
	await Scoped.where(undefined).active().onlyTrashed().titled("x").get();
	// @ts-expect-error unknown scope
	Scoped.inactive();
	// @ts-expect-error unknown scope
	Scoped.active().inactive();
	// @ts-expect-error title is a string
	Scoped.titled(1);
	// @ts-expect-error title is required
	Scoped.titled();
	// @ts-expect-error a scope must return the query
	defineModel(db, notes, { scopes: { bad: () => 1 } });
	// @ts-expect-error scope name "where" is reserved
	defineModel(db, notes, { scopes: { where: (q) => q } });
	const PlainScoped = defineModel(db, users, {
		scopes: { named: (q) => q },
	});
	await PlainScoped.named().get();
	// @ts-expect-error no soft deletes on this model
	PlainScoped.named().withTrashed();

	return [
		id,
		name,
		nickname,
		saved,
		dirty,
		first,
		rows,
		off,
		savedOrFalse,
		deletedOrFalse,
		updatedCount,
		deletedCount,
		nick,
		jsonName,
		isTrashed,
		restored,
		forced,
		withTrashed,
		restoredCount,
		forcedCount,
		scoped,
	];
}

describe("types", () => {
	it("compiles", () => {
		expect(typeof typeChecks).toBe("function");
	});
});
