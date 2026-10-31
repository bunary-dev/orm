/**
 * Eager loading with `with()` on SQLite: relations come from Drizzle
 * `relations()` passed to `drizzle({ schema })`, related rows are hydrated
 * by the related model.
 */
import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { eq, relations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { defineModel, type ModelInstance } from "../src/index.js";
import { persisted } from "./helpers/persisted.js";

const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	password: text("password").notNull().default("secret"),
	deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

const posts = sqliteTable("posts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	authorId: integer("author_id").notNull(),
	editorId: integer("editor_id"),
	title: text("title").notNull(),
	published: integer("published", { mode: "boolean" }).notNull().default(false),
	deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

const usersRelations = relations(users, ({ many }) => ({
	posts: many(posts, { relationName: "author" }),
	edited: many(posts, { relationName: "editor" }),
}));

const postsRelations = relations(posts, ({ one }) => ({
	author: one(users, {
		fields: [posts.authorId],
		references: [users.id],
		relationName: "author",
	}),
	editor: one(users, {
		fields: [posts.editorId],
		references: [users.id],
		relationName: "editor",
	}),
}));

const schema = { users, posts, usersRelations, postsRelations };

function open() {
	const client = new Database(":memory:");
	client.exec(`
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			password TEXT NOT NULL DEFAULT 'secret',
			deleted_at INTEGER
		);
		CREATE TABLE posts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			author_id INTEGER NOT NULL,
			editor_id INTEGER,
			title TEXT NOT NULL,
			published INTEGER NOT NULL DEFAULT 0,
			deleted_at INTEGER
		);
	`);
	const queries: string[] = [];
	const db = drizzle({
		client,
		schema,
		logger: { logQuery: (query) => void queries.push(query) },
	});
	const User = defineModel(db, users, {
		hidden: ["password"],
		softDeletes: true,
	});
	const Post = defineModel(db, posts, {
		softDeletes: true,
		scopes: { published: (q) => q.where(eq(posts.published, true)) },
	});
	return { client, db, queries, User, Post };
}

async function seed() {
	const ctx = open();
	const { User, Post } = ctx;
	const ada = persisted(await User.create({ name: "Ada" }));
	const bob = persisted(await User.create({ name: "Bob" }));
	const cy = persisted(await User.create({ name: "Cy" }));
	const p1 = persisted(
		await Post.create({ authorId: ada.id, title: "One", published: true }),
	);
	const p2 = persisted(
		await Post.create({ authorId: ada.id, editorId: bob.id, title: "Two" }),
	);
	const p3 = persisted(await Post.create({ authorId: bob.id, title: "Three" }));
	ctx.queries.length = 0;
	return { ...ctx, ada, bob, cy, p1, p2, p3 };
}

const titles = (list: { title: string }[]) => list.map((p) => p.title).sort();

describe("with() eager loading (sqlite)", () => {
	it("one-to-many: hydrates related model instances per parent", async () => {
		const { User, Post } = await seed();
		const list = await User.with({ posts: Post }).get();
		const byName = Object.fromEntries(list.map((u) => [u.name, u]));
		expect(titles(byName.Ada?.posts ?? [])).toEqual(["One", "Two"]);
		expect(titles(byName.Bob?.posts ?? [])).toEqual(["Three"]);
		expect(byName.Cy?.posts).toEqual([]);

		const post = byName.Ada?.posts[0];
		expect(post?.isDirty()).toBe(false);
		expect(typeof post?.save).toBe("function");
		expect(typeof post?.trashed).toBe("function");
	});

	it("loads each relation with one query, not one per parent", async () => {
		const { User, Post, queries } = await seed();
		await User.with({ posts: Post }).get();
		expect(queries).toHaveLength(2);
		expect(queries[1]).toContain('"posts"');
		expect(queries[1]).toContain(" in ");
	});

	it("many-to-one: hydrates the parent model, null when the key is null", async () => {
		const { Post, User } = await seed();
		const list = await Post.with({ author: User, editor: User }).get();
		const byTitle = Object.fromEntries(list.map((p) => [p.title, p]));
		expect(byTitle.One?.author.name).toBe("Ada");
		expect(byTitle.Two?.editor?.name).toBe("Bob");
		expect(byTitle.One?.editor).toBeNull();
		expect(byTitle.Three?.author.name).toBe("Bob");
		expect(byTitle.One?.author.isDirty()).toBe(false);
	});

	it("first() and find() eager-load too", async () => {
		const { Post, User, ada, p2 } = await seed();
		const first = await User.with({ posts: Post })
			.where(eq(users.id, ada.id))
			.first();
		expect(titles(first?.posts ?? [])).toEqual(["One", "Two"]);

		const found = await Post.with({ author: User }).find(p2.id);
		expect(found?.author.name).toBe("Ada");
		expect(await Post.with({ author: User }).find(999)).toBeNull();

		const sure = await Post.with({ author: User }).findOrFail(p2.id);
		expect(sure.author.id).toBe(ada.id);
		await expect(Post.with({ author: User }).findOrFail(999)).rejects.toThrow(
			'No row in "posts" with primary key 999',
		);
	});

	it("does not query related rows when no parent matched", async () => {
		const { Post, User, queries } = await seed();
		const none = await User.with({ posts: Post })
			.where(eq(users.id, 999))
			.get();
		expect(none).toEqual([]);
		expect(queries).toHaveLength(1);
	});

	it("leaves out soft-deleted related rows", async () => {
		const { Post, User, ada, bob, p1, p3 } = await seed();
		await p1.delete();
		await bob.delete();

		const author = await User.with({ posts: Post }).findOrFail(ada.id);
		expect(titles(author.posts)).toEqual(["Two"]);

		const post = await Post.with({ author: User }).findOrFail(p3.id);
		expect(post.author).toBeNull();
	});

	it("loads soft-deleted related rows when the parent query includes them", async () => {
		const { Post, User, bob } = await seed();
		await bob.delete();
		const list = await User.withTrashed().with({ posts: Post }).get();
		expect(list.map((u) => u.name).sort()).toEqual(["Ada", "Bob", "Cy"]);
	});

	it("chains with where(), scopes, the trashed filters and another with()", async () => {
		const { Post, User } = await seed();
		const list = await Post.published()
			.with({ author: User })
			.with({ editor: User })
			.get();
		expect(list).toHaveLength(1);
		expect(list[0]?.author.name).toBe("Ada");
		expect(list[0]?.editor).toBeNull();

		const scoped = await Post.with({ author: User }).published().get();
		expect(scoped.map((p) => p.author.name)).toEqual(["Ada"]);
	});

	it("exposes relations as read-only enumerable properties", async () => {
		const { Post, User, ada } = await seed();
		const user = await User.with({ posts: Post }).findOrFail(ada.id);
		expect(Object.keys(user)).toContain("posts");
		expect(() => {
			(user as { posts: unknown }).posts = [];
		}).toThrow();
		expect(user.isDirty()).toBe(false);
		user.name = "Ada L.";
		persisted(await user.save());
		expect(user.posts).toHaveLength(2);
	});

	it("serializes loaded relations with their own toJSON()", async () => {
		const { Post, User, p1 } = await seed();
		const post = await Post.with({ author: User, editor: User }).findOrFail(
			p1.id,
		);
		const json = JSON.parse(JSON.stringify(post));
		expect(json.author).toEqual({
			id: post.author.id,
			name: "Ada",
			deletedAt: null,
		});
		expect(json.editor).toBeNull();
		expect(post.toJSON().author).toEqual(json.author);

		const user = await User.with({ posts: Post }).findOrFail(post.authorId);
		expect(
			user
				.toJSON()
				.posts.map((p) => p.title)
				.sort(),
		).toEqual(["One", "Two"]);
	});

	it("eager-loads inside a synchronous bun:sqlite transaction", async () => {
		const { db, Post, User, ada } = await seed();
		let loaded: Promise<{ posts: unknown[] } | null> | undefined;
		expect(() =>
			db.transaction((tx) => {
				void Post.create({ authorId: ada.id, title: "Four" }, { tx });
				loaded = User.with({ posts: Post })
					.where(eq(users.id, ada.id))
					.first({ tx });
				throw new Error("rollback");
			}),
		).toThrow("rollback");
		// Loaded inside the transaction, which then rolled back.
		expect((await loaded)?.posts).toHaveLength(3);
		expect(await Post.where(undefined).get()).toHaveLength(3);
	});

	it("matches relations on several columns, including dates", async () => {
		const shifts = sqliteTable("shifts", {
			id: integer("id").primaryKey({ autoIncrement: true }),
			team: text("team").notNull(),
			day: integer("day", { mode: "timestamp_ms" }).notNull(),
		});
		const assignments = sqliteTable("assignments", {
			id: integer("id").primaryKey({ autoIncrement: true }),
			team: text("team").notNull(),
			day: integer("day", { mode: "timestamp_ms" }).notNull(),
			who: text("who").notNull(),
		});
		const client = new Database(":memory:");
		client.exec(`
			CREATE TABLE shifts (id INTEGER PRIMARY KEY AUTOINCREMENT, team TEXT NOT NULL, day INTEGER NOT NULL);
			CREATE TABLE assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, team TEXT NOT NULL, day INTEGER NOT NULL, who TEXT NOT NULL);
		`);
		const db = drizzle({
			client,
			schema: {
				shifts,
				assignments,
				shiftsRelations: relations(shifts, ({ many }) => ({
					assignments: many(assignments),
				})),
				assignmentsRelations: relations(assignments, ({ one }) => ({
					shift: one(shifts, {
						fields: [assignments.team, assignments.day],
						references: [shifts.team, shifts.day],
					}),
				})),
			},
		});
		const Shift = defineModel(db, shifts);
		const Assignment = defineModel(db, assignments);
		const monday = new Date("2026-11-02T09:00:00.000Z");
		const later = new Date("2026-11-02T09:00:00.500Z");
		await Shift.create({ team: "a", day: monday });
		await Shift.create({ team: "a", day: later });
		await Shift.create({ team: "b", day: monday });
		await Assignment.create({ team: "a", day: monday, who: "Ada" });
		await Assignment.create({ team: "a", day: later, who: "Bob" });
		await Assignment.create({ team: "b", day: monday, who: "Cy" });
		await Assignment.create({ team: "b", day: monday, who: "Dee" });

		const list = await Shift.with({ assignments: Assignment }).get();
		expect(list.map((s) => s.assignments.map((a) => a.who).sort())).toEqual([
			["Ada"],
			["Bob"],
			["Cy", "Dee"],
		]);
		const back = await Assignment.with({ shift: Shift }).get();
		expect(back.map((a) => `${a.who}:${a.shift.team}`)).toEqual([
			"Ada:a",
			"Bob:a",
			"Cy:b",
			"Dee:b",
		]);
	});

	describe("errors", () => {
		it("throws for a name that is not a relation of the table", async () => {
			const { Post, User } = await seed();
			expect(() =>
				// @ts-expect-error not a relation of users
				User.with({ nope: Post }),
			).toThrow('defineModel: "users" has no relation "nope"');
		});

		it("throws for a model whose table is not the relation's table", async () => {
			const { User } = await seed();
			expect(() =>
				// @ts-expect-error posts relates to the posts table
				User.with({ posts: User }),
			).toThrow(
				'defineModel: relation "posts" of "users" needs a model for "posts", got one for "users"',
			);
			expect(() =>
				// @ts-expect-error not a model
				User.with({ posts: {} }),
			).toThrow('defineModel: relation "posts" of "users" needs a model');
		});

		it("throws when the database was created without a schema", async () => {
			const db = drizzle({ client: new Database(":memory:") });
			const User = defineModel(db, users);
			const Post = defineModel(db, posts);
			expect(() =>
				// @ts-expect-error the database has no relations
				User.with({ posts: Post }),
			).toThrow(
				'defineModel: "users" has no relation "posts"; define it with relations() and pass it in drizzle({ schema })',
			);
		});

		it("throws for a relation named after a column or instance method", () => {
			const notes = sqliteTable("notes", {
				id: integer("id").primaryKey(),
				title: text("title").notNull(),
			});
			const notesRelations = relations(notes, ({ one }) => ({
				title: one(notes, { fields: [notes.id], references: [notes.id] }),
				save: one(notes, { fields: [notes.id], references: [notes.id] }),
			}));
			const db = drizzle({
				client: new Database(":memory:"),
				schema: { notes, notesRelations },
			});
			const Note = defineModel(db, notes);
			expect(() => Note.with({ title: Note })).toThrow(
				'defineModel: relation "title" of "notes" has the name of a column or model method; rename it',
			);
			expect(() => Note.with({ save: Note })).toThrow(
				'defineModel: relation "save" of "notes" has the name of a column or model method; rename it',
			);
		});
	});
});

// Only type-checked; never awaited.
async function typeChecks() {
	const { User, Post } = open();

	const user = await User.with({ posts: Post }).findOrFail(1);
	const userPosts: ModelInstance<
		typeof posts,
		ReturnType<typeof open>["db"],
		never,
		true
	>[] = user.posts;
	const firstTitle: string | undefined = user.posts[0]?.title;
	user.posts[0]?.trashed();

	const post = await Post.with({ author: User, editor: User }).first();
	if (post) {
		// authorId is NOT NULL: the author is not nullable.
		const authorName: string = post.author.name;
		// @ts-expect-error editorId is nullable, so the editor may be null
		const editorName: string = post.editor.name;
		const editor: { name: string } | null = post.editor;
		// the related model's hidden columns are left out of its JSON
		// @ts-expect-error password is hidden on User
		post.toJSON().author.password;
		const json: { title: string; author: { name: string } } = post.toJSON();
		void [authorName, editorName, editor, json];
	}

	const many = await User.with({ posts: Post }).get();
	const nested: string[] = many.flatMap((u) => u.posts.map((p) => p.title));

	// Without with(), relations are not on the instance.
	const plain = await User.findOrFail(1);
	// @ts-expect-error posts is not loaded
	plain.posts;

	// with() keeps the scopes and trashed filters
	await Post.with({ author: User }).published().withTrashed().get();

	// @ts-expect-error find() takes the primary key type
	await User.with({ posts: Post }).find("1");

	void [userPosts, firstTitle, nested];
}
void typeChecks;
