# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
