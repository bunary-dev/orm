# @bunary/orm

ORM for Bunary - a Bun-first backend framework inspired by Laravel Eloquent.

Features a database abstraction layer that supports multiple database types through a unified API.

## Documentation

Canonical documentation for this package lives in [`docs/index.md`](./docs/index.md).

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
const users = await Model.table("users")
  .select("id", "name", "email")
  .all();
const users = await Model.table("users")
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

### Option 1: Using @bunary/core (Recommended)

Configure the ORM alongside your app configuration using `@bunary/core`:

```typescript
import { defineConfig } from "@bunary/core";

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
});
```

The ORM will automatically read its configuration from `@bunary/core` when no explicit config is set.

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

### MySQL (Coming Soon)

```typescript
// Using @bunary/core
defineConfig({
  orm: {
    database: {
      type: "mysql",
      mysql: {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "mydb"
      }
    }
  }
});

// Or using setOrmConfig()
setOrmConfig({
  database: {
    type: "mysql",
    mysql: {
      host: "localhost",
      port: 3306,
      user: "root",
      password: "password",
      database: "mydb"
    }
  }
});
```

## API

### Eloquent-like Models with `BaseModel`

For an Eloquent-like experience, extend `BaseModel` to create model classes:

```typescript
import { BaseModel } from "@bunary/orm";

class Users extends BaseModel {
  protected static tableName = "users";
  protected static protected = ["password", "secret_key"]; // Auto-excluded fields
  protected static timestamps = true; // Auto-exclude createdAt, updatedAt
}

// Use it like Laravel Eloquent:
const users = await Users.all(); // password and timestamps automatically excluded
const user = await Users.find(1);
const user = await Users.where("email", "john@example.com").first();
const count = await Users.count();
```

#### BaseModel Features

- **Automatic field exclusion**: Define `protected static protected = ["password"]` to automatically exclude sensitive fields
- **Timestamp management**: Set `protected static timestamps = true` to exclude `createdAt` and `updatedAt`, or provide a custom array
- **All query builder methods**: Available as static methods on your model class

#### BaseModel Configuration

```typescript
class Users extends BaseModel {
  // Required: Table name
  protected static tableName = "users";
  
  // Optional: Fields to automatically exclude from all queries
  protected static protected = ["password", "secret_key"];
  
  // Optional: Timestamp fields to exclude
  // - true: Exclude createdAt, updatedAt (default)
  // - false: Don't exclude timestamps
  // - ["createdAt"]: Exclude only createdAt
  protected static timestamps = true;
}
```

### `Model.table(tableName)`

Start a query for a specific table. Returns a `QueryBuilder` instance.

```typescript
const query = Model.table("users");
```

### Query Builder Methods

#### `find(id: string | number)`

Find a record by its ID.

```typescript
const user = await Model.table("users").find(1);
// Returns: { id: 1, name: "John", email: "john@example.com", ... } or null
```

#### `all()`

Get all records from the table.

```typescript
const users = await Model.table("users").all();
// Returns: [{ id: 1, name: "John", ... }, { id: 2, name: "Jane", ... }, ...]
```

#### `select(...columns: string[])`

Select specific columns from the results.

```typescript
const users = await Model.table("users")
  .select("id", "name", "email")
  .all();
// Returns only id, name, and email columns
```

#### `exclude(...columns: string[])`

Exclude specific columns from the results.

```typescript
const users = await Model.table("users")
  .exclude("password", "secret_key")
  .all();
// Returns all columns except password and secret_key
```

#### `where(column: string, operatorOrValue: string | number | boolean, value?: string | number | boolean)`

Add a where condition to filter results.

```typescript
// Simple equality (default operator is '=')
const users = await Model.table("users")
  .where("age", 25)
  .all();

// With explicit operator
const users = await Model.table("users")
  .where("age", ">", 18)
  .all();
```

#### `limit(count: number)`

Limit the number of results returned.

```typescript
const users = await Model.table("users")
  .limit(10)
  .all();
```

#### `offset(count: number)`

Skip a number of records (useful for pagination).

```typescript
const users = await Model.table("users")
  .limit(10)
  .offset(20) // Skip first 20 records
  .all();
```

#### `orderBy(column: string, direction?: "asc" | "desc")`

Order results by a column.

```typescript
const users = await Model.table("users")
  .orderBy("name", "asc")
  .all();

// Default direction is 'asc'
const users = await Model.table("users")
  .orderBy("created_at")
  .all();
```

#### `first()`

Get the first record matching the query.

```typescript
const user = await Model.table("users")
  .where("email", "john@example.com")
  .first();
// Returns: { id: 1, name: "John", ... } or null
```

#### `count()`

Count the number of records matching the query.

```typescript
const total = await Model.table("users").count();
const activeUsers = await Model.table("users")
  .where("active", true)
  .count();
```

### Method Chaining

All query builder methods are chainable:

```typescript
// Chain select with find
const user = await Model.table("users")
  .select("id", "name")
  .find(1);

// Chain exclude with all
const users = await Model.table("users")
  .exclude("password")
  .all();

// When both select() and exclude() are used, select() takes precedence
const users = await Model.table("users")
  .select("id", "name")
  .exclude("password")  // This is ignored since select() is used
  .all();
```

## Database Drivers

The ORM uses a driver abstraction layer, making it easy to add new database types.

### SQLite (MVP)

SQLite is fully supported and uses Bun's native `bun:sqlite` module.

### MySQL (Structure Ready)

The MySQL driver structure is in place. To implement:

1. Add MySQL client library (e.g., `mysql2`)
2. Implement `MysqlDriver` in `src/drivers/mysql-driver.ts`
3. Update `createDriver()` in `src/connection.ts`

### PostgreSQL (Planned)

PostgreSQL support will follow the same pattern as MySQL.

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

**TableBuilder methods:** `increments("id")`, `integer("col")`, `text("col")`, `boolean("col")`, `timestamps()`, `unique("col")` / `unique(["a", "b"])`, `index("col")` / `index(["a", "b"])`. Use `text("col").unique()` for a unique text column.

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

- Bun ≥ 1.0.0

## License

MIT
