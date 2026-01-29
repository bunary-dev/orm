# @bunary/orm

ORM for Bunary: models, query builder, migrations, driver abstraction (SQLite built-in; register custom drivers). Full reference: [docs/index.md](./docs/index.md).

## Installation

```bash
bun add @bunary/orm
```

## Quick start

```typescript
import { Model, setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: { type: "sqlite", sqlite: { path: "./database.sqlite" } }
});

const user = await Model.table("users").find(1);
```

For config (setOrmConfig, @bunary/core integration), migrations, schema builder, and driver API, see [docs/index.md](./docs/index.md).

## License

MIT
