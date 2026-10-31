/**
 * Dialect-independent defineModel behaviour, run once per dialect.
 *
 * Each dialect test file defines a `users` table (integer key assigned by the
 * database), a `posts` table (string key assigned by a table default) and a
 * `notes` table (soft deletes) with the same JS keys, and hands them to
 * `describeModelSuite`.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { and, eq, gt, isNull, like } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
	type DefineModelOptions,
	defineModel,
	type Model,
	ModelNotFoundError,
} from "../../src/index.js";
import { persisted } from "./persisted.js";

/** The shape both dialects' `users` tables share (typed via SQLite). */
export const usersShape = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	email: text("email").notNull(),
	age: integer("age"),
	meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
});

/** The shape both dialects' `posts` tables share (typed via SQLite). */
export const postsShape = sqliteTable("posts", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => Bun.randomUUIDv7()),
	title: text("title").notNull(),
});

/** The shape both dialects' `notes` tables share (typed via SQLite). */
export const notesShape = sqliteTable("notes", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	title: text("title").notNull(),
	active: integer("active", { mode: "boolean" }).notNull().default(true),
	deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

type UserColumn = keyof typeof usersShape.$inferSelect & string;

export type UsersModel<THidden extends UserColumn = never> = Model<
	typeof usersShape,
	BunSQLiteDatabase,
	number,
	THidden
>;

export interface SuiteContext {
	Users: UsersModel;
	/** Define another model for the `users` table, with options. */
	defineUsers<const THidden extends UserColumn = never>(
		options: DefineModelOptions<
			typeof usersShape,
			BunSQLiteDatabase,
			typeof usersShape.id,
			THidden
		>,
	): UsersModel<THidden>;
	Posts: Model<typeof postsShape, BunSQLiteDatabase>;
	users: typeof usersShape;
	posts: typeof postsShape;
	notes: typeof notesShape;
	/** The database the models use (typed via SQLite). */
	db: BunSQLiteDatabase;
	/** SQL statements logged by the database since the last `reset()`. */
	queries: string[];
	/** Empty every table and the query log. */
	reset(): Promise<void>;
	/** Matches the default-assigned key of a `posts` row. */
	postIdPattern: RegExp;
}

export function describeModelSuite(
	name: string,
	setup: () => SuiteContext,
	options: { skip?: boolean } = {},
): void {
	const run = options.skip ? describe.skip : describe;

	run(`defineModel (${name})`, () => {
		let ctx: SuiteContext;

		beforeEach(async () => {
			ctx = setup();
			await ctx.reset();
		});

		const seed = async () => {
			const john = persisted(
				await ctx.Users.create({
					name: "John",
					email: "john@example.com",
					age: 30,
				}),
			);
			const jane = persisted(
				await ctx.Users.create({
					name: "Jane",
					email: "jane@example.com",
					age: 25,
				}),
			);
			await ctx.Users.create({ name: "Bob", email: "bob@example.com" });
			ctx.queries.length = 0;
			return { john, jane };
		};

		describe("create()", () => {
			it("returns the persisted row including the database-assigned key", async () => {
				const user = persisted(
					await ctx.Users.create({
						name: "John",
						email: "john@example.com",
					}),
				);
				expect(typeof user.id).toBe("number");
				expect(user.id).toBeGreaterThan(0);
				expect(user.name).toBe("John");
				expect(user.age).toBeNull();
				expect(user.createdAt).toBeInstanceOf(Date);

				const second = persisted(
					await ctx.Users.create({
						name: "Jane",
						email: "jane@example.com",
					}),
				);
				expect(second.id).not.toBe(user.id);
			});

			it("lets the table default assign a string key", async () => {
				const post = persisted(await ctx.Posts.create({ title: "Hello" }));
				expect(post.id).toMatch(ctx.postIdPattern);
				const found = await ctx.Posts.find(post.id);
				expect(found?.title).toBe("Hello");
			});

			it("keeps an explicit key", async () => {
				const post = persisted(
					await ctx.Posts.create({
						id: "0190b0a6-0000-7000-8000-000000000001",
						title: "Explicit",
					}),
				);
				expect(post.id).toBe("0190b0a6-0000-7000-8000-000000000001");
			});

			it("never mutates the caller's input", async () => {
				const input = Object.freeze({ title: "Frozen" });
				const post = persisted(await ctx.Posts.create(input));
				expect(post.id).toMatch(ctx.postIdPattern);
				expect(input).toEqual({ title: "Frozen" });
				expect("id" in input).toBe(false);
			});

			it("rejects an empty-string key without touching the database", async () => {
				await expect(
					ctx.Posts.create({ id: "", title: "Nope" }),
				).rejects.toThrow(/primary key "id" must not be an empty string/i);
				expect(ctx.queries).toEqual([]);
			});

			it("returns a clean instance", async () => {
				const user = persisted(
					await ctx.Users.create({ name: "A", email: "a@x.io" }),
				);
				expect(user.isDirty()).toBe(false);
				expect(user.getDirty()).toEqual({});
			});
		});

		describe("find() / findOrFail()", () => {
			it("finds a row by primary key", async () => {
				const { john } = await seed();
				const user = await ctx.Users.find(john.id);
				expect(user).not.toBeNull();
				expect(user?.name).toBe("John");
				expect(user?.email).toBe("john@example.com");
				expect(user?.age).toBe(30);
			});

			it("returns null when no row matches", async () => {
				await seed();
				expect(await ctx.Users.find(999_999)).toBeNull();
			});

			it("findOrFail throws a typed not-found error", async () => {
				await seed();
				const error = await ctx.Users.findOrFail(999_999).catch((e) => e);
				expect(error).toBeInstanceOf(ModelNotFoundError);
				expect(error).toBeInstanceOf(Error);
				expect(error.name).toBe("ModelNotFoundError");
				expect(error.table).toBe(ctx.Users.tableName);
				expect(error.id).toBe(999_999);
				expect(error.message).toContain("999999");
			});

			it("findOrFail returns the instance when found", async () => {
				const { jane } = await seed();
				const user = await ctx.Users.findOrFail(jane.id);
				expect(user.name).toBe("Jane");
			});
		});

		describe("where()", () => {
			it("get() returns every matching row as an instance", async () => {
				await seed();
				const rows = await ctx.Users.where(gt(ctx.users.age, 20)).get();
				expect(rows.map((u) => u.name).sort()).toEqual(["Jane", "John"]);
				expect(typeof rows[0]?.save).toBe("function");
			});

			it("accepts composed conditions", async () => {
				await seed();
				const rows = await ctx.Users.where(
					and(isNull(ctx.users.age), eq(ctx.users.name, "Bob")),
				).get();
				expect(rows).toHaveLength(1);
				expect(rows[0]?.email).toBe("bob@example.com");
			});

			it("get() returns an empty array when nothing matches", async () => {
				await seed();
				expect(
					await ctx.Users.where(eq(ctx.users.name, "Nobody")).get(),
				).toEqual([]);
			});

			it("first() returns one instance or null", async () => {
				await seed();
				const user = await ctx.Users.where(eq(ctx.users.name, "Jane")).first();
				expect(user?.email).toBe("jane@example.com");
				expect(
					await ctx.Users.where(eq(ctx.users.name, "Nobody")).first(),
				).toBeNull();
			});

			it("binds values instead of interpolating them", async () => {
				await seed();
				const hostile = "x' OR '1'='1";
				expect(
					await ctx.Users.where(eq(ctx.users.name, hostile)).get(),
				).toEqual([]);
				expect(ctx.queries.join("\n")).not.toContain(hostile);
			});
		});

		describe("attributes and dirty tracking", () => {
			it("exposes columns as enumerable properties", async () => {
				const { john } = await seed();
				const user = await ctx.Users.findOrFail(john.id);
				expect(Object.keys(user).sort()).toEqual(
					["age", "createdAt", "email", "id", "meta", "name"].sort(),
				);
				const { name, email } = user;
				expect({ name, email }).toEqual({
					name: "John",
					email: "john@example.com",
				});
				expect(JSON.parse(JSON.stringify(user)).name).toBe("John");
				expect(user.toJSON().email).toBe("john@example.com");
			});

			it("rejects assignment to unknown properties", async () => {
				const { john } = await seed();
				expect(() => {
					(john as unknown as Record<string, unknown>).nmae = "typo";
				}).toThrow(TypeError);
			});

			it("tracks which columns changed", async () => {
				const { john } = await seed();
				expect(john.isDirty()).toBe(false);
				john.name = "Johnny";
				expect(john.isDirty()).toBe(true);
				expect(john.isDirty("name")).toBe(true);
				expect(john.isDirty("email")).toBe(false);
				expect(john.getDirty()).toEqual({ name: "Johnny" });
			});

			it("is clean again when a value is set back", async () => {
				const { john } = await seed();
				john.name = "Johnny";
				john.name = "John";
				expect(john.isDirty()).toBe(false);
			});

			it("compares dates by value", async () => {
				const { john } = await seed();
				john.createdAt = new Date(john.createdAt.getTime());
				expect(john.isDirty("createdAt")).toBe(false);
				john.createdAt = new Date(john.createdAt.getTime() + 1000);
				expect(john.isDirty("createdAt")).toBe(true);
			});

			it("notices in-place changes to JSON values", async () => {
				const user = persisted(
					await ctx.Users.create({
						name: "J",
						email: "j@x.io",
						meta: { tags: ["a"] },
					}),
				);
				(user.meta as { tags: string[] }).tags.push("b");
				expect(user.getDirty()).toEqual({ meta: { tags: ["a", "b"] } });
				await user.save();
				expect((await ctx.Users.findOrFail(user.id)).meta).toEqual({
					tags: ["a", "b"],
				});
			});
		});

		describe("save()", () => {
			it("is a no-op when nothing changed", async () => {
				const { john } = await seed();
				expect(await john.save()).toBe(john);
				expect(ctx.queries).toEqual([]);
			});

			it("persists dirty columns and resets the dirty state", async () => {
				const { john } = await seed();
				john.name = "Johnny";
				expect(await john.save()).toBe(john);
				expect(john.isDirty()).toBe(false);
				expect((await ctx.Users.findOrFail(john.id)).name).toBe("Johnny");
			});

			it("updates only the dirty columns", async () => {
				const { john } = await seed();
				const a = await ctx.Users.findOrFail(john.id);
				const b = await ctx.Users.findOrFail(john.id);
				a.name = "Changed by A";
				b.email = "b@example.com";
				await a.save();
				await b.save();

				const fresh = await ctx.Users.findOrFail(john.id);
				expect(fresh.name).toBe("Changed by A");
				expect(fresh.email).toBe("b@example.com");
				expect(b.name).toBe("Changed by A");
			});

			it("touches only the instance's row", async () => {
				const { john, jane } = await seed();
				john.age = 99;
				await john.save();
				expect((await ctx.Users.findOrFail(jane.id)).age).toBe(25);
			});

			it("can change the primary key", async () => {
				const post = persisted(
					await ctx.Posts.create({ id: "old", title: "T" }),
				);
				post.id = "new";
				await post.save();
				expect(await ctx.Posts.find("old")).toBeNull();
				expect((await ctx.Posts.findOrFail("new")).title).toBe("T");
				post.title = "T2";
				await post.save();
				expect((await ctx.Posts.findOrFail("new")).title).toBe("T2");
			});

			it("throws not-found when the row is gone", async () => {
				const { john } = await seed();
				await (await ctx.Users.findOrFail(john.id)).delete();
				john.name = "Ghost";
				await expect(john.save()).rejects.toBeInstanceOf(ModelNotFoundError);
			});
		});

		describe("delete()", () => {
			it("removes the row", async () => {
				const { john, jane } = await seed();
				await john.delete();
				expect(await ctx.Users.find(john.id)).toBeNull();
				expect(await ctx.Users.find(jane.id)).not.toBeNull();
			});

			it("uses the persisted key, not an unsaved change to it", async () => {
				const post = persisted(
					await ctx.Posts.create({ id: "keep-me", title: "T" }),
				);
				const other = persisted(
					await ctx.Posts.create({ id: "other", title: "O" }),
				);
				post.id = "other";
				await post.delete();
				expect(await ctx.Posts.find("keep-me")).toBeNull();
				expect(await ctx.Posts.find(other.id)).not.toBeNull();
			});
		});

		describe("refresh()", () => {
			it("reloads attributes and discards unsaved changes", async () => {
				const { john } = await seed();
				const other = await ctx.Users.findOrFail(john.id);
				other.email = "new@example.com";
				await other.save();

				john.name = "Unsaved";
				expect(await john.refresh()).toBe(john);
				expect(john.name).toBe("John");
				expect(john.email).toBe("new@example.com");
				expect(john.isDirty()).toBe(false);
			});

			it("throws not-found when the row is gone", async () => {
				const { john } = await seed();
				await john.delete();
				await expect(john.refresh()).rejects.toBeInstanceOf(ModelNotFoundError);
			});
		});

		describe("query() / hydrate()", () => {
			it("query() is a Drizzle select from the model's table", async () => {
				await seed();
				const rows = await ctx.Users.query()
					.where(gt(ctx.users.age, 26))
					.orderBy(ctx.users.name);
				expect(rows.map((r) => r.name)).toEqual(["John"]);
				expect("save" in (rows[0] as object)).toBe(false);
			});

			it("hydrate() turns a raw row into a clean instance", async () => {
				const { jane } = await seed();
				const [row] = await ctx.Users.query().where(eq(ctx.users.id, jane.id));
				if (!row) throw new Error("row missing");
				const user = ctx.Users.hydrate(row);
				expect(user.isDirty()).toBe(false);
				user.age = 26;
				await user.save();
				expect((await ctx.Users.findOrFail(jane.id)).age).toBe(26);
				expect(row.age).toBe(25);
			});

			it("exposes the db, table and table name", () => {
				expect(ctx.Users.table).toBe(ctx.users);
				expect(ctx.Users.tableName).toMatch(/users$/);
				expect(ctx.Users.db).toBeDefined();
			});
		});

		describe("where() bulk writes", () => {
			it("update() writes every matching row and returns the count", async () => {
				await seed();
				const count = await ctx.Users.where(gt(ctx.users.age, 20)).update({
					age: 50,
				});
				expect(count).toBe(2);
				const rows = await ctx.Users.where(eq(ctx.users.age, 50)).get();
				expect(rows.map((u) => u.name).sort()).toEqual(["Jane", "John"]);
			});

			it("delete() removes every matching row and returns the count", async () => {
				await seed();
				expect(await ctx.Users.where(isNull(ctx.users.age)).delete()).toBe(1);
				expect((await ctx.Users.query()).map((u) => u.name).sort()).toEqual([
					"Jane",
					"John",
				]);
			});
		});

		describe("events", () => {
			const log: string[] = [];
			const record =
				(event: string) =>
				(target: { name?: string }): void => {
					log.push(`${event}:${target.name}`);
				};
			beforeEach(() => {
				log.length = 0;
			});

			it("create() fires saving then creating with the values", async () => {
				const Users = ctx.defineUsers({
					events: { saving: record("saving"), creating: record("creating") },
				});
				Users.on("updating", record("updating"));
				persisted(await Users.create({ name: "A", email: "a@x.io" }));
				expect(log).toEqual(["saving:A", "creating:A"]);
			});

			it("creating listeners can change the values before the insert", async () => {
				const Users = ctx.defineUsers({
					events: {
						creating: (values) => {
							values.email = values.email.toLowerCase();
						},
					},
				});
				const input = { name: "A", email: "A@X.IO" };
				const user = persisted(await Users.create(input));
				expect(user.email).toBe("a@x.io");
				expect(input.email).toBe("A@X.IO");
			});

			it("save() fires saving then updating with the instance", async () => {
				const { john } = await seed();
				ctx.Users.on("saving", record("saving"));
				ctx.Users.on("updating", record("updating"));
				ctx.Users.on("creating", record("creating"));
				john.name = "Johnny";
				expect(await john.save()).toBe(john);
				expect(log).toEqual(["saving:Johnny", "updating:Johnny"]);
			});

			it("save() on a clean instance fires saving but not updating", async () => {
				const { john } = await seed();
				ctx.Users.on("saving", record("saving"));
				ctx.Users.on("updating", record("updating"));
				expect(await john.save()).toBe(john);
				expect(log).toEqual(["saving:John"]);
				expect(ctx.queries).toEqual([]);
			});

			it("changes made by listeners are saved", async () => {
				const { john } = await seed();
				ctx.Users.on("updating", (user) => {
					user.email = `${user.name.toLowerCase()}@changed.io`;
				});
				john.name = "Johnny";
				await john.save();
				expect((await ctx.Users.findOrFail(john.id)).email).toBe(
					"johnny@changed.io",
				);
			});

			it("delete() fires deleting with the instance", async () => {
				const { john } = await seed();
				ctx.Users.on("deleting", record("deleting"));
				expect(await john.delete()).toBe(true);
				expect(log).toEqual(["deleting:John"]);
				expect(await ctx.Users.find(john.id)).toBeNull();
			});

			it("runs listeners in registration order, options first, awaiting async ones", async () => {
				const Users = ctx.defineUsers({
					events: {
						saving: [
							async () => {
								await Bun.sleep(5);
								log.push("options-1");
							},
							() => void log.push("options-2"),
						],
					},
				});
				Users.on("saving", async () => {
					await Bun.sleep(1);
					log.push("on-1");
				});
				Users.on("saving", () => void log.push("on-2"));
				await Users.create({ name: "A", email: "a@x.io" });
				expect(log).toEqual(["options-1", "options-2", "on-1", "on-2"]);
			});

			it("on() returns a function that removes the listener", async () => {
				const off = ctx.Users.on("creating", record("creating"));
				off();
				await ctx.Users.create({ name: "A", email: "a@x.io" });
				expect(log).toEqual([]);
			});

			describe("cancellation", () => {
				it("creating returning false cancels create()", async () => {
					ctx.Users.on("creating", () => false);
					ctx.Users.on("creating", record("never"));
					expect(await ctx.Users.create({ name: "A", email: "a@x.io" })).toBe(
						false,
					);
					expect(log).toEqual([]);
					expect(ctx.queries).toEqual([]);
					expect(await ctx.Users.query()).toEqual([]);
				});

				it("saving returning false cancels create() before creating fires", async () => {
					ctx.Users.on("saving", async () => false);
					ctx.Users.on("creating", record("creating"));
					expect(await ctx.Users.create({ name: "A", email: "a@x.io" })).toBe(
						false,
					);
					expect(log).toEqual([]);
					expect(await ctx.Users.query()).toEqual([]);
				});

				it("updating returning false cancels save() and keeps the changes", async () => {
					const { john } = await seed();
					ctx.Users.on("updating", async () => false);
					john.name = "Johnny";
					expect(await john.save()).toBe(false);
					expect(ctx.queries).toEqual([]);
					expect(john.isDirty("name")).toBe(true);
					expect((await ctx.Users.findOrFail(john.id)).name).toBe("John");
				});

				it("saving returning false cancels save()", async () => {
					const { john } = await seed();
					ctx.Users.on("saving", () => false);
					ctx.Users.on("updating", record("updating"));
					john.name = "Johnny";
					expect(await john.save()).toBe(false);
					expect(log).toEqual([]);
					expect((await ctx.Users.findOrFail(john.id)).name).toBe("John");
				});

				it("deleting returning false cancels delete()", async () => {
					const { john } = await seed();
					ctx.Users.on("deleting", () => false);
					expect(await john.delete()).toBe(false);
					expect(ctx.queries).toEqual([]);
					expect(await ctx.Users.find(john.id)).not.toBeNull();
				});

				it("only false cancels; other return values do not", async () => {
					ctx.Users.on("creating", () => undefined as unknown as boolean);
					ctx.Users.on("creating", () => true);
					expect(
						await ctx.Users.create({ name: "A", email: "a@x.io" }),
					).toMatchObject({ name: "A" });
				});
			});

			describe("errors", () => {
				it("a throwing listener rejects create() and writes nothing", async () => {
					ctx.Users.on("creating", () => {
						throw new Error("nope");
					});
					await expect(
						ctx.Users.create({ name: "A", email: "a@x.io" }),
					).rejects.toThrow("nope");
					expect(await ctx.Users.query()).toEqual([]);
				});

				it("a rejecting async listener rejects save() and writes nothing", async () => {
					const { john } = await seed();
					ctx.Users.on("updating", async () => {
						throw new Error("async nope");
					});
					john.name = "Johnny";
					await expect(john.save()).rejects.toThrow("async nope");
					expect((await ctx.Users.findOrFail(john.id)).name).toBe("John");
				});

				it("a throwing listener rejects delete()", async () => {
					const { john } = await seed();
					ctx.Users.on("deleting", () => {
						throw new Error("keep");
					});
					await expect(john.delete()).rejects.toThrow("keep");
					expect(await ctx.Users.find(john.id)).not.toBeNull();
				});
			});

			it("bulk where().update() / .delete() fire no events", async () => {
				await seed();
				for (const event of [
					"creating",
					"updating",
					"saving",
					"deleting",
				] as const) {
					ctx.Users.on(event, () => {
						log.push(event);
						return false;
					});
				}
				expect(
					await ctx.Users.where(eq(ctx.users.name, "John")).update({ age: 1 }),
				).toBe(1);
				expect(await ctx.Users.where(eq(ctx.users.name, "Bob")).delete()).toBe(
					1,
				);
				expect(log).toEqual([]);
				expect((await ctx.Users.query()).map((u) => u.name).sort()).toEqual([
					"Jane",
					"John",
				]);
			});
		});

		describe("hidden columns", () => {
			it("are loaded and usable but stripped from toJSON() and JSON.stringify", async () => {
				const Users = ctx.defineUsers({ hidden: ["email", "meta"] });
				const created = persisted(
					await Users.create({
						name: "A",
						email: "secret@x.io",
						meta: { token: "t" },
					}),
				);
				const user = await Users.findOrFail(created.id);
				expect(user.email).toBe("secret@x.io");
				expect(user.meta).toEqual({ token: "t" });

				const json = user.toJSON();
				expect(Object.keys(json).sort()).toEqual([
					"age",
					"createdAt",
					"id",
					"name",
				]);
				expect("email" in json).toBe(false);
				const text = JSON.stringify(user);
				expect(text).not.toContain("secret@x.io");
				expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(json)));

				user.email = "new@x.io";
				expect(user.isDirty("email")).toBe(true);
				await user.save();
				expect((await Users.findOrFail(user.id)).email).toBe("new@x.io");
			});

			it("apply to instances from where(), hydrate() and query rows alike", async () => {
				await seed();
				const Users = ctx.defineUsers({ hidden: ["email"] });
				const [first] = await Users.where(eq(ctx.users.name, "John")).get();
				expect(first?.toJSON()).not.toHaveProperty("email");
				const [row] = await Users.query().where(eq(ctx.users.name, "Jane"));
				if (!row) throw new Error("row missing");
				expect(Users.hydrate(row).toJSON()).not.toHaveProperty("email");
			});

			it("other models of the same table are unaffected", async () => {
				ctx.defineUsers({ hidden: ["email"] });
				const user = persisted(
					await ctx.Users.create({ name: "A", email: "a@x.io" }),
				);
				expect(user.toJSON().email).toBe("a@x.io");
			});
		});

		describe("soft deletes", () => {
			const defineNotes = () =>
				defineModel(ctx.db, ctx.notes, { softDeletes: true });
			const seedNotes = async () => {
				const Notes = defineNotes();
				const keep = persisted(await Notes.create({ title: "keep" }));
				const gone = persisted(await Notes.create({ title: "gone" }));
				expect(await gone.delete()).toBe(true);
				ctx.queries.length = 0;
				return { Notes, keep, gone };
			};
			const titles = (rows: { title: string }[]) =>
				rows.map((n) => n.title).sort();

			it("delete() sets deletedAt instead of removing the row", async () => {
				const Notes = defineNotes();
				const note = persisted(await Notes.create({ title: "a" }));
				expect(note.trashed()).toBe(false);
				const before = Date.now();
				expect(await note.delete()).toBe(true);

				expect(note.trashed()).toBe(true);
				expect(note.deletedAt).toBeInstanceOf(Date);
				expect(note.deletedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
				expect(note.isDirty()).toBe(false);
				const [row] = await Notes.query();
				expect(row?.deletedAt).toBeInstanceOf(Date);
				expect(ctx.queries.join("\n")).not.toMatch(/delete from/i);
			});

			it("delete() writes only deletedAt and keeps other unsaved changes", async () => {
				const Notes = defineNotes();
				const note = persisted(await Notes.create({ title: "a" }));
				note.title = "unsaved";
				await note.delete();
				expect(note.getDirty()).toEqual({ title: "unsaved" });
				const [row] = await Notes.query();
				expect(row?.title).toBe("a");
			});

			it("excludes trashed rows from find(), findOrFail() and where()", async () => {
				const { Notes, keep, gone } = await seedNotes();
				expect(await Notes.find(gone.id)).toBeNull();
				await expect(Notes.findOrFail(gone.id)).rejects.toBeInstanceOf(
					ModelNotFoundError,
				);
				expect((await Notes.find(keep.id))?.title).toBe("keep");
				expect(titles(await Notes.where(undefined).get())).toEqual(["keep"]);
				expect(
					await Notes.where(eq(ctx.notes.title, "gone")).first(),
				).toBeNull();
			});

			it("withTrashed() includes trashed rows", async () => {
				const { Notes, gone } = await seedNotes();
				expect(titles(await Notes.withTrashed().get())).toEqual([
					"gone",
					"keep",
				]);
				const found = await Notes.withTrashed()
					.where(eq(ctx.notes.id, gone.id))
					.first();
				expect(found?.trashed()).toBe(true);
				expect(
					titles(
						await Notes.where(like(ctx.notes.title, "%e%")).withTrashed().get(),
					),
				).toEqual(["gone", "keep"]);
			});

			it("onlyTrashed() returns only trashed rows", async () => {
				const { Notes } = await seedNotes();
				expect(titles(await Notes.onlyTrashed().get())).toEqual(["gone"]);
				expect(
					await Notes.onlyTrashed().where(eq(ctx.notes.title, "keep")).first(),
				).toBeNull();
				expect(
					titles(await Notes.where(undefined).onlyTrashed().get()),
				).toEqual(["gone"]);
			});

			it("restore() clears deletedAt and fires saving and updating", async () => {
				const { Notes, gone } = await seedNotes();
				const log: string[] = [];
				Notes.on("saving", () => void log.push("saving"));
				Notes.on("updating", () => void log.push("updating"));
				expect(await gone.restore()).toBe(gone);
				expect(gone.trashed()).toBe(false);
				expect(gone.deletedAt).toBeNull();
				expect(gone.isDirty()).toBe(false);
				expect(log).toEqual(["saving", "updating"]);
				expect((await Notes.find(gone.id))?.title).toBe("gone");
			});

			it("restore() is cancelled by an updating listener", async () => {
				const { Notes, gone } = await seedNotes();
				Notes.on("updating", () => false);
				expect(await gone.restore()).toBe(false);
				expect(await Notes.find(gone.id)).toBeNull();
			});

			it("forceDelete() removes the row and fires deleting", async () => {
				const { Notes, keep, gone } = await seedNotes();
				const log: string[] = [];
				Notes.on("deleting", (note) => void log.push(note.title));
				expect(await keep.forceDelete()).toBe(true);
				expect(await gone.forceDelete()).toBe(true);
				expect(log).toEqual(["keep", "gone"]);
				expect(await Notes.query()).toEqual([]);
			});

			it("deleting returning false cancels delete() and forceDelete()", async () => {
				const { Notes, keep } = await seedNotes();
				Notes.on("deleting", () => false);
				expect(await keep.delete()).toBe(false);
				expect(await keep.forceDelete()).toBe(false);
				expect(ctx.queries).toEqual([]);
				expect(keep.trashed()).toBe(false);
				expect((await Notes.find(keep.id))?.trashed()).toBe(false);
			});

			it("a trashed instance can still be saved and refreshed", async () => {
				const { gone } = await seedNotes();
				gone.title = "edited";
				expect(await gone.save()).toBe(gone);
				expect(await gone.refresh()).toBe(gone);
				expect(gone.title).toBe("edited");
				expect(gone.trashed()).toBe(true);
			});

			it("bulk delete() soft-deletes, forceDelete() and restore() work in bulk", async () => {
				const { Notes } = await seedNotes();
				await Notes.create({ title: "other" });
				expect(await Notes.where(eq(ctx.notes.title, "keep")).delete()).toBe(1);
				expect(titles(await Notes.where(undefined).get())).toEqual(["other"]);
				expect(titles(await Notes.onlyTrashed().get())).toEqual([
					"gone",
					"keep",
				]);

				expect(await Notes.where(eq(ctx.notes.title, "keep")).restore()).toBe(
					1,
				);
				expect(titles(await Notes.where(undefined).get())).toEqual([
					"keep",
					"other",
				]);

				// forceDelete() respects the trashed filter: only "gone" is trashed.
				expect(await Notes.onlyTrashed().forceDelete()).toBe(1);
				expect(titles(await Notes.query())).toEqual(["keep", "other"]);
				expect(await Notes.where(undefined).forceDelete()).toBe(2);
				expect(await Notes.query()).toEqual([]);
			});

			it("bulk update() skips trashed rows unless withTrashed()", async () => {
				const { Notes } = await seedNotes();
				expect(await Notes.where(undefined).update({ active: false })).toBe(1);
				expect(await Notes.withTrashed().update({ active: false })).toBe(2);
			});

			it("query() is raw Drizzle and ignores soft deletes", async () => {
				const { Notes } = await seedNotes();
				expect(titles(await Notes.query())).toEqual(["gone", "keep"]);
			});

			it("models without softDeletes delete for real and have no soft-delete API", async () => {
				const Notes = defineModel(ctx.db, ctx.notes);
				const note = persisted(await Notes.create({ title: "a" }));
				expect("restore" in note).toBe(false);
				expect("trashed" in note).toBe(false);
				expect("forceDelete" in note).toBe(false);
				expect("withTrashed" in Notes).toBe(false);
				expect("onlyTrashed" in Notes.where(undefined)).toBe(false);
				await note.delete();
				expect(await Notes.query()).toEqual([]);
			});
		});

		describe("scopes", () => {
			const defineNotes = () =>
				defineModel(ctx.db, ctx.notes, {
					softDeletes: true,
					scopes: {
						active: (q) => q.where(eq(ctx.notes.active, true)),
						titled: (q, prefix: string) =>
							q.where(like(ctx.notes.title, `${prefix}%`)),
					},
				});
			const seedNotes = async () => {
				const Notes = defineNotes();
				await Notes.create({ title: "a1" });
				await Notes.create({ title: "a2", active: false });
				await Notes.create({ title: "b1" });
				const trashed = persisted(await Notes.create({ title: "a3" }));
				await trashed.delete();
				return Notes;
			};
			const titles = (rows: { title: string }[]) =>
				rows.map((n) => n.title).sort();

			it("are callable on the model", async () => {
				const Notes = await seedNotes();
				expect(titles(await Notes.active().get())).toEqual(["a1", "b1"]);
				expect((await Notes.titled("b").first())?.title).toBe("b1");
			});

			it("chain with where(), each other and the trashed filters", async () => {
				const Notes = await seedNotes();
				expect(
					titles(await Notes.active().where(like(ctx.notes.title, "a%")).get()),
				).toEqual(["a1"]);
				expect(
					titles(await Notes.where(like(ctx.notes.title, "a%")).active().get()),
				).toEqual(["a1"]);
				expect(titles(await Notes.active().titled("b").get())).toEqual(["b1"]);
				expect(titles(await Notes.titled("a").withTrashed().get())).toEqual([
					"a1",
					"a2",
					"a3",
				]);
				expect(titles(await Notes.onlyTrashed().titled("a").get())).toEqual([
					"a3",
				]);
			});

			it("apply to bulk writes", async () => {
				const Notes = await seedNotes();
				expect(await Notes.active().titled("a").update({ title: "x" })).toBe(1);
				expect(await Notes.titled("x").delete()).toBe(1);
				expect(titles(await Notes.where(undefined).get())).toEqual([
					"a2",
					"b1",
				]);
			});

			it("queries are immutable: chaining returns a new query", async () => {
				const Notes = await seedNotes();
				const active = Notes.active();
				const narrowed = active.titled("b");
				expect(titles(await active.get())).toEqual(["a1", "b1"]);
				expect(titles(await narrowed.get())).toEqual(["b1"]);
			});

			it("throws when a scope name is reserved", () => {
				for (const name of ["where", "find", "get", "delete", "then"]) {
					expect(() =>
						defineModel(ctx.db, ctx.notes, {
							scopes: { [name]: (q: unknown) => q } as never,
						}),
					).toThrow(new RegExp(`scope "${name}" .*reserved`));
				}
			});

			it("throws when a scope does not return a query", async () => {
				const Notes = defineModel(ctx.db, ctx.notes, {
					scopes: { broken: (() => undefined) as never },
				});
				expect(() => Notes.broken()).toThrow(/scope "broken" .*must return/);
			});
		});
	});
}
