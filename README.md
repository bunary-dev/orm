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
