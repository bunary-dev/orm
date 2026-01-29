# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.13] - 2026-01-29

### Added

- **UUID-First Primary Key Support** - UUID v7 primary keys with auto-generation
  - `BaseModel.create(data)` - Create records with auto-generated UUID v7 (using `Bun.randomUUIDv7()`)
  - `primaryKeyType: "uuid" | "integer"` - Configure primary key type (defaults to "uuid")
  - `primaryKeyName` - Configure primary key column name (defaults to "id")
  - `BaseModel.find()` - Now respects custom primary key names
  - `Schema.uuid(name?)` - Create UUID column in migrations (defaults to "id")
  - UUIDs stored as TEXT in SQLite
  - Backward compatible - models can still use integer primary keys
  - Full test coverage (6 UUID tests, 2 Schema uuid tests)

## [0.0.12] - 2026-01-29

### Added

- **Enhanced Schema Builder** - Complete migrations system with full column types and modifiers
  - `Schema.hasTable(name)` - Check if table exists
  - `Schema.hasColumn(table, column)` - Check if column exists
  - `Schema.renameTable(oldName, newName)` - Rename a table
  - New column types: `string(name, length?)`, `timestamp(name)`, `foreignId(name)`
  - Column modifiers: `.nullable()`, `.notNull()`, `.default(value)`, `.primary()`
  - Foreign key constraints: `foreign("col").references("table", "column")`, `foreignId("col").references("table", "column")`
  - Enhanced `integer()`, `text()`, `boolean()` to return `ColumnBuilder` with modifiers
  - Full test coverage (20 tests total for Schema Builder)

## [0.0.11] - 2026-01-29

### Added

- **Migrator runner** - Discover and run migrations with rollback support
  - `createMigrator(options?)` - Create migrator instance with optional migrations path
  - `migrator.status()` - Get status (ran vs pending migrations)
  - `migrator.up()` - Run all pending migrations in order (uses transactions)
  - `migrator.down({ steps? })` - Rollback last batch or N batches (reverse order)
  - Discovers migration files from directory (`.ts` files)
  - Migration modules export `up()` and `down()` async functions
  - Uses transactions - failed migrations rollback all changes
  - Skips already-applied migrations automatically
  - Rollback runs `down()` in reverse order for each batch
  - Full test coverage (11 tests)

## [0.0.10] - 2026-01-29

### Added

- **Migrations repository** - Track applied migrations and support rollback
  - `MigrationsRepository` - Ensures `migrations` table, logs applied migrations by name and batch
  - `ensureTable()` - Create migrations table if missing (idempotent)
  - `log(name, batch)` - Record an applied migration
  - `listApplied()` - List all applied migrations ordered by id
  - `getNextBatchNumber()` - Next batch number (max(batch)+1 or 1)
  - `getLastBatch()` - Migrations in the last batch
  - `deleteLog(name)` - Remove one migration record (rollback single)
  - `deleteBatch(batch)` - Remove all records in a batch (rollback batch)
  - `MigrationRecord` type exported
  - SQLite-compatible; uses configured driver

## [0.0.9] - 2026-01-29

### Added

- **Schema builder (SQLite)** - DDL for migrations
  - `Schema.createTable(name, (table) => { ... })` - create table with fluent TableBuilder
  - `Schema.dropTable(name)` - drop table if exists
  - `Schema.table(name, (table) => { ... })` - alter table (add columns)
  - TableBuilder: `increments("id")`, `integer()`, `text()`, `boolean()`, `timestamps()`, `unique()`, `index()`
  - SQLite implementation emits and executes SQL via the configured driver
  - Tests cover create/drop/alter, column types, unique, and index

## [0.0.8] - 2026-01-29

### Added

- **Transaction Support** - Database transactions for atomic operations
  - `transaction(fn)` method on `DatabaseDriver` interface
  - Automatic commit on success, rollback on error
  - Support for both async and sync transaction callbacks
  - Nested transactions via SQLite savepoints
  - Implemented in `SqliteDriver` with full test coverage (8 tests)
  - Essential for safe migrations and multi-step operations

### Changed

- `DatabaseDriver` interface now includes `transaction()` method
- All drivers must implement transaction support

