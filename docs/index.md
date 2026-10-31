# @bunary/orm

Laravel-style models for Bunary, built on [Drizzle](https://orm.drizzle.team).

You define tables with Drizzle; `defineModel()` wraps a table in a model with
`find` / `create` / `save` / `delete`, dirty tracking, model events, hidden
columns, soft deletes, named scopes and a typed not-found error. Everything else (joins, aggregates, migrations) is plain Drizzle.

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
if (!user) throw new Error("cancelled by a creating/saving listener"); // see Events
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
| `options.hidden`      | Column keys left out of `toJSON()`, see [Hidden columns](#hidden-columns) |
| `options.events`      | Listeners per event, see [Events](#events)                                 |
| `options.softDeletes` | `true` to soft-delete via a `deletedAt` column, see [Soft deletes](#soft-deletes) |
| `options.scopes`      | Named query scopes, see [Scopes](#scopes)                                  |

Row types are inferred from the table: instances have the table's select type
(`typeof users.$inferSelect`), `create()` takes its insert type
(`typeof users.$inferInsert`), and `find(id)` takes the primary key's type.
Using a SQLite table with a Postgres database (or the other way round) is a
type error.

`defineModel()` throws when:

- the table has no single `.primaryKey()` column and no `primaryKey` option
  is given (composite keys are not supported);
- `primaryKey` is not a column of the table;
- a column's JS key is a [reserved name](#reserved-names);
- a `hidden` key is not a column of the table;
- `softDeletes` is `true` but the table has no `deletedAt` column;
- a scope name is [reserved](#scopes) or a scope is not a function.

### Reserved names

Columns are properties of the instance, next to its methods, so a column's JS
key may not be one of the instance method names: `isDirty`, `getDirty`,
`save`, `delete`, `refresh`, `toJSON`, and the soft-delete methods `restore`,
`trashed` and `forceDelete` (reserved on every model), or `constructor`. Such a table is a
**type error** in `defineModel()`, naming the column, and `defineModel()`
also **throws at runtime** (`column "save" of "posts" is reserved for a model
method; rename its JS key`) for code that is not type-checked.

The SQL column name can be anything: only the JS key matters, so rename it:

```typescript
const posts = sqliteTable("posts", {
  id: integer().primaryKey(),
  // save: integer(),            // type error + throws
  saveFlag: integer("save"),     // fine: SQL column is still "save"
});
```

The list is exported as the `ReservedColumnName` type.

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

`where()` returns a model query (`ModelQuery`). Calling `.where()` on it
again adds another condition, combined with `AND`. Queries are immutable:
each chained call returns a new query and leaves the old one as it was.
[Scopes](#scopes) and, with soft deletes, `withTrashed()` / `onlyTrashed()`
chain the same way.

```typescript
const adultAdas = await User.where(gt(users.age, 17)).where(eq(users.name, "Ada")).get();
```

For ordering, limits, joins or aggregates use [`query()`](#raw-drizzle-query-and-hydrate).

### Bulk writes: `where(condition).update(values, options?)` / `.delete(options?)`

Update or delete every matching row in one statement and get the number of
rows affected. An `undefined` condition matches every row.

```typescript
const archived = await User.where(lt(users.lastSeen, cutoff)).update({ archived: true });
const removed = await User.where(eq(users.archived, true)).delete();
```

Bulk writes load no instances and **fire no [model events](#events)**; use
instance `save()` / `delete()` when listeners must run.

## Creating

### `create(values, options?)`

Fires `saving` and `creating`, then inserts a row and returns it as a clean
instance, including database-assigned values. `values` is copied, never
mutated. Resolves to `false` (and inserts nothing) when a listener cancels
it, so narrow the result before using it:

```typescript
const token = await Token.create({ label: "ci" });
if (!token) throw new Error("cancelled");
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
user.toJSON(); // plain object copy, without hidden columns
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

Fires `saving`, then, if anything is dirty, `updating`, then writes **only the dirty columns** (`UPDATE … SET <dirty columns> WHERE <pk> =
<persisted pk>`), then reloads the instance from the `RETURNING` row, so
`$onUpdate` values and triggers are reflected. With nothing dirty, `save()`
runs no query. Changing the primary key and saving updates the key. Throws
`ModelNotFoundError` when the row no longer exists. Returns the instance, or
`false` when a listener cancelled the save (nothing is written and the
instance keeps its unsaved changes).

Because only dirty columns are written, two instances of the same row that
change different columns do not overwrite each other.

### `delete(options?)`

Fires `deleting`, then deletes the row, matched by its persisted primary key.
Returns `true`, or `false` when a listener cancelled the delete. With
[soft deletes](#soft-deletes) it sets `deletedAt` instead.

### `refresh(options?)`

Reloads every column from the database and discards unsaved changes. Throws
`ModelNotFoundError` when the row no longer exists. Returns the instance.

## Events

Listeners run **before** a write and can change it or cancel it, as with
Eloquent's model events:

| Event      | Fired by                                         | Listener receives                    |
| ---------- | ------------------------------------------------ | ------------------------------------ |
| `saving`   | `create()` and `save()`, first                   | the insert values, or the instance   |
| `creating` | `create()`, after `saving`                       | the insert values (a mutable copy)   |
| `updating` | `save()`, after `saving`, only if anything is dirty | the instance                       |
| `deleting` | `delete()` and `forceDelete()`                   | the instance                         |

Register listeners with the `events` option (one function or a list per
event) and/or with `Model.on(event, listener)`, which returns a function that
removes the listener:

```typescript
const User = defineModel(db, users, {
  events: {
    creating: async (values) => {
      values.password = await Bun.password.hash(values.password);
    },
    deleting: (user) => user.role !== "admin", // false cancels
  },
});

const off = User.on("updating", (user) => {
  if (user.isDirty("email")) user.emailVerifiedAt = null;
});
off(); // remove it again
```

- Listeners may be **async**; they run one at a time, in registration order
  (the `events` option first, then `on()` calls in order).
- Returning **`false`** (or a promise of `false`) **cancels** the write: nothing
  is written, later listeners do not run, and `create()` / `save()` /
  `delete()` resolve to `false`. Any other return value, including
  `undefined`, lets it proceed.
- **Throwing** (or rejecting) aborts the write and propagates to the caller:
  the method rejects, or with `{ tx }` throws (see [Transactions](#transactions)).
- Changes listeners make are written: `creating` / `saving` (on create) may
  edit the values, `saving` / `updating` (on save) may set attributes, and
  the dirty columns are computed after the listeners have run.
- `saving` receives the values from `create()` and the instance from
  `save()`; tell them apart with `"isDirty" in target`.
- Only **instance operations** fire events. Bulk
  [`where(...).update()` / `.delete()`](#bulk-writes-wherecondition-updatevalues-options--deleteoptions),
  `query()` and anything done through `User.db` fire none.
- Listeners belong to the model returned by `defineModel()`; another model of
  the same table has its own.

## Hidden columns

`hidden` lists column keys to leave out of `toJSON()`, and therefore out of
`JSON.stringify(instance)` and JSON responses:

```typescript
const User = defineModel(db, users, { hidden: ["password", "rememberToken"] });

const user = await User.findOrFail(1);
user.password; // loaded and usable in code
JSON.stringify(user); // {"id":1,"name":"Ada",...} without password / rememberToken
```

Hidden columns are still selected, readable, writable, dirty-tracked and
saved; only `toJSON()` omits them, and its return type does too. They remain
enumerable properties, so spreading (`{ ...user }`) or `Object.keys(user)`
still includes them, as do the plain rows from `query()`. Keys are checked:
a key that is not a column is a type error and throws in `defineModel()`.

## Soft deletes

With `softDeletes: true`, deleting a row sets its `deletedAt` column instead
of removing it, and the model's queries leave such rows out, as with
Eloquent's `SoftDeletes`. The table needs a **nullable `Date` column with the
JS key `deletedAt`** (the SQL name can be anything); on any other table,
`softDeletes: true` is a type error, and `defineModel()` throws if there is
no `deletedAt` column at all.

```typescript
// SQLite
const posts = sqliteTable("posts", {
  id: integer().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});
// Postgres: deletedAt: timestamp("deleted_at"),

const Post = defineModel(db, posts, { softDeletes: true });

const post = await Post.findOrFail(1);
await post.delete(); // UPDATE "posts" SET "deleted_at" = ? WHERE "posts"."id" = ?
post.trashed(); // true
await Post.find(1); // null

await Post.withTrashed().where(eq(posts.id, 1)).first(); // found again
await post.restore(); // deletedAt = null
await post.forceDelete(); // DELETE FROM "posts" WHERE ...
```

**Instances**

| Method                  | Does                                                                                   | Returns |
| ----------------------- | -------------------------------------------------------------------------------------- | ------- |
| `delete(options?)`      | Fires `deleting`, then sets `deletedAt` to now (writing only that column; other unsaved changes stay dirty) | `true`, or `false` if cancelled |
| `trashed()`             | Whether `deletedAt` is set                                                             | `boolean` |
| `restore(options?)`     | Sets `deletedAt` to `null` and calls `save()`, so `saving` and `updating` fire and other unsaved changes are written too | the instance, or `false` if cancelled |
| `forceDelete(options?)` | Fires `deleting`, then really deletes the row                                          | `true`, or `false` if cancelled |

A trashed instance can still be `save()`d and `refresh()`ed: those match by
primary key only.

**Queries.** `find()`, `findOrFail()`, `where().get()` / `.first()`, bulk
`update()` and [scopes](#scopes) leave out soft-deleted rows. To change that,
start or chain a query with:

| Method          | Rows                         |
| --------------- | ---------------------------- |
| `withTrashed()` | soft-deleted ones included   |
| `onlyTrashed()` | only the soft-deleted ones   |

```typescript
const all = await Post.withTrashed().get();
const binned = await Post.where(lt(posts.deletedAt, lastMonth)).onlyTrashed().get();
```

Bulk writes on a soft-deleting model (none fire events, all return a count):

| Method                         | Does                                                                    |
| ------------------------------ | ----------------------------------------------------------------------- |
| `.delete(options?)`            | sets `deletedAt` on the matching rows (not already trashed, unless `withTrashed()`) |
| `.restore(options?)`           | sets `deletedAt` to `null` on the matching **trashed** rows             |
| `.forceDelete(options?)`       | really deletes the matching rows; trashed rows only with `withTrashed()` / `onlyTrashed()` |

```typescript
await Post.onlyTrashed().where(lt(posts.deletedAt, lastYear)).forceDelete(); // purge
```

`query()` is raw Drizzle and **includes** soft-deleted rows; filter with
`isNull(posts.deletedAt)` yourself. Models without `softDeletes` have none of
these methods (using them is a type error) and delete for real.

## Scopes

Named scopes are reusable query constraints, like Eloquent's local scopes.
Define them with the `scopes` option: each gets the query (plus any arguments)
and returns a query, usually `query.where(...)`:

```typescript
const User = defineModel(db, users, {
  softDeletes: true,
  scopes: {
    active: (q) => q.where(eq(users.active, true)),
    olderThan: (q, age: number) => q.where(gt(users.age, age)),
  },
});

await User.active().get();
await User.active().olderThan(17).first();
await User.where(like(users.email, "%@example.com")).active().get();
await User.onlyTrashed().active().get();
await User.active().update({ newsletter: true }); // bulk writes too
```

- Each scope becomes a method of the model and of its queries, chainable
  with `where()`, other scopes and `withTrashed()` / `onlyTrashed()`.
- Scope names and argument types are inferred: `User.inactive()` and
  `User.olderThan("x")` are type errors.
- The query a scope receives is typed without the model's scopes; to combine
  scopes, chain them at the call site.
- A scope must return the query it was given or one chained from it;
  returning anything else throws when the scope is called.
- Scope names may not shadow model or query members: `db`, `table`,
  `tableName`, `find`, `findOrFail`, `where`, `create`, `query`, `hydrate`,
  `on`, `get`, `first`, `update`, `delete`, `restore`, `forceDelete`,
  `withTrashed`, `onlyTrashed`, `then` (or `constructor`). Such a name is a
  type error naming the scope, and `defineModel()` throws for it. The list is
  exported as the `ReservedScopeName` type.

## Transactions

`create()`, `save()`, `delete()`, `restore()`, `forceDelete()`, bulk `where().update()` / `.delete()` / `.restore()` / `.forceDelete()` and every read (`find`, `findOrFail`,
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

let created!: Promise<ModelInstance<typeof orders> | false>;
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

Event listeners run synchronously as long as they return synchronously, so
their writes stay inside the transaction too. **Inside a bun:sqlite
transaction, listeners must be synchronous**: an async listener defers the
query until after the callback has returned and the transaction has committed.
A listener that throws with `{ tx }` throws synchronously, rolling the
transaction back.

Instances are in-memory objects: when a transaction rolls back, instances
saved inside it keep their new values; call `refresh()` to reload them.

## Raw Drizzle: `query()` and `hydrate()`

`query(options?)` is `db.select().from(table)`, fully typed, for anything the
model API does not cover. It returns plain rows, soft-deleted ones included.

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

The model also exposes `db`, `table` and `tableName`. For joins, aggregates
or upserts, use `User.db` and Drizzle directly.

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
| `Error`              | `defineModel()` (invalid definition, reserved column or scope name, unknown hidden key, `softDeletes` without `deletedAt`), `create()` (empty-string key), a scope that does not return a query | |

Errors thrown by event listeners propagate unchanged.

Database errors (constraint violations, …) are passed through from the driver.

## Types

| Export                         | Description                                          |
| ------------------------------ | ---------------------------------------------------- |
| `Model<TTable, TDb, TId, THidden, TSoft, TScopes>` | What `defineModel()` returns (`ModelMethods` plus soft-delete and scope methods) |
| `ModelInstance<TTable, TDb, THidden, TSoft>` | A row plus the instance methods (`InstanceMethods`, `SoftDeleteInstanceMethods`) |
| `RowOf<TTable>` / `NewRowOf<TTable>` | Select / insert types of a table               |
| `QueryOptions<TDb>`            | `{ tx? }`                                            |
| `DefineModelOptions`           | `{ primaryKey?, hidden?, events?, softDeletes?, scopes? }` |
| `ModelEvent`                   | `"creating" \| "updating" \| "saving" \| "deleting"` |
| `ModelListener<T>`, `ModelListeners`, `ModelEventTargets` | A listener, the `events` option, what each event receives |
| `ReservedColumnName`, `CheckReservedColumns` | The reserved column keys and the check `defineModel()` applies |
| `ModelQuery<TTable, TDb, THidden, TSoft, TScopes>` | What `where()`, `withTrashed()` / `onlyTrashed()` and scopes return (`QueryMethods`, `SoftDeleteQueryMethods`) |
| `Scope`, `ScopeMap`, `ScopeMethods`, `ScopesOf`, `NoScopes` | A scope, the `scopes` option, the methods it adds |
| `ReservedScopeName`, `CheckReservedScopes`, `ScopeConstraint` | The reserved scope names and the check `defineModel()` applies |
| `SupportsSoftDeletes<TTable>`, `SoftDeletesRequiresDeletedAt` | Whether a table can soft-delete, and the type error shown when it cannot |
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
| `protected` / `timestamps` exclusion             | `hidden: [...]` (omits from `toJSON()`), or select the columns you want with `User.db.select({...})` |
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
