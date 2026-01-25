# Biome Configuration Notes

## Disabled Rules

The following Biome rules are disabled in `biome.json`:

- `noStaticOnlyClass`: Disabled for `BaseModel` class
- `noThisInStatic`: Disabled for `BaseModel` class

### Rationale

The `BaseModel` class implements an Eloquent-like ORM pattern that requires:

1. **Static-only class with inheritance**: `BaseModel` is an abstract class with only static methods, which subclasses extend (e.g., `class Users extends BaseModel`).

2. **`this` in static methods**: In TypeScript, when a static method is called on a subclass (e.g., `Users.find()`), `this` in the static method refers to the subclass class (`Users`), not the base class (`BaseModel`). This is the correct and required behavior for the Eloquent-like API.

   Example:
   ```typescript
   class Users extends BaseModel {
     protected static tableName = "users";
   }
   
   // When Users.find() is called, 'this' in the static method refers to Users, not BaseModel
   const user = await Users.find(1);
   ```

These rules are disabled only in the ORM package because this is the only package that uses this pattern. Other packages in the monorepo do not disable these rules.

### Alternative Approaches Considered

1. **Refactoring to avoid static methods**: This would require changing the API from `Users.find()` to a factory pattern or instance methods, which would break the Eloquent-like API design.

2. **Using helper functions**: Attempted but still requires `this` in static methods, so it doesn't solve the linting issue.

3. **Using biome-ignore comments**: The project policy is to avoid ignore comments and fix issues properly. However, in this case, the pattern is legitimate and required for the API design, so disabling the rules in the configuration is the appropriate solution.