## [0.0.7] - 2026-01-29

### Fixed

- **Driver Connection Reuse** - `getDriver()` now caches and reuses driver instances
  - Repeated calls to `getDriver()` return the same driver instance for the same config
  - Reduces connection overhead and enables transaction coordination
  - Cache automatically invalidates when configuration changes
  - Added `closeDriver()` to explicitly close the cached driver connection
  - Added `resetDriver()` to clear cache without closing (useful for testing)

### Changed

- `getDriver()` now caches driver instances based on configuration hash
- Driver cache is automatically cleared when `setOrmConfig()` is called with different config

## [0.0.6] - 2026-01-29

### Added

- **Driver Registry API** - Extension point for third-party database providers
  - `registerDriver(type, factory)` - Register custom database driver factories
  - `DriverFactory` type - Type definition for driver factory functions
  - `clearDriverRegistry()` - Clear all registered drivers (useful for testing)
  - Registered drivers take precedence over built-in drivers
  - Allows third-party packages to add support for additional database types (e.g., PostgreSQL, Supabase) without modifying core code
  - Example: `registerDriver("postgres", (config) => new PostgresDriver(config.postgres!))`

### Changed

- `createDriver()` now checks the driver registry before falling back to built-in drivers
- Improved error message for unsupported database types to suggest using `registerDriver()`

## [0.0.2] - 2026-01-26

### Added

- **BaseModel class** - Eloquent-like model base class for creating model classes
  - Automatic exclusion of protected fields (similar to Laravel's `$guarded`)
  - Automatic exclusion of timestamp fields (`createdAt`, `updatedAt` by default)
  - All query builder methods available as static methods on model classes
  - Example: `class Users extends BaseModel { protected static tableName = "users"; }`
  - Usage: `await Users.find(1)`, `await Users.all()`, `await Users.where(...).first()`
- **Additional Query Builder Methods**:
  - `where(column, operatorOrValue, value?)` - Filter results with conditions
  - `limit(count)` - Limit the number of results
  - `offset(count)` - Skip records (pagination)
  - `orderBy(column, direction?)` - Order results by column
  - `first()` - Get the first matching record
  - `count()` - Count matching records

### Changed

- Improved test coverage for Model API (138 tests total)
- Enhanced documentation with BaseModel examples
- Fixed error message to use `modelClass.name` instead of `modelClass.constructor.name` for correct class name display

## [0.0.1] - 2026-01-26

### Added

- Initial release of `@bunary/orm`
- **Database Abstraction Layer** - Unified API for multiple database types
- **Database Drivers**:
  - `SqliteDriver` - Full SQLite support using Bun's native `bun:sqlite`
  - `MysqlDriver` - Structure ready for MySQL implementation
- **Connection Management**:
  - `createDriver()` - Create database driver from configuration
  - `getDriver()` - Get driver from global configuration
- **Model API** (Eloquent-like):
  - `Model.table()` - Start a query for a specific table
  - `find(id)` - Find a record by ID
  - `all()` - Get all records from a table
  - `select(...columns)` - Select specific columns from results
  - `exclude(...columns)` - Exclude specific columns from results
- **Query Builder** - Chainable query interface using database abstraction
- **Configuration**:
  - `setOrmConfig()` - Set global ORM configuration with credentials
  - `defineOrmConfig()` - Type-safe configuration helper
  - Support for SQLite and MySQL (structure) configuration
- Full TypeScript support with exported types
- Comprehensive test suite (26 tests, 100% passing):
  - Model tests (13 tests)
  - Driver abstraction tests (7 tests)
  - Connection manager tests (6 tests)

### Architecture

The ORM follows this flow:
```
ORM Connection (credentials) → Database Driver (abstraction) → Models → Database
```

This architecture allows:
- Easy addition of new database types (MySQL, PostgreSQL)
- Unified API regardless of database backend
- Type-safe configuration with credentials

### Technical

- Bun ≥1.0.0 required
- ESM only (`"type": "module"`)
- TypeScript strict mode
- Biome for linting
- Uses Bun's native `bun:sqlite` module
- Database abstraction layer for extensibility
