# @bunary/orm

Laravel-style models for Bunary on [Drizzle](https://orm.drizzle.team): `defineModel()` wraps a Drizzle table with `find` / `findOrFail` / `where` / `create`, and instances with dirty tracking, `save()`, `delete()` and `refresh()`. SQLite (`bun:sqlite`) and Postgres (`Bun.SQL`); migrations via drizzle-kit. Full reference: [docs/index.md](./docs/index.md).

Requires Bun ≥ 1.4.0.

## Installation

```bash
bun add @bunary/orm drizzle-orm
```

`drizzle-orm` is a peer dependency.

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

const user = await User.create({ name: "Ada" });
user.name = "Ada Lovelace";
await user.save(); // updates only the dirty columns
```

For Postgres, transactions (`{ tx }`), the raw Drizzle escape hatch, drizzle-kit migrations and upgrading from 0.2.x, see [docs/index.md](./docs/index.md).

## License

MIT
