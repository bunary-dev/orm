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

Configure the ORM using `setOrmConfig()` with credentials:

### SQLite

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

### MySQL (Coming Soon)

```typescript
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

## Advanced Usage

### Direct Driver Access

For advanced use cases, you can access the driver directly:

```typescript
import { getDriver } from "@bunary/orm";

const driver = getDriver();
const result = driver.query("SELECT * FROM users WHERE id = ?", 1);
const user = result.get();
```

## Requirements

- Bun ≥ 1.0.0

## License

MIT
