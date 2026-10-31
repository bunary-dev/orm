/**
 * defineModel on SQLite via drizzle-orm/bun-sqlite (bun:sqlite).
 */
import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { defineModel, ModelNotFoundError } from "../src/index.js";
import {
	describeModelSuite,
	notesShape,
	postsShape,
	usersShape,
} from "./helpers/model-suite.js";
import { persisted } from "./helpers/persisted.js";

const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SCHEMA = `
	CREATE TABLE users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		email TEXT NOT NULL,
		age INTEGER,
		meta TEXT,
		created_at INTEGER NOT NULL
	);
	CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT NOT NULL);
	CREATE TABLE notes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		active INTEGER NOT NULL DEFAULT 1,
		deleted_at INTEGER
	);
`;

function open() {
	const client = new Database(":memory:");
	client.exec(SCHEMA);
	const queries: string[] = [];
	const db = drizzle({
		client,
		logger: { logQuery: (query) => void queries.push(query) },
	});
	return { client, db, queries };
}

describeModelSuite("sqlite", () => {
	const { db, queries } = open();
	return {
		Users: defineModel(db, usersShape),
		Posts: defineModel(db, postsShape),
		defineUsers: (options) => defineModel(db, usersShape, options),
		users: usersShape,
		posts: postsShape,
		notes: notesShape,
		db,
		queries,
		postIdPattern: UUID_V7,
		async reset() {
			queries.length = 0;
		},
	};
});

describe("defineModel (sqlite transactions)", () => {
	const setup = () => {
		const { db } = open();
		return { db, Users: defineModel(db, usersShape) };
	};

	it("create() / save() / delete() with { tx } commit with the transaction", async () => {
		const { db, Users } = setup();
		const keep = persisted(
			await Users.create({ name: "Keep", email: "k@x.io" }),
		);
		const drop = persisted(
			await Users.create({ name: "Drop", email: "d@x.io" }),
		);

		let created: Promise<unknown> | undefined;
		db.transaction((tx) => {
			created = Users.create({ name: "New", email: "n@x.io" }, { tx });
			keep.name = "Kept";
			keep.save({ tx });
			drop.delete({ tx });
		});

		expect(await created).toMatchObject({ name: "New" });
		expect(keep.isDirty()).toBe(false);
		const names = (await Users.query()).map((u) => u.name).sort();
		expect(names).toEqual(["Kept", "New"]);
	});

	it("rolls everything back when the transaction aborts", async () => {
		const { db, Users } = setup();
		const keep = persisted(
			await Users.create({ name: "Keep", email: "k@x.io" }),
		);

		expect(() =>
			db.transaction((tx) => {
				Users.create({ name: "New", email: "n@x.io" }, { tx });
				keep.name = "Changed";
				keep.save({ tx });
				keep.delete({ tx });
				tx.rollback();
			}),
		).toThrow();

		const rows = await Users.query();
		expect(rows.map((u) => u.name)).toEqual(["Keep"]);
	});

	it("throws query errors synchronously with { tx } so the transaction rolls back", async () => {
		const { db, Users } = setup();
		const keep = persisted(
			await Users.create({ name: "Keep", email: "k@x.io" }),
		);

		expect(() =>
			db.transaction((tx) => {
				Users.create({ name: "New", email: "n@x.io" }, { tx });
				// NOT NULL violation
				(keep as unknown as { name: null }).name = null;
				keep.save({ tx });
			}),
		).toThrow(/NOT NULL/);

		expect((await Users.query()).map((u) => u.name)).toEqual(["Keep"]);
	});

	it("synchronous listeners keep writes inside the transaction", async () => {
		const { db, Users } = setup();
		const log: string[] = [];
		Users.on("saving", (target) => void log.push(`saving:${target.name}`));
		Users.on("deleting", () => false);
		const keep = persisted(
			await Users.create({ name: "Keep", email: "k@x.io" }),
		);

		let created: Promise<unknown> | undefined;
		let deleted: Promise<boolean> | undefined;
		expect(() =>
			db.transaction((tx) => {
				created = Users.create({ name: "New", email: "n@x.io" }, { tx });
				keep.name = "Changed";
				keep.save({ tx });
				deleted = keep.delete({ tx });
				tx.rollback();
			}),
		).toThrow("Rollback");

		expect(await created).toMatchObject({ name: "New" });
		expect(await deleted).toBe(false);
		expect(log).toEqual(["saving:Keep", "saving:New", "saving:Changed"]);
		expect((await Users.query()).map((u) => u.name)).toEqual(["Keep"]);
	});

	it("a listener throwing with { tx } throws synchronously so the transaction rolls back", async () => {
		const { db, Users } = setup();
		Users.on("creating", (values) => {
			if (values.name === "Bad") throw new Error("bad name");
		});
		expect(() =>
			db.transaction((tx) => {
				Users.create({ name: "Good", email: "g@x.io" }, { tx });
				Users.create({ name: "Bad", email: "b@x.io" }, { tx });
			}),
		).toThrow("bad name");
		expect(await Users.query()).toEqual([]);
	});

	it("rejects (rather than throws) without { tx }", async () => {
		const { Users } = setup();
		const user = persisted(await Users.create({ name: "A", email: "a@x.io" }));
		(user as unknown as { name: null }).name = null;
		const result = user.save();
		expect(result).toBeInstanceOf(Promise);
		await expect(result).rejects.toThrow(/NOT NULL/);
	});

	it("find() / refresh() / where() / query() read through { tx }", async () => {
		const { db, Users } = setup();
		const user = persisted(await Users.create({ name: "A", email: "a@x.io" }));
		const reads: Promise<unknown>[] = [];
		expect(() =>
			db.transaction((tx) => {
				tx.update(usersShape)
					.set({ name: "B" })
					.where(eq(usersShape.id, user.id))
					.run();
				reads.push(Users.find(user.id, { tx }));
				reads.push(Users.findOrFail(user.id, { tx }));
				reads.push(Users.where(eq(usersShape.name, "B")).first({ tx }));
				reads.push(Users.where(eq(usersShape.name, "B")).get({ tx }));
				reads.push(user.refresh({ tx }));
				reads.push(Promise.resolve(Users.query({ tx }).all()));
				tx.rollback();
			}),
		).toThrow("Rollback");
		const [found, orFail, first, all, refreshed, raw] =
			await Promise.all(reads);
		expect(found).toMatchObject({ name: "B" });
		expect(orFail).toMatchObject({ name: "B" });
		expect(first).toMatchObject({ name: "B" });
		expect(all).toHaveLength(1);
		expect(refreshed).toBe(user);
		expect(raw).toEqual([expect.objectContaining({ name: "B" })]);
		expect((await Users.findOrFail(user.id)).name).toBe("A");
	});
});

