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

## Transactions

Database transactions for atomic operations:

```ts
import { getDriver } from "@bunary/orm";

const driver = getDriver();

// Execute operations in a transaction
await driver.transaction(async (tx) => {
  tx.exec("INSERT INTO users (name) VALUES (?)", "Alice");
  tx.exec("INSERT INTO users (name) VALUES (?)", "Bob");
  // If any operation fails, all changes are rolled back
});

// Transactions automatically commit on success or rollback on error
try {
  await driver.transaction(async (tx) => {
    tx.exec("INSERT INTO users (name) VALUES (?)", "Alice");
    throw new Error("Something went wrong");
    // This will automatically rollback
  });
} catch (error) {
  // Transaction was rolled back
}

// Nested transactions use savepoints
await driver.transaction(async (tx) => {
  tx.exec("INSERT INTO users (name) VALUES (?)", "Alice");
  
  await tx.transaction(async (tx2) => {
    tx2.exec("INSERT INTO users (name) VALUES (?)", "Bob");
    // Nested transaction (savepoint)
  });
  
  // Both commits if successful, or both rollback on error
});
```

## Schema Builder (Migrations)

DDL for creating and altering tables (SQLite):

```ts
import { Schema, setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: { path: "./database.sqlite" },
  },
});

// Create a table
Schema.createTable("users", (table) => {
  table.increments("id");
  table.text("name");
  table.text("email").unique();
  table.boolean("active");
  table.timestamps();
});

// Alter a table (add columns)
Schema.table("users", (table) => {
  table.text("phone");
});

// Drop a table
Schema.dropTable("users");
```

TableBuilder: `increments("id")`, `integer()`, `text()`, `boolean()`, `timestamps()`, `unique()`, `index()`.

## Migrations Repository

Track which migrations have been applied. Ensures a `migrations` table, records applied migrations by name and batch, and supports listing and rollback.

```ts
import { MigrationsRepository, setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: { path: "./database.sqlite" },
  },
});

const repo = new MigrationsRepository();
repo.ensureTable();

repo.log("20260101000000_create_users", repo.getNextBatchNumber());
const applied = repo.listApplied();

repo.deleteLog("20260101000000_create_users");
repo.deleteBatch(2);
```

API: `ensureTable()`, `log(name, batch)`, `listApplied()`, `getNextBatchNumber()`, `getLastBatch()`, `deleteLog(name)`, `deleteBatch(batch)`.

## Migrator Runner

Run and rollback migrations. Discovers migration files, runs pending migrations in order, and supports rollback. Uses transactions for safety.

```ts
import { createMigrator, setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: { path: "./database.sqlite" },
  },
});

const migrator = createMigrator({ migrationsPath: "./database/migrations" });

const status = await migrator.status();
await migrator.up();
await migrator.down();
await migrator.down({ steps: 2 });
```

Migration files export `up()` and `down()`:

```ts
import { getDriver } from "@bunary/orm";

export async function up() {
  const driver = getDriver();
  driver.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
}

export async function down() {
  const driver = getDriver();
  driver.exec("DROP TABLE users");
}
```

API: `createMigrator(options?)`, `migrator.status()`, `migrator.up()`, `migrator.down({ steps? })`.

## Requirements

- Bun ≥ 1.0.0

