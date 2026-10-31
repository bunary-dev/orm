/**
 * defineModel on Postgres via drizzle-orm/bun-sql.
 *
 * Runs against a real database when TEST_POSTGRES_URL is set, e.g.
 * TEST_POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres bun test
 * and is skipped otherwise.
 */
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { type BunSQLDatabase, drizzle } from "drizzle-orm/bun-sql";
import {
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { defineModel, type Model } from "../src/index.js";
import {
	describeModelSuite,
	type postsShape,
	type SuiteContext,
	type usersShape,
} from "./helpers/model-suite.js";
import { persisted } from "./helpers/persisted.js";

const url = process.env.TEST_POSTGRES_URL;
const skip = !url;

const users = pgTable("orm_test_users", {
	id: serial("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	age: integer("age"),
	meta: jsonb("meta").$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
});

const posts = pgTable("orm_test_posts", {
	id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
	title: text("title").notNull(),
});

const tokens = pgTable("orm_test_tokens", {
	id: uuid("id").primaryKey().defaultRandom(),
	label: text("label").notNull(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let client: SQL | undefined;
let db: BunSQLDatabase;
const queries: string[] = [];

if (!skip) {
	beforeAll(async () => {
		client = new SQL(url as string);
		db = drizzle({
			client,
			logger: { logQuery: (query) => void queries.push(query) },
		});
		await db.execute(
			sql`DROP TABLE IF EXISTS orm_test_users, orm_test_posts, orm_test_tokens`,
		);
		await db.execute(sql`CREATE TABLE orm_test_users (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL,
			age INTEGER,
			meta JSONB,
			created_at TIMESTAMP(3) NOT NULL DEFAULT now()
		)`);
		await db.execute(sql`CREATE TABLE orm_test_posts (
			id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
			title TEXT NOT NULL
		)`);
		await db.execute(sql`CREATE TABLE orm_test_tokens (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			label TEXT NOT NULL
		)`);
	});

	afterAll(async () => {
		await db?.execute(
			sql`DROP TABLE IF EXISTS orm_test_users, orm_test_posts, orm_test_tokens`,
		);
		await client?.close();
	});
}

const truncate = () =>
	db.execute(
		sql`TRUNCATE orm_test_users, orm_test_posts, orm_test_tokens RESTART IDENTITY`,
	);

describeModelSuite(
	"postgres",
	(): SuiteContext => ({
		// The suite is typed against the SQLite shapes; the JS keys and row
		// types are identical.
		Users: defineModel(db, users) as unknown as SuiteContext["Users"],
		Posts: defineModel(db, posts) as unknown as SuiteContext["Posts"],
		defineUsers: (options) => defineModel(db, users, options as never) as never,
		users: users as unknown as typeof usersShape,
		posts: posts as unknown as typeof postsShape,
		queries,
		postIdPattern: UUID,
		async reset() {
			await truncate();
			queries.length = 0;
		},
	}),
	{ skip },
);

describe.skipIf(skip)("defineModel (postgres)", () => {
	let Users: Model<typeof users, BunSQLDatabase>;
	let Tokens: Model<typeof tokens, BunSQLDatabase>;

	beforeEach(async () => {
		await truncate();
		Users = defineModel(db, users);
		Tokens = defineModel(db, tokens);
	});

	it("returns a defaultRandom() uuid key assigned by the database", async () => {
		const token = persisted(await Tokens.create({ label: "t" }));
		expect(token.id).toMatch(UUID);
		expect((await Tokens.findOrFail(token.id)).label).toBe("t");
	});

	it("create() / save() / delete() with { tx } commit with the transaction", async () => {
		const keep = persisted(
			await Users.create({ name: "Keep", email: "k@x.io" }),
		);
		const drop = persisted(
			await Users.create({ name: "Drop", email: "d@x.io" }),
		);

		await db.transaction(async (tx) => {
			await Users.create({ name: "New", email: "n@x.io" }, { tx });
			keep.name = "Kept";
			await keep.save({ tx });
			await drop.delete({ tx });
		});

		const names = (await Users.query()).map((u) => u.name).sort();
		expect(names).toEqual(["Kept", "New"]);
	});

	it("rolls back model writes when the transaction fails", async () => {
		const keep = persisted(
			await Users.create({ name: "Keep", email: "k@x.io" }),
		);

		await expect(
			db.transaction(async (tx) => {
				await Users.create({ name: "New", email: "n@x.io" }, { tx });
				keep.name = "Changed";
				await keep.save({ tx });
				const inside = await Users.find(keep.id, { tx });
				expect(inside?.name).toBe("Changed");
				throw new Error("abort");
			}),
		).rejects.toThrow("abort");

		const rows = await Users.query();
		expect(rows.map((u) => u.name)).toEqual(["Keep"]);
	});
});
