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

## Driver Registry API

Third-party packages can register custom database drivers using the driver registry API:

```ts
import { registerDriver, type DriverFactory } from "@bunary/orm";
import type { DatabaseConfig, DatabaseDriver } from "@bunary/orm";

// Define your custom driver
class PostgresDriver implements DatabaseDriver {
  query(sql: string, ...params: unknown[]) {
    // Implement query logic
  }
  exec(sql: string, ...params: unknown[]) {
    // Implement exec logic
  }
  close() {
    // Implement close logic
  }
}

// Register the driver factory
const factory: DriverFactory = (config: DatabaseConfig) => {
  return new PostgresDriver(config.postgres!);
};

registerDriver("postgres", factory);

// Now you can use it in your config
setOrmConfig({
  database: {
    type: "postgres",
    postgres: {
      // your postgres config
    }
  }
});
```

Registered drivers take precedence over built-in drivers, allowing you to override default implementations if needed.

## Driver Connection Management

The ORM caches driver instances for connection reuse. `getDriver()` returns the same driver instance when called multiple times with the same configuration, reducing connection overhead.

```ts
import { getDriver, closeDriver, resetDriver } from "@bunary/orm";

// Get driver (cached after first call)
const driver1 = getDriver();
const driver2 = getDriver(); // Returns same instance as driver1

// Explicitly close the cached driver
closeDriver(); // Closes connection and clears cache

// Reset cache without closing (useful for testing)
resetDriver(); // Clears cache, next getDriver() creates new instance
```

The driver cache is automatically invalidated when the configuration changes, ensuring you always get a driver matching the current config.

## Requirements

- Bun ≥ 1.0.0

