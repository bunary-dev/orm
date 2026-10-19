# @bunary/orm

ORM for Bunary - a Bun-first backend framework inspired by Laravel Eloquent.

Features a database abstraction layer that supports multiple database types through a unified API.

## Installation

```bash
bun add @bunary/orm
```

## Quick Start

```typescript
import { Model, setOrmConfig } from "@bunary/orm";

// Configure the ORM with credentials
setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: {
      path: "./database.sqlite"
    }
  }
});

// Models use the configured database automatically
const user = await Model.table("users").find(1);
const users = await Model.table("users").all();
const usersWithColumns = await Model.table("users")
  .select("id", "name", "email")
  .all();
const usersWithoutPassword = await Model.table("users")
  .exclude("password")
  .all();
```

## Architecture

The ORM uses a database abstraction layer:

1. **ORM Connection** - Configure credentials and connection settings
2. **Database Drivers** - Abstraction layer for different database types
3. **Models** - Use the abstraction to query any database type

```
Model → Query Builder → Database Driver → Database
```

## Configuration

The ORM can be configured in two ways:

### Option 1: Using @bunary/core (Optional)

Configure the ORM alongside your app configuration using `@bunary/core`:

```typescript
import { createConfig, defineConfig } from "@bunary/core";

// Create a config store
const configStore = createConfig(
  defineConfig({
    app: {
      name: "MyApp",
      env: "development",
    },
    orm: {
      database: {
        type: "sqlite",
        sqlite: {
          path: "./database.sqlite"
        }
      }
    }
  })
);

// Make config store available globally for ORM to access
globalThis.__bunaryCoreConfigStore = configStore;
```

The ORM will automatically read its configuration from `@bunary/core` when a config store is available and no explicit config is set.

**Note:** `@bunary/core` is an optional peer dependency. Install it only if you want to use the integrated configuration approach.

### Option 2: Using setOrmConfig()

You can also configure the ORM directly using `setOrmConfig()`:

```typescript
import { setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: {
      path: "./database.sqlite"  // Path to SQLite database file
    }
  }
});
```

**Note:** `setOrmConfig()` will override any configuration from `@bunary/core`.

### SQLite

```typescript
// Using @bunary/core
defineConfig({
  orm: {
    database: {
      type: "sqlite",
      sqlite: {
        path: "./database.sqlite"
      }
    }
  }
});

// Or using setOrmConfig()
setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: {
      path: "./database.sqlite"
    }
  }
});
```

### MySQL / PostgreSQL (Not Supported)

Only SQLite is built in. `defineOrmConfig()`, `setOrmConfig()` and `createDriver()` reject `type: "mysql"` (and `"postgres"`) with:

```
Database type "mysql" is not supported. Only SQLite is built in (MySQL and PostgreSQL are not implemented). Register a custom driver using registerDriver() for other types.
```

To use another database, register your own driver with `registerDriver("mysql", factory)`.

### SQLite (MVP)

SQLite is fully supported and uses Bun's native `bun:sqlite` module.

### MySQL and PostgreSQL

Not implemented. Use `registerDriver()` to supply a driver.

### Custom Drivers (Third-Party Registry)

Third-party packages can register custom database drivers using the driver registry API:

```typescript
import { registerDriver, createDriver, type DriverFactory } from "@bunary/orm";
import type { DatabaseConfig, DatabaseDriver } from "@bunary/orm";

// Define your custom driver
class PostgresDriver implements DatabaseDriver {
  // ... implement DatabaseDriver interface
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

**Note:** Registered drivers take precedence over built-in drivers, allowing you to override default implementations if needed.

### Transactions

The ORM supports database transactions for atomic operations:

```typescript
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

### Schema Builder (Migrations)

The ORM provides a schema builder for creating and altering tables (SQLite):

```typescript
import { Schema, setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: { path: "./database.sqlite" }
  }
});

// Create a table with UUID primary key
Schema.createTable("users", (table) => {
  table.uuid("id").primary(); // UUID primary key (defaults to "id")
  table.string("name", 255).notNull();
  table.string("email", 255).unique().notNull();
  table.boolean("active").default(true);
  table.timestamp("deleted_at").nullable();
  table.timestamps();
});

// Or use integer primary key
Schema.createTable("posts", (table) => {
  table.increments("id"); // Integer primary key
  table.text("title").notNull();
});

// Check if table/column exists
if (!Schema.hasTable("users")) {
  Schema.createTable("users", (table) => { /* ... */ });
}
if (!Schema.hasColumn("users", "phone")) {
  Schema.table("users", (table) => {
    table.string("phone", 20).nullable();
  });
}

// Rename a table
Schema.renameTable("users", "accounts");

// Drop a table
Schema.dropTable("users");
```

