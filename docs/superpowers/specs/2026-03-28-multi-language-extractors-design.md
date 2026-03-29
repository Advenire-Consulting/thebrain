# Multi-Language Extractors: C#, Java, Go, Rust

**Date:** 2026-03-28
**Status:** Spec
**Scope:** hippocampus extractors + file-collector skip list

## Goal

Add four new language extractors to the hippocampus so the brain works out of the box with C#, Java, Go, and Rust codebases. No configuration, no addons — they ship with every installation and activate automatically when matching file extensions are found during scans.

## Context

The extractor registry (`hippocampus/lib/extractor-registry.js`) auto-discovers any `.js` file in `hippocampus/extractors/`. Each extractor exports an `extensions` array and five methods: `extractImports`, `extractExports`, `extractRoutes`, `extractIdentifiers`, `extractDefinitions`. No other files need modification to add a new language.

Current extractors: JavaScript, TypeScript, Python, Shell, CSS.

### Return Formats

All five extractor methods must return these shapes:

| Method | Returns | Example |
|--------|---------|---------|
| `extractImports(filePath, content)` | `string[]` | `['./database', '../lib/auth']` |
| `extractExports(filePath, content)` | `string[]` | `['UserService', 'createApp']` |
| `extractRoutes(filePath, content)` | `string[]` | `['GET /api/users', 'POST /api/items']` |
| `extractIdentifiers(line, lineNumber)` | `[{ term: string, line: number }]` | `[{ term: 'myVar', line: 42 }]` |
| `extractDefinitions(content)` | `[{ name: string, type: string, line: number }]` | `[{ name: 'getUser', type: 'method', line: 15 }]` |

Line numbers are 1-indexed. `extractIdentifiers` receives a single line and its line number; all other methods receive the full file content.

### Identifier Pattern Note

All four new extractors use `/[a-zA-Z_]\w*/g` for identifier extraction. The JavaScript extractor uses `/[a-zA-Z_$][\w$]*/g` because `$` is valid in JS identifiers — the new languages do not need `$`.

## Guiding Principle for Skip List

Skip any directory that (a) contains files the user didn't write AND (b) could contain thousands of files that bog down the initial scan. Build output, dependency caches, and IDE metadata all qualify.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `hippocampus/extractors/csharp.js` | Create | C# extractor |
| `hippocampus/extractors/java.js` | Create | Java extractor |
| `hippocampus/extractors/go.js` | Create | Go extractor |
| `hippocampus/extractors/rust.js` | Create | Rust extractor |
| `hippocampus/test/extractors/csharp.test.js` | Create | C# tests |
| `hippocampus/test/extractors/java.test.js` | Create | Java tests |
| `hippocampus/test/extractors/go.test.js` | Create | Go tests |
| `hippocampus/test/extractors/rust.test.js` | Create | Rust tests |
| `hippocampus/lib/file-collector.js` | Edit | Add skip dirs |

Nothing else changes. The registry, term scanner, DIR file format, CC2, signals, prefrontal, hypothalamus, and wrapup are all untouched.

## Skip List Additions

Add to `SKIP_DIRS_EXACT` in `file-collector.js`:

| Directory | Why |
|-----------|-----|
| `bin` | C# build output, also generic compiled output |
| `obj` | C# intermediate build artifacts |
| `target` | Rust Cargo output, Java Maven output |
| `build` | Java Gradle output, Go build cache, generic build dirs |
| `dist` | Generic bundled/compiled output |
| `out` | Generic compiler output (Java, .NET) |
| `vendor` | Go vendored dependencies, PHP Composer |
| `.vs` | Visual Studio IDE metadata |
| `.idea` | JetBrains IDE metadata |
| `.gradle` | Gradle wrapper cache |

**Tradeoff note:** `bin`, `build`, `dist`, and `out` are aggressive skips — they could theoretically be user-created project directories. In practice, these names are overwhelmingly build artifacts across all ecosystems. If a user has a legitimate source directory named `build/`, we may need a future escape hatch (e.g., a `.braininclude` file or per-project config). For now, the scan-time savings justify the default.

## C# Extractor (`csharp.js`)

**Extensions:** `.cs`

### extractImports(filePath, content)

Captures local project references from `using` directives. Skip standard library namespaces (`System`, `Microsoft`).

| Pattern | Example | Captured |
|---------|---------|----------|
| `using Namespace;` | `using MyApp.Services;` | `MyApp.Services` |
| `using static Namespace.Class;` | `using static MyApp.Helpers.Math;` | `MyApp.Helpers.Math` |

