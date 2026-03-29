# Namespace-Based Connection Resolution — Design Spec

**Problem:** `scan.js` line 119 only counts relative-path imports (`.` prefix) as connections. Languages with namespace-based imports (C#, Java) produce imports like `Nenoso.GDW.Core.Editor` that never start with `.`, so every file gets 0 connections and is filtered out by the `connections >= 2` threshold.

**Reported via:** GitHub issue — C# files not scanned despite extractor existing.

---

## Content Guardrails

- No changes to the `connections >= 2` threshold
- No changes to relative-path resolution (JS, Python, CSS, Shell, TypeScript)
- Go and Rust are out of scope — documented as known limitations for follow-up
- The extractor auto-discovery pattern is preserved — no hardcoded language lists in scan.js
- `extractNamespace` is NOT added to `REQUIRED_METHODS` in `extractor-registry.js` — it's optional. scan.js checks `typeof extractor.extractNamespace === 'function'` before calling it. Adding it to REQUIRED_METHODS would break all existing extractors that don't implement it.

---

## Extractor Changes

### New optional method: `extractNamespace(filePath, content)`

Added to C# and Java extractors. Returns a string (the namespace/package) or `null`. scan.js calls it if it exists on the extractor.

**C# (`csharp.js`):**
- Match file-scoped: `namespace Foo.Bar.Baz;`
- Match block-scoped: `namespace Foo.Bar.Baz {`
- Return the namespace string (e.g., `"Foo.Bar.Baz"`)
- If multiple namespace declarations exist (rare in practice), return the first
- Skip if no namespace declaration (some C# files are top-level)

```js
function extractNamespace(filePath, content) {
  // File-scoped: namespace Foo.Bar;
  // Block-scoped: namespace Foo.Bar {
  const match = content.match(/namespace\s+([\w.]+)\s*[;{]/);
  return match ? match[1] : null;
}
```

**Java (`java.js`):**
- Match `package com.foo.bar;`
- Return the package string (e.g., `"com.foo.bar"`)

```js
function extractNamespace(filePath, content) {
  const match = content.match(/package\s+([\w.]+)\s*;/);
  return match ? match[1] : null;
}
```

Both extractors export `extractNamespace` in their module exports alongside the existing methods.

---

## scan.js Changes

### Step 1: Collect namespace declarations

After building `fileData` (after current line 114), build a namespace-to-files map:

```js
// Build namespace → files map for namespace-based languages
const namespaceMap = {};  // { "Foo.Bar": ["src/Foo/Bar/Baz.cs", ...] }
for (const [fileName, data] of Object.entries(fileData)) {
  const ext = path.extname(fileName);
  const extractor = registry.byExtension.get(ext);
  if (extractor && typeof extractor.extractNamespace === 'function') {
    const ns = extractor.extractNamespace(fileName, data.content);
    if (ns) {
      if (!namespaceMap[ns]) namespaceMap[ns] = [];
      namespaceMap[ns].push(fileName);
      // Store namespace on data for later use
      data.namespace = ns;
    }
  }
}
```

### Step 2: Resolve namespace imports

**Placement:** This code goes inside the `for (const [fileName, data] of Object.entries(fileData))` loop that starts at current line 118, after the `for (const imp of localImports)` inner loop closes at line 134, but before the outer loop closes at line 135. Between the two `}` braces.

```js
    // Resolve namespace-based imports (C#, Java, etc.)
    // Each resolved import counts as 1 connection for the importer and 1 for the target.
    // A C# "using Foo.Bar" that resolves to 5 files in that namespace = 5 connections.
    // This is intentional: a file imported by many others IS highly connected.
    // External dependency imports (NuGet, Maven, etc.) won't match any namespace
    // in the project and silently produce 0 connections — correct behavior.
    const nonLocalImports = data.imports.filter(imp => !imp.startsWith('.'));
    for (const imp of nonLocalImports) {
      // Direct namespace match: "using Foo.Bar" → files in namespace "Foo.Bar"
      if (namespaceMap[imp]) {
        for (const target of namespaceMap[imp]) {
          if (target !== fileName) {
            connectionCount[fileName] = (connectionCount[fileName] || 0) + 1;
            connectionCount[target] = (connectionCount[target] || 0) + 1;
          }
        }
        continue;
      }

      // Prefix + type match: "import com.foo.bar.ClassName"
      // Also handles "using static Foo.Bar.ClassName" (C# static imports)
      // Check if last segment matches an export in namespace "com.foo.bar"
      const lastDot = imp.lastIndexOf('.');
      if (lastDot > 0) {
        const nsPrefix = imp.substring(0, lastDot);
        const typeName = imp.substring(lastDot + 1);
        if (namespaceMap[nsPrefix]) {
          for (const target of namespaceMap[nsPrefix]) {
            if (target !== fileName && fileData[target].exports.includes(typeName)) {
              connectionCount[fileName] = (connectionCount[fileName] || 0) + 1;
              connectionCount[target] = (connectionCount[target] || 0) + 1;
            }
      }
    }
  }
}
```

### Connection counting behavior

- **C# `using Foo.Bar;`** → direct match against `namespaceMap["Foo.Bar"]`. Connects the importing file to all files in that namespace. This is correct because C# `using` imports an entire namespace.
- **Java `import com.foo.bar.MyClass;`** → prefix+type match. Connects only to the file in package `com.foo.bar` that exports `MyClass`. More precise because Java imports name specific types.
- **Java `import com.foo.bar.*;`** → the Java extractor's `extractImports` produces `com.foo.bar.*`. The direct match won't hit (no namespace is literally `com.foo.bar.*`), and the prefix match will look for type `*` which won't match any export. **This needs handling:** strip the `.*` suffix and treat as a direct namespace match, same as C#.

### Java wildcard import handling

In the namespace resolution loop, before checking `namespaceMap[imp]`:

```js
// Java wildcard: "com.foo.bar.*" → treat as namespace import
const wildcardImp = imp.endsWith('.*') ? imp.slice(0, -2) : null;
const resolvedImp = wildcardImp || imp;

if (namespaceMap[resolvedImp]) {
  // ... connect to all files in that namespace
}
```

Wait — check if the Java extractor actually produces wildcard imports:

The Java extractor regex is: `/import\s+(?:static\s+)?([\w.]+)\s*;/g`

`[\w.]+` matches word chars and dots. `import com.foo.bar.*;` — the `*` is NOT a word char, so this regex would capture `com.foo.bar` and stop before the `.*`. So wildcard imports are already handled correctly by the extractor — they produce the namespace string without the `.*`.

**No wildcard handling needed in scan.js.**

### Java static imports

`import static com.foo.Bar.methodName;` — the regex captures `com.foo.Bar.methodName`. The prefix+type split gives `nsPrefix = "com.foo.Bar"` (a class, not a package) and `typeName = "methodName"` (a method, not an exported type). Neither will match the namespace map or exports.

**Fix:** In the prefix+type fallback, if the first attempt fails, try one more level up: split `com.foo.Bar.methodName` → check `com.foo` with type `Bar`. This catches the class name as an export. Add this as a second fallback after the initial prefix+type check:

```js
      // Second-level fallback for static imports: "com.foo.Bar.method" → try "com.foo" + "Bar"
      if (lastDot > 0 && !matched) {
        const secondDot = nsPrefix.lastIndexOf('.');
        if (secondDot > 0) {
          const nsPrefix2 = nsPrefix.substring(0, secondDot);
          const typeName2 = nsPrefix.substring(secondDot + 1);
          if (namespaceMap[nsPrefix2]) {
            for (const target of namespaceMap[nsPrefix2]) {
              if (target !== fileName && fileData[target].exports.includes(typeName2)) {
                connectionCount[fileName] = (connectionCount[fileName] || 0) + 1;
                connectionCount[target] = (connectionCount[target] || 0) + 1;
              }
            }
          }
        }
      }
```

---

## Documentation Updates

### hippocampus.md — New section: "Language Connection Patterns"

Add to the hippocampus docs explaining the two connection resolution strategies:

**Relative-path languages** (JS, TS, Python, CSS, Shell): Imports start with `.` or are bare specifiers. scan.js resolves the relative path to a file in the project. This is the original mechanism.

**Namespace-based languages** (C#, Java): Imports are namespace/package strings. scan.js builds a namespace-to-files map from `extractNamespace()` and resolves imports against it. Extractors for namespace-based languages MUST implement `extractNamespace()` or their files will only be mapped if they have a conversational alias.

**Known gaps** (Go, Rust): Go uses directory-based packages — the package name doesn't contain path information, so resolution would need to match package names against directory structures. Rust derives module paths from the file tree and `mod` declarations. Neither is supported yet. When adding extractors for these (or similar languages), implement `extractNamespace()` with the appropriate resolution strategy.

### Extractor development notes

When creating a new extractor, consider:
1. Does this language use relative-path imports? (e.g., `from ./foo import bar`) → works automatically
2. Does this language use namespace/package imports? → implement `extractNamespace()` returning the namespace string
3. Does this language use something else entirely? → may need a new resolution strategy in scan.js

---

## Files Changed

| File | Change |
|------|--------|
| `hippocampus/extractors/csharp.js` | Add `extractNamespace()`, export it |
| `hippocampus/extractors/java.js` | Add `extractNamespace()`, export it |
| `hippocampus/scripts/scan.js` | Build namespace map, resolve namespace imports in connection counting |
| `hippocampus/test/csharp.test.js` | Add `extractNamespace` tests |
| `hippocampus/test/java.test.js` | Add `extractNamespace` tests |
| `hippocampus/test/scan-namespace.test.js` | **New file** — integration test for namespace connection resolution |
| `docs/hippocampus.md` | Add "Language Connection Patterns" section |

---

## Tests

### Unit tests — extractNamespace

**C#:**
- File-scoped namespace: `namespace Foo.Bar;` → `"Foo.Bar"`
- Block-scoped namespace: `namespace Foo.Bar {` → `"Foo.Bar"`
- No namespace → `null`
- Nested namespace (takes first) → first namespace string
- Namespace with semicolon and whitespace variations

**Java:**
- Standard package: `package com.foo.bar;` → `"com.foo.bar"`
- No package declaration → `null`
- Package with leading whitespace

### Integration test — scan namespace resolution

Create a temp directory with:
- `Models/User.cs`: `namespace MyApp.Models; public class User { ... }`
- `Services/UserService.cs`: `namespace MyApp.Services; using MyApp.Models; public class UserService { ... }`
- `Controllers/UserController.cs`: `namespace MyApp.Controllers; using MyApp.Models; using MyApp.Services; public class UserController { ... }`

Verify:
- All 3 files get connections > 0
- `Models/User.cs` gets connections from both other files importing its namespace
- `Controllers/UserController.cs` gets connections from its 2 imports
- All 3 files appear in the final `filesMap` (pass the threshold)
