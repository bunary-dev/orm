/**
 * Dialect-independent defineModel behaviour, run once per dialect.
 *
 * Each dialect test file defines a `users` table (integer key assigned by the
 * database) and a `posts` table (string key assigned by a table default) with
 * the same JS keys, and hands them to `describeModelSuite`.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { type Model, ModelNotFoundError } from "../../src/index.js";

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

export interface SuiteContext {
	Users: Model<typeof usersShape, BunSQLiteDatabase>;
	Posts: Model<typeof postsShape, BunSQLiteDatabase>;
	users: typeof usersShape;
	posts: typeof postsShape;
	/** SQL statements logged by the database since the last `reset()`. */
	queries: string[];
	/** Empty both tables and the query log. */
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
			const john = await ctx.Users.create({
				name: "John",
				email: "john@example.com",
				age: 30,
			});
			const jane = await ctx.Users.create({
				name: "Jane",
				email: "jane@example.com",
				age: 25,
			});
			await ctx.Users.create({ name: "Bob", email: "bob@example.com" });
			ctx.queries.length = 0;
			return { john, jane };
		};

		describe("create()", () => {
			it("returns the persisted row including the database-assigned key", async () => {
				const user = await ctx.Users.create({
					name: "John",
					email: "john@example.com",
				});
				expect(typeof user.id).toBe("number");
				expect(user.id).toBeGreaterThan(0);
				expect(user.name).toBe("John");
				expect(user.age).toBeNull();
				expect(user.createdAt).toBeInstanceOf(Date);

				const second = await ctx.Users.create({
					name: "Jane",
					email: "jane@example.com",
				});
				expect(second.id).not.toBe(user.id);
			});

			it("lets the table default assign a string key", async () => {
				const post = await ctx.Posts.create({ title: "Hello" });
				expect(post.id).toMatch(ctx.postIdPattern);
				const found = await ctx.Posts.find(post.id);
				expect(found?.title).toBe("Hello");
			});

			it("keeps an explicit key", async () => {
				const post = await ctx.Posts.create({
					id: "0190b0a6-0000-7000-8000-000000000001",
					title: "Explicit",
				});
				expect(post.id).toBe("0190b0a6-0000-7000-8000-000000000001");
			});

			it("never mutates the caller's input", async () => {
				const input = Object.freeze({ title: "Frozen" });
				const post = await ctx.Posts.create(input);
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
				const user = await ctx.Users.create({ name: "A", email: "a@x.io" });
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
				const user = await ctx.Users.create({
					name: "J",
					email: "j@x.io",
					meta: { tags: ["a"] },
				});
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
				const post = await ctx.Posts.create({ id: "old", title: "T" });
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
				const post = await ctx.Posts.create({ id: "keep-me", title: "T" });
				const other = await ctx.Posts.create({ id: "other", title: "O" });
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
	});
}