Returns deduplicated array of namespace strings.

### extractExports(filePath, content)

Captures public type declarations — the meaningful API surface of a C# file.

| Pattern | Example | Captured |
|---------|---------|----------|
| `public class Name` | `public class UserService` | `UserService` |
| `public static class Name` | `public static class Extensions` | `Extensions` |
| `public abstract class Name` | `public abstract class BaseRepo` | `BaseRepo` |
| `public interface Name` | `public interface IUserRepo` | `IUserRepo` |
| `public struct Name` | `public struct Point` | `Point` |
| `public enum Name` | `public enum Status` | `Status` |
| `public record Name` | `public record UserDto` | `UserDto` |

### extractRoutes(filePath, content)

Captures ASP.NET route definitions from attributes and minimal API patterns.

| Pattern | Example | Captured |
|---------|---------|----------|
| `[HttpGet("path")]` | `[HttpGet("api/users")]` | `GET api/users` |
| `[HttpPost("path")]` | `[HttpPost("api/users")]` | `POST api/users` |
| `[HttpPut("path")]` | `[HttpPut("api/users/{id}")]` | `PUT api/users/{id}` |
| `[HttpDelete("path")]` | `[HttpDelete("api/users/{id}")]` | `DELETE api/users/{id}` |
| `[HttpPatch("path")]` | `[HttpPatch("api/users/{id}")]` | `PATCH api/users/{id}` |
| `[Route("path")]` | `[Route("api/[controller]")]` | `ROUTE api/[controller]` |
| `*.MapGet("path", ...)` | `app.MapGet("/api/items", ...)` | `GET /api/items` |
| `*.MapPost("path", ...)` | `endpoints.MapPost("/api/items", ...)` | `POST /api/items` |

Minimal API pattern: the variable name before `.Map*` varies (`app`, `builder`, `endpoints`, `group`). Match with `/\w+\.Map(Get|Post|Put|Delete|Patch)\(\s*"([^"]+)"/g`.

### extractIdentifiers(line, lineNumber)

Standard word pattern (`/[a-zA-Z_]\w*/g`), minimum 3 characters, filtered against C# keyword set.

**C# keywords to filter:** `abstract`, `as`, `base`, `bool`, `break`, `byte`, `case`, `catch`, `char`, `checked`, `class`, `const`, `continue`, `decimal`, `default`, `delegate`, `do`, `double`, `else`, `enum`, `event`, `explicit`, `extern`, `false`, `finally`, `fixed`, `float`, `for`, `foreach`, `goto`, `if`, `implicit`, `in`, `int`, `interface`, `internal`, `is`, `lock`, `long`, `namespace`, `new`, `null`, `object`, `operator`, `out`, `override`, `params`, `private`, `protected`, `public`, `readonly`, `record`, `ref`, `return`, `sbyte`, `sealed`, `short`, `sizeof`, `stackalloc`, `static`, `string`, `struct`, `switch`, `this`, `throw`, `true`, `try`, `typeof`, `uint`, `ulong`, `unchecked`, `unsafe`, `ushort`, `using`, `var`, `virtual`, `void`, `volatile`, `while`, `async`, `await`, `get`, `set`, `value`, `yield`, `partial`, `where`, `when`, `dynamic`, `nint`, `nuint`

### extractDefinitions(content)

| Pattern | Type | Example |
|---------|------|---------|
| `class Name` | `class` | `public class UserService` |
| `struct Name` | `struct` | `public struct Point` |
| `interface Name` | `interface` | `public interface IRepo` |
| `enum Name` | `enum` | `public enum Status` |
| `record Name` | `record` | `public record UserDto` |
| Method signature | `method` | `public async Task<User> GetById(int id)` |

Method detection strategy: match indented lines containing `(\w+)\s*\(` that are NOT type declarations (class/struct/interface/enum/record) and NOT control flow (if/for/while/switch/catch). Generic return types like `Task<List<User>>` make return-type matching unreliable, so anchor on the method name + `(` pattern instead. Regex hint: `/^\s+.*?(\w+)\s*\(/` on lines that don't match declaration keywords. Accept some false positives — the brain tolerates noise better than missing real methods.

## Java Extractor (`java.js`)

**Extensions:** `.java`

### extractImports(filePath, content)

Captures project-local imports. Skip `java.*`, `javax.*`, `jakarta.*`, `sun.*`, `com.sun.*` standard library namespaces.

