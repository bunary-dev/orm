# @bunary/orm

Laravel-style models for Bunary, built on [Drizzle](https://orm.drizzle.team).

You define tables with Drizzle; `defineModel()` wraps a table in a model with
`find` / `create` / `save` / `delete`, dirty tracking and a typed not-found
error. Everything else (joins, aggregates, migrations) is plain Drizzle.

Supported dialects:

| Dialect  | Drizzle driver           | Client                |
| -------- | ------------------------ | --------------------- |
| SQLite   | `drizzle-orm/bun-sqlite` | `bun:sqlite`          |
| Postgres | `drizzle-orm/bun-sql`    | `Bun.SQL` (`bun`)     |

## Installation

`drizzle-orm` is a peer dependency: install it next to the orm.

```bash
bun add @bunary/orm drizzle-orm
bun add -d drizzle-kit # migrations
```

Requires Bun ≥ 1.4.0.

## Quick start

```typescript
import { Database } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { defineModel } from "@bunary/orm";

// 1. A Drizzle table
export const users = sqliteTable("users", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  email: text().notNull().unique(),
  age: integer(),
});

// 2. A Drizzle database
const db = drizzle({ client: new Database("app.sqlite") });

// 3. A model
export const User = defineModel(db, users);

const user = await User.create({ name: "Ada", email: "ada@example.com" });
user.id; // assigned by SQLite

user.name = "Ada Lovelace";
user.isDirty("name"); // true
await user.save(); // UPDATE "users" SET "name" = ? WHERE "users"."id" = ?

const found = await User.where(eq(users.email, "ada@example.com")).first();
await found?.delete();
```

## Defining a table and a model

### `defineModel(db, table, options?)`

| Argument              | Description                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `db`                  | A Drizzle database: `drizzle()` from `drizzle-orm/bun-sqlite` or `drizzle-orm/bun-sql` |
| `table`               | A Drizzle table of the same dialect (`sqliteTable` / `pgTable`)              |
| `options.primaryKey`  | Primary key column, e.g. `tags.slug`. Defaults to the table's `.primaryKey()` column |

Row types are inferred from the table: instances have the table's select type
(`typeof users.$inferSelect`), `create()` takes its insert type
(`typeof users.$inferInsert`), and `find(id)` takes the primary key's type.
Using a SQLite table with a Postgres database (or the other way round) is a
type error.

`defineModel()` throws when:

- the table has no single `.primaryKey()` column and no `primaryKey` option
  is given (composite keys are not supported);
- `primaryKey` is not a column of the table;
- a column's JS key is one of the instance method names (`isDirty`,
  `getDirty`, `save`, `delete`, `refresh`, `toJSON`). The SQL column name can
  be anything: rename the JS key, e.g. `saveFlag: integer("save")`.

### Postgres

```typescript
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { defineModel } from "@bunary/orm";

export const users = pgTable("users", {
  id: serial().primaryKey(),
  name: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const tokens = pgTable("tokens", {
  id: uuid().primaryKey().defaultRandom(),
  label: text().notNull(),
});

const db = drizzle({ client: new SQL(process.env.DATABASE_URL!) });

export const User = defineModel(db, users);
export const Token = defineModel(db, tokens);
```

### Primary keys

The orm never generates key values. The table decides:

| Key                                                     | Assigned by            |
| ------------------------------------------------------- | ---------------------- |
| `integer().primaryKey({ autoIncrement: true })` (SQLite) | the database           |
| `serial().primaryKey()` / identity columns (Postgres)   | the database           |
| `uuid().primaryKey().defaultRandom()` (Postgres)        | the database           |
| `text().primaryKey().$defaultFn(() => Bun.randomUUIDv7())` | Drizzle, at insert  |
| `text().primaryKey()` with no default                   | you, in `create()`     |

`create()` returns the row as persisted (via `RETURNING`), so the key and any
other database defaults are on the instance. An empty-string key is rejected
before any query runs; omit the key to use the table's default.

Tables whose key is declared with `primaryKey({ columns: [...] })` need the
`primaryKey` option:

```typescript
const tags = sqliteTable(
  "tags",
  { slug: text().notNull(), label: text().notNull() },
  (t) => [primaryKey({ columns: [t.slug] })],
);
const Tag = defineModel(db, tags, { primaryKey: tags.slug });
await Tag.find("bun");
```

## Reading

### `find(id, options?)`

The row with that primary key as an instance, or `null`.

```typescript
const user = await User.find(1);
```

### `findOrFail(id, options?)`

Like `find()`, but throws `ModelNotFoundError` when there is no row.

