# @bunary/orm

Laravel-style models for Bunary on [Drizzle](https://orm.drizzle.team): `defineModel()` wraps a Drizzle table with `find` / `findOrFail` / `where` / `create`, and instances with dirty tracking, `save()`, `delete()` and `refresh()`; model events (`creating` / `updating` / `saving` / `deleting`, cancellable by returning `false`), `hidden` columns left out of `toJSON()`, soft deletes (`softDeletes: true`, `withTrashed()` / `onlyTrashed()`, `restore()`, `forceDelete()`) named scopes (`User.active().get()`) and eager loading of Drizzle relations as model instances (`User.with({ posts: Post }).get()`). SQLite (`bun:sqlite`) and Postgres (`Bun.SQL`); migrations via drizzle-kit. Full reference: [docs/index.md](./docs/index.md).

Requires Bun ≥ 1.4.0.

## Installation

```bash
bun add @bunary/orm@^0.4.0 drizzle-orm
```

`drizzle-orm` is a peer dependency. `@bunary/core` (^0.4.0, `bun add @bunary/core@^0.4.0`) is an optional peer: with it, `ormProvider` (from `@bunary/orm/provider`) builds the Drizzle database from the `database` config key and binds it under `DatabaseToken`.

## Quick start

```typescript
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { defineModel } from "@bunary/orm";

const users = sqliteTable("users", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
});

const User = defineModel(drizzle({ client: new Database("app.sqlite") }), users);

const user = await User.create({ name: "Ada" }); // false if a listener cancels it
if (!user) throw new Error("cancelled");
user.name = "Ada Lovelace";
await user.save(); // updates only the dirty columns
```

For Postgres, relations and `with()`, the `@bunary/core` provider, events, hidden columns, soft deletes, scopes, reserved column names, bulk `where().update()` / `.delete()`, transactions (`{ tx }`), the raw Drizzle escape hatch, drizzle-kit migrations and upgrading from 0.2.x, see [docs/index.md](./docs/index.md).

## License

MIT