| Pattern | Example | Captured |
|---------|---------|----------|
| `import package.Class;` | `import com.myapp.service.UserService;` | `com.myapp.service.UserService` |
| `import static package.Class.method;` | `import static com.myapp.Utils.format;` | `com.myapp.Utils.format` |

### extractExports(filePath, content)

| Pattern | Example | Captured |
|---------|---------|----------|
| `public class Name` | `public class UserService` | `UserService` |
| `public abstract class Name` | `public abstract class BaseRepo` | `BaseRepo` |
| `public interface Name` | `public interface UserRepo` | `UserRepo` |
| `public enum Name` | `public enum Status` | `Status` |
| `public record Name` | `public record UserDto(...)` | `UserDto` |
| `public @interface Name` | `public @interface MyAnnotation` | `MyAnnotation` |

### extractRoutes(filePath, content)

| Pattern | Example | Captured |
|---------|---------|----------|
| `@GetMapping("path")` | `@GetMapping("/api/users")` | `GET /api/users` |
| `@PostMapping("path")` | `@PostMapping("/api/users")` | `POST /api/users` |
| `@PutMapping("path")` | `@PutMapping("/api/users/{id}")` | `PUT /api/users/{id}` |
| `@DeleteMapping("path")` | `@DeleteMapping("/api/users/{id}")` | `DELETE /api/users/{id}` |
| `@PatchMapping("path")` | `@PatchMapping("/api/users/{id}")` | `PATCH /api/users/{id}` |
| `@RequestMapping("path")` | `@RequestMapping("/api")` | `ROUTE /api` |
| `@Path("path")` | `@Path("/api/users")` | `ROUTE /api/users` |

### extractIdentifiers(line, lineNumber)

Standard word pattern, minimum 3 characters, filtered against Java keyword set.

**Java keywords to filter:** `abstract`, `assert`, `boolean`, `break`, `byte`, `case`, `catch`, `char`, `class`, `const`, `continue`, `default`, `do`, `double`, `else`, `enum`, `extends`, `false`, `final`, `finally`, `float`, `for`, `goto`, `if`, `implements`, `import`, `instanceof`, `int`, `interface`, `long`, `native`, `new`, `null`, `package`, `private`, `protected`, `public`, `return`, `short`, `static`, `strictfp`, `super`, `switch`, `synchronized`, `this`, `throw`, `throws`, `transient`, `true`, `try`, `var`, `void`, `volatile`, `while`, `yield`, `record`, `sealed`, `permits`, `String`, `System`, `Override` (last three are common stdlib identifiers included intentionally to reduce term index noise)

### extractDefinitions(content)

| Pattern | Type | Example |
|---------|------|---------|
| `class Name` | `class` | `public class UserService` |
| `interface Name` | `interface` | `public interface UserRepo` |
| `enum Name` | `enum` | `public enum Status` |
| `record Name` | `record` | `public record UserDto(String name)` |
| `@interface Name` | `annotation` | `public @interface Cacheable` |
| Method signature | `method` | `public List<User> findAll()` |

Method detection strategy: same approach as C# — match indented lines containing `(\w+)\s*\(` that are NOT type declarations (class/interface/enum/record/@interface) and NOT control flow. Generic return types (`Map<String, List<Integer>>`, `CompletableFuture<Optional<User>>`) make return-type matching unreliable. Anchor on method name + `(` instead. Constructors (name matches class name) get captured too — this is acceptable noise.

## Go Extractor (`go.js`)

**Extensions:** `.go`

### extractImports(filePath, content)

Go imports are full module paths. Skip standard library (no dots in path, e.g., `"fmt"`, `"net/http"`). Capture imports that look like module paths (contain a dot — e.g., `"github.com/gorilla/mux"`). Also capture relative imports if present.

| Pattern | Example | Captured |
|---------|---------|----------|
| `import "path"` | `import "github.com/gorilla/mux"` | `github.com/gorilla/mux` |
| `import ( "path" )` | Block import with module paths | Each module path |

Heuristic: an import path containing a `.` is likely a third-party or internal module. An import path without a `.` is likely stdlib.

For the brain's purpose (mapping what a file depends on), we capture all non-stdlib imports.

### extractExports(filePath, content)

Go exports are identifiers starting with an uppercase letter at package scope.