```typescript
import { ModelNotFoundError } from "@bunary/orm";

try {
  const user = await User.findOrFail(id);
} catch (error) {
  if (error instanceof ModelNotFoundError) {
    error.table; // "users"
    error.id; // the id you passed
  }
  throw error;
}
```

### `where(condition).get(options?)` / `.first(options?)`

`condition` is any Drizzle condition (`eq`, `and`, `or`, `gt`, `like`,
`inArray`, `isNull`, `` sql`...` ``, …). `get()` returns every matching row,
`first()` the first one or `null`.

```typescript
import { and, gt, isNull } from "drizzle-orm";

const adults = await User.where(gt(users.age, 17)).get();
const unnamed = await User.where(and(isNull(users.age), eq(users.name, ""))).first();
```

For ordering, limits, joins or aggregates use [`query()`](#raw-drizzle-query-and-hydrate).

## Creating

### `create(values, options?)`

Inserts a row and returns it as a clean instance, including database-assigned
values. `values` is copied, never mutated.

```typescript
const token = await Token.create({ label: "ci" });
token.id; // uuid from defaultRandom()
```

## Instances

### Attributes

Columns are enumerable properties, readable and writable:

```typescript
const user = await User.findOrFail(1);
user.name; // "Ada"
user.name = "Ada Lovelace";

const { id, name } = user; // destructuring works
JSON.stringify(user); // {"id":1,"name":"Ada Lovelace",...}
user.toJSON(); // plain object copy
```

Instances are sealed: assigning a property that is not a column throws a
`TypeError`, so typos fail loudly.

### Dirty tracking

| Method          | Returns                                                         |
| --------------- | --------------------------------------------------------------- |
| `isDirty()`     | whether any column differs from the persisted value             |
| `isDirty(key)`  | whether that column differs                                     |
| `getDirty()`    | an object with only the changed columns and their new values    |

Values are compared by content: `Date`s by time, JSON values and binary data
deeply. Changing a JSON value in place (`user.meta.tags.push("x")`) marks it
dirty; setting a column back to its persisted value makes it clean again.

```typescript
user.isDirty(); // false
user.email = "ada@lovelace.dev";
user.getDirty(); // { email: "ada@lovelace.dev" }
```

### `save(options?)`

Writes **only the dirty columns** (`UPDATE … SET <dirty columns> WHERE <pk> =
<persisted pk>`), then reloads the instance from the `RETURNING` row, so
`$onUpdate` values and triggers are reflected. With nothing dirty, `save()`
runs no query. Changing the primary key and saving updates the key. Throws
`ModelNotFoundError` when the row no longer exists. Returns the instance.

Because only dirty columns are written, two instances of the same row that
change different columns do not overwrite each other.

### `delete(options?)`

Deletes the row, matched by its persisted primary key.

### `refresh(options?)`

Reloads every column from the database and discards unsaved changes. Throws
`ModelNotFoundError` when the row no longer exists. Returns the instance.

## Transactions

`create()`, `save()`, `delete()` and every read (`find`, `findOrFail`,
`where().get/first`, `refresh`, `query`) accept `{ tx }`: a Drizzle
transaction (or database) of the same dialect, used instead of the model's
`db`.

### Postgres

Drizzle transactions are async: await the model calls inside the callback.
Any error rolls the transaction back.

```typescript
await db.transaction(async (tx) => {
  const order = await Order.create({ userId: user.id, total: 100 }, { tx });
  user.balance -= 100;
  await user.save({ tx });
});
```

### SQLite (bun:sqlite)

bun:sqlite transactions are **synchronous**: the callback must not be
`async` and must not `await`, or the work after the first `await` runs after
the transaction has committed. The orm issues each query synchronously when
you call a method, so calls made inside the callback are part of the
transaction; their promises are already settled and can be awaited after it:

```typescript
import type { ModelInstance } from "@bunary/orm";

let created!: Promise<ModelInstance<typeof orders>>;
db.transaction((tx) => {
  created = Order.create({ userId: user.id, total: 100 }, { tx });
  user.balance -= 100;
  user.save({ tx });
});
const order = await created;
```

With `{ tx }`, errors (a failed query, a missing row, an empty-string key) are
**thrown synchronously** instead of returned as a rejected promise, so the
transaction callback sees them and Drizzle rolls back. `tx.rollback()` works
as usual. Without `{ tx }`, errors are always rejected promises.

If you need a value from one statement to build the next inside a SQLite
transaction, use Drizzle's sync API there and `hydrate()` the result:

```typescript
db.transaction((tx) => {
  const row = tx.insert(orders).values({ userId: user.id }).returning().get();
  const order = Order.hydrate(row);
  // ...
});
```

Instances are in-memory objects: when a transaction rolls back, instances
saved inside it keep their new values; call `refresh()` to reload them.

## Raw Drizzle: `query()` and `hydrate()`

`query(options?)` is `db.select().from(table)`, fully typed, for anything the
model API does not cover. It returns plain rows.

```typescript
import { desc, gt } from "drizzle-orm";

const rows = await User.query()
  .where(gt(users.age, 17))
  .orderBy(desc(users.age))
  .limit(10);
```

`hydrate(row)` wraps a row you selected yourself in a clean instance:

```typescript
const users = rows.map(User.hydrate);
```

The model also exposes `db`, `table` and `tableName`. For joins, aggregates,
upserts or bulk writes, use `User.db` and Drizzle directly.

## Migrations (drizzle-kit)

The orm has no migrator: schema changes are Drizzle tables plus
[drizzle-kit](https://orm.drizzle.team/docs/kit-overview).

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite", // or "postgresql"
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: "./app.sqlite" }, // or process.env.DATABASE_URL
});
```

```bash
bunx drizzle-kit generate # write SQL migrations from your tables
bunx drizzle-kit migrate  # apply them
```

To apply migrations from code at startup:

```typescript
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

