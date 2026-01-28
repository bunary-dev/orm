# @bunary/orm

ORM for Bunary — a Bun-first backend framework inspired by Laravel Eloquent.

## Installation

```bash
bun add @bunary/orm
```

## Quickstart

```ts
import { Model, setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: {
      path: "./database.sqlite",
    },
  },
});

const user = await Model.table("users").find(1);
```

## Requirements

- Bun ≥ 1.0.0