**Schema methods:** `createTable(name, callback)`, `dropTable(name)`, `table(name, callback)` (alter), `hasTable(name)`, `hasColumn(table, column)`, `renameTable(oldName, newName)`.

**Column types:** `increments("id")`, `integer("col")`, `text("col")`, `string("col", length?)`, `boolean("col")`, `timestamp("col")`, `uuid("id"?)`, `foreignId("col")`, `timestamps()`.

**Column modifiers:** `.nullable()`, `.notNull()`, `.default(value)`, `.unique()`, `.primary()`.

**Constraints:** `unique(["a", "b"])`, `index(["a", "b"])`, `foreign("col").references("table", "column")`, `foreignId("col").references("table", "column")`.

### Migrations Repository

Track which migrations have been applied using `MigrationsRepository`. It ensures a `migrations` table exists, records applied migrations by name and batch, and supports listing and rollback.

```typescript
import { MigrationsRepository, setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: { path: "./database.sqlite" }
  }
});

const repo = new MigrationsRepository();
repo.ensureTable(); // Create migrations table if missing (idempotent)

// Run a migration, then log it
// ... execute migration SQL ...
repo.log("20260101000000_create_users", repo.getNextBatchNumber());

// List applied migrations (ordered by id)
const applied = repo.listApplied();

// Rollback: delete one migration record or a whole batch
repo.deleteLog("20260101000000_create_users");
repo.deleteBatch(2); // Remove all migrations in batch 2
```

**API:** `ensureTable()`, `log(name, batch)`, `listApplied()`, `getNextBatchNumber()`, `getLastBatch()`, `deleteLog(name)`, `deleteBatch(batch)`.

### Migrator Runner

Run and rollback migrations using the `createMigrator()` API. Discovers migration files, runs pending migrations in order, and supports rollback. Uses transactions for safety.

```typescript
import { createMigrator, setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: { path: "./database.sqlite" }
  }
});

const migrator = createMigrator({ migrationsPath: "./database/migrations" });

// Check status
const status = await migrator.status();
console.log("Ran:", status.ran);
console.log("Pending:", status.pending);

// Run all pending migrations
await migrator.up();

// Rollback last batch
await migrator.down();

// Rollback multiple batches
await migrator.down({ steps: 2 });
```

**Migration file format:** Each migration file must export `up()` and `down()` functions. Use the Schema Builder for type-safe table definitions:

```typescript
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

**Complete migration workflow example:**

```typescript
import { createMigrator, Schema, setOrmConfig } from "@bunary/orm";

setOrmConfig({
  database: {
    type: "sqlite",
    sqlite: { path: "./database.sqlite" }
  }
});

// Create migrator instance
const migrator = createMigrator({ migrationsPath: "./database/migrations" });

// Check migration status
const status = await migrator.status();
console.log(`Ran: ${status.ran.length}, Pending: ${status.pending.length}`);

// Run all pending migrations
await migrator.up();

// Rollback last batch if needed
await migrator.down();
```

**API:** `createMigrator(options?)`, `migrator.status()`, `migrator.up()`, `migrator.down({ steps? })`. Migrations run in transactions - if any migration fails, all changes are rolled back.

## Advanced Usage

### Direct Driver Access

For advanced use cases, you can access the driver directly:

```typescript
import { getDriver } from "@bunary/orm";

const driver = getDriver();
const result = driver.query("SELECT * FROM users WHERE id = ?", 1);
const user = result.get();
```

### Driver Connection Management

The ORM caches driver instances for connection reuse. `getDriver()` returns the same driver instance when called multiple times with the same configuration, reducing connection overhead.

```typescript
import { getDriver, closeDriver, resetDriver } from "@bunary/orm";

// Get driver (cached after first call)
const driver1 = getDriver();
const driver2 = getDriver(); // Returns same instance as driver1

// Explicitly close the cached driver
closeDriver(); // Closes connection and clears cache

// Reset cache without closing (useful for testing)
resetDriver(); // Clears cache, next getDriver() creates new instance
```

**Note:** The driver cache is automatically invalidated when the configuration changes, ensuring you always get a driver matching the current config.

## Requirements

- Bun ≥ 1.4.0

## License

MIT