migrate(db, { migrationsFolder: "./drizzle" });

// Postgres: import from "drizzle-orm/bun-sql/migrator" and `await migrate(...)`
```

## SQL safety

The orm never builds SQL strings. Every query goes through Drizzle's query
builder: table and column names are quoted as identifiers by Drizzle and
values are bound as parameters. Conditions are Drizzle expressions; inside
`` sql`...` `` templates, interpolated values are parameters too (use
`sql.identifier()` for dynamic identifiers, never `sql.raw()` with input).

## Errors

| Error                | Thrown by                                     | Properties    |
| -------------------- | --------------------------------------------- | ------------- |
| `ModelNotFoundError` | `findOrFail()`, `save()` and `refresh()` on a deleted row | `table`, `id` |
| `Error`              | `defineModel()` (invalid definition), `create()` (empty-string key) | |

Database errors (constraint violations, …) are passed through from the driver.

## Types

| Export                         | Description                                          |
| ------------------------------ | ---------------------------------------------------- |
| `Model<TTable, TDb, TId>`      | What `defineModel()` returns                         |
| `ModelInstance<TTable, TDb>`   | A row plus the instance methods                      |
| `RowOf<TTable>` / `NewRowOf<TTable>` | Select / insert types of a table               |
| `QueryOptions<TDb>`            | `{ tx? }`                                            |
| `DefineModelOptions`           | `{ primaryKey? }`                                    |
| `WhereQuery`                   | What `where()` returns                               |
| `SelectQuery<TDb, TTable>`     | What `query()` returns                               |
| `AnyDatabase`, `TableFor`, `TransactionFor`, `PrimaryKeyColumn`, `InstanceMethods` | Helpers used by the above |

```typescript
import type { ModelInstance } from "@bunary/orm";

type UserRecord = ModelInstance<typeof users>;
```

## Upgrading from 0.2.x

This version replaces the hand-rolled query builder, schema builder, migrator and
drivers with Drizzle. There are no compatibility shims.

| 0.2                                              | Now                                                    |
| ------------------------------------------------ | ------------------------------------------------------ |
| `setOrmConfig()`, `defineOrmConfig()`, `orm` key in `@bunary/core` config | create a Drizzle `db` and pass it to `defineModel()` |
| `Model.table("users").find(1)`                   | `defineModel(db, users).find(1)`                       |
| `class Users extends BaseModel`                  | `const User = defineModel(db, users)`                  |
| `.where("age", ">", 18).all()`                   | `.where(gt(users.age, 18)).get()`                      |
| `.select()`, `.exclude()`, `.orderBy()`, `.limit()`, `.offset()`, `.count()` | `query()` and Drizzle (`db.$count(users)` for counts) |
| `BaseModel.create()` generating UUID v7 keys     | `$defaultFn(() => Bun.randomUUIDv7())` on the column   |
| `protected` / `timestamps` exclusion             | select the columns you want with `User.db.select({...})` |
| `Schema.create()`, `Migrator`, `MigrationsRepository` | Drizzle tables + drizzle-kit                      |
| `SqliteDriver`, `registerDriver()`, `getDriver().transaction()` | Drizzle drivers and `db.transaction()` |

## Testing

`bun test` always runs the SQLite tests. The Postgres tests run when
`TEST_POSTGRES_URL` points at a database they may create and drop
`orm_test_*` tables in, and are skipped otherwise:

```bash
TEST_POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres bun test
```

## License

MIT