| Pattern | Example | Captured |
|---------|---------|----------|
| `func Name(` | `func HandleRequest(w http.ResponseWriter, r *http.Request)` | `HandleRequest` |
| `type Name struct` | `type UserService struct` | `UserService` |
| `type Name interface` | `type Repository interface` | `Repository` |
| `var Name` | `var DefaultConfig = Config{}` | `DefaultConfig` |
| `const Name` | `const MaxRetries = 3` | `MaxRetries` |

Only captures names starting with uppercase (Go's export convention). Ignores methods on types (`func (s *Service) Method()`) for exports — those are captured in definitions. Regex hint for distinguishing: `/^func\s+([A-Z]\w*)\s*\(/` matches package-level functions (no `(` between `func` and the name), while `/^func\s*\([^)]*\)\s*(\w+)\s*\(/` matches methods with receivers.

### extractRoutes(filePath, content)

| Pattern | Example | Captured |
|---------|---------|----------|
| `r.Get("path", ...)` | `r.Get("/api/users", handler)` | `GET /api/users` |
| `r.Post("path", ...)` | `r.Post("/api/users", handler)` | `POST /api/users` |
| `r.Put("path", ...)` | `r.Put("/api/users/{id}", handler)` | `PUT /api/users/{id}` |
| `r.Delete("path", ...)` | `r.Delete("/api/users/{id}", handler)` | `DELETE /api/users/{id}` |
| `r.HandleFunc("path", ...)` | `http.HandleFunc("/api/health", handler)` | `ROUTE /api/health` |
| `r.Handle("path", ...)` | `r.Handle("/api/items", handler)` | `ROUTE /api/items` |

Covers Chi, Gorilla Mux, net/http, and Gin patterns (Gin uses uppercase `.GET`, `.POST` etc. — the regex is case-insensitive on the method name).

### extractIdentifiers(line, lineNumber)

Standard word pattern, minimum 3 characters, filtered against Go keyword set.

**Go keywords to filter:** `break`, `case`, `chan`, `const`, `continue`, `default`, `defer`, `else`, `fallthrough`, `for`, `func`, `go`, `goto`, `if`, `import`, `interface`, `map`, `package`, `range`, `return`, `select`, `struct`, `switch`, `type`, `var`, `nil`, `true`, `false`, `iota`, `bool`, `byte`, `int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8`, `uint16`, `uint32`, `uint64`, `float32`, `float64`, `complex64`, `complex128`, `string`, `error`, `rune`, `uintptr`, `append`, `cap`, `close`, `copy`, `delete`, `len`, `make`, `new`, `panic`, `print`, `println`, `recover`, `any`, `comparable` (includes builtin functions and predeclared types intentionally to reduce term index noise)

### extractDefinitions(content)

| Pattern | Type | Example |
|---------|------|---------|
| `func Name(` | `function` | `func HandleRequest(...)` — regex: `/^func\s+(\w+)\s*\(/` |
| `func (recv) Name(` | `method` | `func (s *Service) GetUser(...)` — regex: `/^func\s*\([^)]*\)\s*(\w+)\s*\(/` |
| `type Name struct` | `struct` | `type UserService struct` |
| `type Name interface` | `interface` | `type Repository interface` |
| `type Name = ...` or `type Name ...` | `type` | `type ID = int64` |
| `const Name` (top-level) | `const` | `const MaxRetries = 3` |
| `var Name` (top-level) | `var` | `var ErrNotFound = errors.New(...)` |

## Rust Extractor (`rust.js`)

**Extensions:** `.rs`

### extractImports(filePath, content)

Captures crate-local and relative module references. Skip `std::`, `core::`, `alloc::` standard library paths.

| Pattern | Example | Captured |
|---------|---------|----------|
| `use crate::path;` | `use crate::services::user;` | `crate::services::user` |
| `use super::path;` | `use super::models::User;` | `super::models::User` |
| `use crate::path::{a, b};` | `use crate::models::{User, Role};` | `crate::models` |
| `mod name;` | `mod services;` | `services` |

### extractExports(filePath, content)

Captures `pub` declarations — Rust's visibility marker for public API.

| Pattern | Example | Captured |
|---------|---------|----------|
| `pub fn name` | `pub fn create_user(...)` | `create_user` |
| `pub struct Name` | `pub struct UserService` | `UserService` |
| `pub enum Name` | `pub enum Status` | `Status` |
| `pub trait Name` | `pub trait Repository` | `Repository` |
| `pub type Name` | `pub type Result<T> = ...` | `Result` |
| `pub mod name` | `pub mod services` | `services` |
| `pub const NAME` | `pub const MAX_RETRIES: u32 = 3` | `MAX_RETRIES` |
| `pub static NAME` | `pub static GLOBAL: Mutex<...>` | `GLOBAL` |

### extractRoutes(filePath, content)

| Pattern | Example | Captured |
|---------|---------|----------|
| `#[get("path")]` | `#[get("/api/users")]` | `GET /api/users` |
| `#[post("path")]` | `#[post("/api/users")]` | `POST /api/users` |
| `#[put("path")]` | `#[put("/api/users/{id}")]` | `PUT /api/users/{id}` |
| `#[delete("path")]` | `#[delete("/api/users/{id}")]` | `DELETE /api/users/{id}` |
| `#[patch("path")]` | `#[patch("/api/users/{id}")]` | `PATCH /api/users/{id}` |
| `.route("path", method(...))` | `.route("/api/items", get(list_items))` | `GET /api/items` |

Covers Actix Web, Rocket, and Axum route patterns. Axum `.route()` regex: `/\.route\(\s*"([^"]+)"\s*,\s*(get|post|put|patch|delete)\s*\(/g` — extracts both the path and HTTP method from the second argument.

### extractIdentifiers(line, lineNumber)

Standard word pattern, minimum 3 characters, filtered against Rust keyword set.

**Rust keywords to filter:** `as`, `async`, `await`, `break`, `const`, `continue`, `crate`, `dyn`, `else`, `enum`, `extern`, `false`, `fn`, `for`, `if`, `impl`, `in`, `let`, `loop`, `match`, `mod`, `move`, `mut`, `pub`, `ref`, `return`, `self`, `Self`, `static`, `struct`, `super`, `trait`, `true`, `type`, `union`, `unsafe`, `use`, `where`, `while`, `yield`, `bool`, `char`, `str`, `i8`, `i16`, `i32`, `i64`, `i128`, `isize`, `u8`, `u16`, `u32`, `u64`, `u128`, `usize`, `f32`, `f64`, `String`, `Vec`, `Option`, `Result`, `Box`, `Some`, `None`, `Ok`, `Err`, `println`, `eprintln`, `format`, `todo`, `unimplemented`, `unreachable`, `assert`, `debug_assert`, `cfg` (includes common stdlib types and macros intentionally to reduce term index noise)

### extractDefinitions(content)

| Pattern | Type | Example |
|---------|------|---------|
| `fn name(` | `function` | `fn create_user(db: &Pool)` |
| `pub fn name(` | `function` | `pub fn create_user(db: &Pool)` |
| `async fn name(` | `async_function` | `async fn fetch_user(...)` |
| `struct Name` | `struct` | `pub struct UserService` |
| `enum Name` | `enum` | `pub enum Status` |
| `trait Name` | `trait` | `pub trait Repository` |
| `impl Name` | `impl` | `impl UserService` |
| `impl Trait for Name` | `impl` | `impl Repository for UserService` |
| `type Name` | `type` | `pub type Result<T> = ...` |
| `mod name` | `mod` | `pub mod services` |
| `const NAME` | `const` | `pub const MAX_RETRIES: u32 = 3` |
| `static NAME` | `static` | `pub static GLOBAL: Mutex<State>` |

## Testing Strategy

Each extractor gets a dedicated test file at `hippocampus/test/extractors/<language>.test.js` following the existing pattern established by `javascript.test.js` and `typescript.test.js`.

Each test file covers:
1. **extensions** — claims the correct file extensions
2. **extractImports** — captures local imports, skips stdlib, deduplicates
3. **extractExports** — captures public API surface
4. **extractRoutes** — captures framework-specific route patterns, returns empty for non-route files
5. **extractIdentifiers** — captures word-like identifiers, skips language keywords, skips short identifiers, includes line numbers
6. **extractDefinitions** — captures all definition types with correct type labels and line numbers

Test snippets use realistic code patterns from each language's major frameworks (ASP.NET, Spring Boot, Chi/Gin, Actix/Axum).

Additionally: run the existing extractor tests after changes to confirm no regressions from the file-collector skip list edit.

## What's NOT Changing

- `extractor-registry.js` — auto-discovers, no edits needed
- `term-scanner.js` — delegates to registry, no edits needed
- `scan.js` — already handles arbitrary extractors
- `dir-loader.js` — reads DIR files, language-agnostic
- `query.js` — all commands work on the indexed data, not raw source
- CC2, signals, prefrontal, hypothalamus, wrapup — all language-agnostic