describe("defineModel (sqlite identifiers)", () => {
	it("quotes hostile table and column names instead of interpolating them", async () => {
		const client = new Database(":memory:");
		const table = 'evil"; DROP TABLE victims; --';
		const column = 'na"me';
		client.exec(`CREATE TABLE victims (id INTEGER PRIMARY KEY)`);
		client.exec(
			`CREATE TABLE "${table.replaceAll('"', '""')}" (id INTEGER PRIMARY KEY AUTOINCREMENT, "${column.replaceAll('"', '""')}" TEXT)`,
		);
		const hostile = sqliteTable(table, {
			id: integer("id").primaryKey({ autoIncrement: true }),
			name: text(column),
		});
		const Hostile = defineModel(drizzle({ client }), hostile);

		const row = persisted(await Hostile.create({ name: "a" }));
		row.name = "b";
		await row.save();
		expect((await Hostile.findOrFail(row.id)).name).toBe("b");
		expect(await Hostile.where(eq(hostile.name, "b")).get()).toHaveLength(1);
		await row.delete();
		expect(
			client
				.query("SELECT name FROM sqlite_master WHERE name = 'victims'")
				.all(),
		).toHaveLength(1);
	});
});

describe("defineModel (definition)", () => {
	const { db } = open();

	it("uses an explicit primaryKey option", async () => {
		const tags = sqliteTable(
			"tags",
			{ slug: text("slug").notNull(), label: text("label").notNull() },
			(t) => [primaryKey({ columns: [t.slug] })],
		);
		db.run(sql`CREATE TABLE tags (slug TEXT PRIMARY KEY, label TEXT NOT NULL)`);
		const Tags = defineModel(db, tags, { primaryKey: tags.slug });
		const tag = persisted(await Tags.create({ slug: "bun", label: "Bun" }));
		tag.label = "Bun!";
		await tag.save();
		expect((await Tags.findOrFail("bun")).label).toBe("Bun!");
		await expect(Tags.findOrFail("nope")).rejects.toBeInstanceOf(
			ModelNotFoundError,
		);
	});

	it("throws when the table has no single-column primary key", () => {
		const noKey = sqliteTable("no_key", { name: text("name") });
		expect(() => defineModel(db, noKey)).toThrow(
			/no_key.*single-column primary key/,
		);
	});

	it("throws when primaryKey is not a column of the table", () => {
		const other = sqliteTable("other", { id: integer("id").primaryKey() });
		expect(() =>
			defineModel(db, usersShape, { primaryKey: other.id as never }),
		).toThrow(/primaryKey.*not a column of "users"/);
	});

	it("throws when a column key collides with an instance method", () => {
		const clash = sqliteTable("clash", {
			id: integer("id").primaryKey(),
			save: text("save"),
		});
		// @ts-expect-error column "save" is reserved
		expect(() => defineModel(db, clash)).toThrow(/column "save".*reserved/);
		for (const key of ["delete", "toJSON", "isDirty", "getDirty", "refresh"]) {
			const table = sqliteTable("clash", {
				id: integer("id").primaryKey(),
				[key]: text("x"),
			});
			expect(() => defineModel(db, table as never)).toThrow(
				new RegExp(`column "${key}" of "clash" is reserved`),
			);
		}
	});

	it("throws when softDeletes is set but there is no deletedAt column", () => {
		expect(() =>
			defineModel(db, usersShape, { softDeletes: true as never }),
		).toThrow(/softDeletes requires a "deletedAt" column on "users"/);
	});

	it("throws when a scope is not a function", () => {
		expect(() =>
			defineModel(db, usersShape, { scopes: { broken: 1 } as never }),
		).toThrow(/scope "broken" of "users" is not a function/);
	});

	it("reserves the soft-delete method names as column keys", () => {
		for (const key of ["restore", "trashed", "forceDelete"]) {
			const table = sqliteTable("clash", {
				id: integer("id").primaryKey(),
				[key]: text("x"),
			});
			expect(() => defineModel(db, table as never)).toThrow(
				new RegExp(`column "${key}" of "clash" is reserved`),
			);
		}
	});

	it("throws when a hidden key is not a column", () => {
		expect(() =>
			defineModel(db, usersShape, { hidden: ["password" as never] }),
		).toThrow(/hidden column "password" is not a column of "users"/);
	});
});
