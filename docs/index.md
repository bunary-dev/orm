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

DDL for creating and altering tables (SQLite). Use in migration files for type-safe schema definitions.

### Creating Tables

```ts
import { Schema, setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: { path: "./database.sqlite" },
  },
});

// Create a table with UUID primary key
Schema.createTable("users", (table) => {
  table.uuid("id").primary();
  table.string("name", 255).notNull();
  table.string("email", 255).unique().notNull();
  table.boolean("active").default(true);
  table.timestamp("deleted_at").nullable();
  table.timestamps();
});

// Create table with integer primary key
Schema.createTable("posts", (table) => {
  table.increments("id");
  table.string("title", 255).notNull();
  table.text("content").nullable();
  table.foreignId("user_id").references("users", "id");
  table.timestamps();
});
```

### Altering Tables

```ts
// Add columns to existing table
Schema.table("users", (table) => {
  table.string("phone", 20).nullable();
  table.string("address", 255).nullable();
});

// Check before altering
if (!Schema.hasColumn("users", "phone")) {
  Schema.table("users", (table) => {
    table.string("phone", 20).nullable();
  });
}
```

### Table Management

```ts
// Check if table exists
if (!Schema.hasTable("users")) {
  Schema.createTable("users", (table) => {
    // ...
  });
}

// Rename table
Schema.renameTable("users", "accounts");

// Drop table
Schema.dropTable("users");
```

### Column Types

- `increments("id")` - Auto-incrementing integer primary key
- `integer("col")` - Integer column
- `text("col")` - Text column
- `string("col", length?)` - String column (alias for text)
- `boolean("col")` - Boolean (stored as INTEGER in SQLite)
- `timestamp("col")` - Timestamp (stored as TEXT)
- `uuid("id"?)` - UUID column (defaults to "id")
- `foreignId("col")` - Foreign key column (INTEGER, NOT NULL)
- `timestamps()` - Adds `createdAt` and `updatedAt` columns

### Column Modifiers

Chain modifiers on column types:

```ts
table.string("email", 255)
  .unique()        // Add UNIQUE constraint
  .notNull()       // Make NOT NULL
  .default("");    // Set default value

table.integer("age")
  .nullable()      // Make nullable
  .default(0);    // Set default

table.uuid("id")
  .primary();      // Set as primary key
```

### Constraints

```ts
// Composite unique constraint
table.unique(["email", "username"]);

// Index
table.index("email");
table.index(["user_id", "created_at"]);

// Foreign key
table.foreign("user_id").references("users", "id");
// Or shorthand:
table.foreignId("user_id").references("users", "id");
```

Schema methods: `createTable()`, `dropTable()`, `table()` (alter), `hasTable()`, `hasColumn()`, `renameTable()`.

## UUID Primary Keys

UUID-first approach with auto-generation using `Bun.randomUUIDv7()`:

```ts
class Users extends BaseModel {
  protected static tableName = "users";
  protected static primaryKeyType: "uuid" | "integer" = "uuid"; // Default
  protected static primaryKeyName = "id"; // Default
}

// Create record (UUID auto-generated)
const user = await Users.create({ name: "John", email: "john@example.com" });

// Migration
Schema.createTable("users", (table) => {
  table.uuid("id").primary();
  table.string("name", 255).notNull();
});
```

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
import { createMigrator, Schema, setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: { path: "./database.sqlite" },
  },
});

const migrator = createMigrator({ migrationsPath: "./database/migrations" });

// Check status
const status = await migrator.status();
console.log(`Ran: ${status.ran.length}, Pending: ${status.pending.length}`);

// Run all pending migrations
await migrator.up();

// Rollback last batch
await migrator.down();

// Rollback multiple batches
await migrator.down({ steps: 2 });
```

### Migration File Format

Migration files export `up()` and `down()` functions. Use Schema Builder for type-safe table definitions:

```ts
// database/migrations/20260101000000_create_users.ts
import { Schema } from "@bunary/orm";

export async function up() {
  Schema.createTable("users", (table) => {
    table.uuid("id").primary();
    table.string("name", 255).notNull();
    table.string("email", 255).unique().notNull();
    table.boolean("active").default(true);
    table.timestamps();
  });

  Schema.createTable("posts", (table) => {
    table.uuid("id").primary();
    table.foreignId("user_id").references("users", "id");
    table.string("title", 255).notNull();
    table.text("content").nullable();
    table.timestamps();
  });
}

export async function down() {
  Schema.dropTable("posts");
  Schema.dropTable("users");
}
```

### Complete Migration Workflow

```ts
import { createMigrator, Schema, setOrmConfig } from "@bunary/orm";

// 1. Configure database
setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: { path: "./database.sqlite" },
  },
});

// 2. Create migrator
const migrator = createMigrator({ migrationsPath: "./database/migrations" });

// 3. Check status
const status = await migrator.status();
if (status.pending.length > 0) {
  console.log(`Running ${status.pending.length} pending migrations...`);
  
  // 4. Run migrations
  await migrator.up();
  
  console.log("Migrations completed!");
} else {
  console.log("No pending migrations");
}

// 5. Rollback if needed
// await migrator.down(); // Rollback last batch
```

API: `createMigrator(options?)`, `migrator.status()`, `migrator.up()`, `migrator.down({ steps? })`.

## Requirements

- Bun ≥ 1.0.0

