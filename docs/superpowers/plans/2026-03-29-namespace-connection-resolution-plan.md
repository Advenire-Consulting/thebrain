# Namespace-Based Connection Resolution — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix hippocampus scanner so C# and Java files get connection counts via namespace-based import resolution, instead of being silently filtered out.

**Architecture:** Add optional `extractNamespace()` method to C# and Java extractors. In `scan.js`, after building `fileData`, build a namespace-to-files reverse index. Then resolve non-local imports against it during connection counting. No changes to the `connections >= 2` threshold or relative-path resolution.

**Tech Stack:** Node.js, `node:test` runner, `assert/strict`

**Spec:** `docs/superpowers/specs/2026-03-29-namespace-connection-resolution-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `hippocampus/extractors/csharp.js` | Modify | Add `extractNamespace()`, export it |
| `hippocampus/extractors/java.js` | Modify | Add `extractNamespace()`, export it |
| `hippocampus/scripts/scan.js` | Modify | Build namespace map, resolve namespace imports in connection counting |
| `hippocampus/test/extractors/csharp.test.js` | Modify | Add extractNamespace unit tests to existing C# extractor tests |
| `hippocampus/test/extractors/java.test.js` | Modify | Add extractNamespace unit tests to existing Java extractor tests |
| `hippocampus/test/scan-namespace.test.js` | Create | Integration test — C# project with namespace imports gets connections |
| `docs/hippocampus.md` | Modify | Add "Language Connection Patterns" section |

---

## Chunk 1: Extractors + Unit Tests

### Task 1: C# extractNamespace — test and implement

**Files:**
- Modify: `hippocampus/test/extractors/csharp.test.js` (add extractNamespace describe block)
- Modify: `hippocampus/extractors/csharp.js:137-144`

- [ ] **Step 1: Write failing tests for extractNamespace**

Append the following `describe` block inside the existing `describe('csharp extractor', () => {` block in `hippocampus/test/extractors/csharp.test.js`, after the closing `});` of `describe('extractDefinitions')` (before the final `});`):

```js
  describe('extractNamespace', () => {
    it('extracts file-scoped namespace', () => {
      const content = 'namespace MyApp.Models;\npublic class User {}';
      assert.equal(ext.extractNamespace('User.cs', content), 'MyApp.Models');
    });

    it('extracts block-scoped namespace', () => {
      const content = 'namespace MyApp.Models {\n  public class User {}\n}';
      assert.equal(ext.extractNamespace('User.cs', content), 'MyApp.Models');
    });

    it('returns null when no namespace', () => {
      const content = 'public class Program { static void Main() {} }';
      assert.equal(ext.extractNamespace('Program.cs', content), null);
    });

    it('returns first namespace when multiple exist', () => {
      const content = 'namespace First.One;\nnamespace Second.Two;';
      assert.equal(ext.extractNamespace('Multi.cs', content), 'First.One');
    });

    it('handles whitespace variations', () => {
      const content = 'namespace   MyApp.Services  ;';
      assert.equal(ext.extractNamespace('Svc.cs', content), 'MyApp.Services');
    });
  });
```

- [ ] **Step 2: Run tests — verify extractNamespace tests fail**

Run: `node --test hippocampus/test/extractors/csharp.test.js`
Expected: `extractNamespace` tests FAIL (`ext.extractNamespace is not a function`), all other tests PASS.

- [ ] **Step 3: Implement extractNamespace in csharp.js**

Add this function before the `module.exports` block in `hippocampus/extractors/csharp.js` (before line 137):

```js
// Extract the namespace declaration from a C# file
function extractNamespace(filePath, content) {
  const match = content.match(/namespace\s+([\w.]+)\s*[;{]/);
  return match ? match[1] : null;
}
```

Then update `module.exports` to include it:

```js
module.exports = {
  extensions: ['.cs'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
  extractNamespace,
};
```

- [ ] **Step 4: Run tests — verify all pass**

Run: `node --test hippocampus/test/extractors/csharp.test.js`
Expected: All tests PASS (existing 24 tests + 5 new extractNamespace tests).

- [ ] **Step 5: Commit**

```bash
git add hippocampus/extractors/csharp.js hippocampus/test/extractors/csharp.test.js
git commit -m "feat(hippocampus): add extractNamespace to C# extractor"
```

---

### Task 2: Java extractNamespace — test and implement

**Files:**
- Modify: `hippocampus/test/extractors/java.test.js` (add extractNamespace describe block)
- Modify: `hippocampus/extractors/java.js:144-151`

- [ ] **Step 1: Write failing tests for extractNamespace**

Append the following `describe` block inside the existing `describe('java extractor', () => {` block in `hippocampus/test/extractors/java.test.js`, after the closing `});` of `describe('extractDefinitions')` (before the final `});`):

```js
  describe('extractNamespace', () => {
    it('extracts package declaration', () => {
      const content = 'package com.myapp.models;\npublic class User {}';
      assert.equal(ext.extractNamespace('User.java', content), 'com.myapp.models');
    });

    it('returns null when no package declaration', () => {
      const content = 'public class Main { public static void main(String[] args) {} }';
      assert.equal(ext.extractNamespace('Main.java', content), null);
    });

    it('handles leading whitespace', () => {
      const content = '  package com.myapp.services;';
      assert.equal(ext.extractNamespace('Svc.java', content), 'com.myapp.services');
    });
  });
```

- [ ] **Step 2: Run tests — verify extractNamespace tests fail**

Run: `node --test hippocampus/test/extractors/java.test.js`
Expected: `extractNamespace` tests FAIL, all other tests PASS.

- [ ] **Step 3: Implement extractNamespace in java.js**

Add before the `module.exports` block in `hippocampus/extractors/java.js` (before line 144):

```js
// Extract the package declaration from a Java file
function extractNamespace(filePath, content) {
  const match = content.match(/package\s+([\w.]+)\s*;/);
  return match ? match[1] : null;
}
```

Update `module.exports`:

```js
module.exports = {
  extensions: ['.java'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
  extractNamespace,
};
```

- [ ] **Step 4: Run tests — verify all pass**

Run: `node --test hippocampus/test/extractors/java.test.js`
Expected: All tests PASS (existing 22 tests + 3 new extractNamespace tests).

- [ ] **Step 5: Commit**

```bash
git add hippocampus/extractors/java.js hippocampus/test/extractors/java.test.js
git commit -m "feat(hippocampus): add extractNamespace to Java extractor"
```

---

## Chunk 2: scan.js Namespace Resolution + Integration Test

### Task 3: Namespace resolution in scan.js

**Files:**
- Modify: `hippocampus/scripts/scan.js:114-135`

The connection counting section (lines 117-135) currently only counts relative-path imports. We add two blocks: (A) build a namespace map after `fileData`, (B) resolve non-local imports inside the connection counting loop.

- [ ] **Step 1: Add namespace map construction after fileData loop**

Insert after line 114 (after the `for (const f of codeFiles)` loop closes), before the `// Compute connection counts` comment at line 117:

```js
  // Build namespace-to-files map for namespace-based languages (C#, Java)
  const namespaceMap = {};
  for (const [fileName, data] of Object.entries(fileData)) {
    const ext = path.extname(fileName);
    const extractor = registry.byExtension.get(ext);
    if (extractor && typeof extractor.extractNamespace === 'function') {
      const ns = extractor.extractNamespace(fileName, data.content);
      if (ns) {
        if (!namespaceMap[ns]) namespaceMap[ns] = [];
        namespaceMap[ns].push(fileName);
        data.namespace = ns;
      }
    }
  }
```

- [ ] **Step 2: Add namespace import resolution in connection counting loop**

Insert after line 134 (after the `for (const imp of localImports)` inner loop closes), before the outer `for` loop's closing `}` at line 135:

```js
    // Resolve namespace-based imports (C#, Java, etc.)
    // Each resolved import counts as 1 connection for the importer and 1 for the target.
    const nonLocalImports = data.imports.filter(imp => !imp.startsWith('.'));
    for (const imp of nonLocalImports) {
      // Direct namespace match: "using Foo.Bar" -> files in namespace "Foo.Bar"
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
      const lastDot = imp.lastIndexOf('.');
      if (lastDot <= 0) continue;

      const nsPrefix = imp.substring(0, lastDot);
      const typeName = imp.substring(lastDot + 1);
      let matched = false;

      if (namespaceMap[nsPrefix]) {
        for (const target of namespaceMap[nsPrefix]) {
          if (target !== fileName && fileData[target].exports.includes(typeName)) {
            connectionCount[fileName] = (connectionCount[fileName] || 0) + 1;
            connectionCount[target] = (connectionCount[target] || 0) + 1;
            matched = true;
          }
        }
      }

      // Second-level fallback for static imports: "com.foo.Bar.method" -> try "com.foo" + "Bar"
      if (!matched && lastDot > 0) {
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
    }
```

- [ ] **Step 3: Run existing tests — verify nothing broke**

Run: `node --test hippocampus/test/scan.test.js`
Expected: All existing tests PASS. The JS-only test fixtures have no `extractNamespace` methods, so the new code is inert for them.

- [ ] **Step 4: Commit**

```bash
git add hippocampus/scripts/scan.js
git commit -m "feat(hippocampus): resolve namespace-based imports for connection counting"
```

---

### Task 4: Integration test — namespace connections

**Files:**
- Create: `hippocampus/test/scan-namespace.test.js`

This test creates a temp C# project with namespace imports and verifies files get connections and appear in the files map.

- [ ] **Step 1: Write the integration test**

Create `hippocampus/test/scan-namespace.test.js`:

```js
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '.test-scan-namespace');

before(() => {
  // C# project: 3 files with namespace imports
  fs.mkdirSync(path.join(TEST_DIR, 'cs-project', 'Models'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'cs-project', 'Services'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'cs-project', 'Controllers'), { recursive: true });

  fs.writeFileSync(path.join(TEST_DIR, 'cs-project', 'Models', 'User.cs'),
    'namespace MyApp.Models;\n' +
    'public class User {\n' +
    '  public string Name { get; set; }\n' +
    '}\n'
  );

  fs.writeFileSync(path.join(TEST_DIR, 'cs-project', 'Services', 'UserService.cs'),
    'namespace MyApp.Services;\n' +
    'using MyApp.Models;\n' +
    'public class UserService {\n' +
    '  public User GetUser() { return new User(); }\n' +
    '}\n'
  );

  fs.writeFileSync(path.join(TEST_DIR, 'cs-project', 'Controllers', 'UserController.cs'),
    'namespace MyApp.Controllers;\n' +
    'using MyApp.Models;\n' +
    'using MyApp.Services;\n' +
    'public class UserController {\n' +
    '  private UserService _svc;\n' +
    '}\n'
  );
});

after(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('namespace connection resolution — C#', () => {
  it('gives C# files connections via namespace imports', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(
      path.join(TEST_DIR, 'cs-project'), 'cs-project', 'cs-project/'
    );

    // All 3 files should appear in filesMap (connections >= 2)
    assert.ok(dir.files['Models/User.cs'], 'User.cs should be mapped — imported by 2 files');
    assert.ok(dir.files['Services/UserService.cs'], 'UserService.cs should be mapped');
    assert.ok(dir.files['Controllers/UserController.cs'], 'UserController.cs should be mapped');
  });

  it('User.cs has imports from both other files', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(
      path.join(TEST_DIR, 'cs-project'), 'cs-project', 'cs-project/'
    );
    // User.cs is in namespace MyApp.Models, imported by UserService and UserController
    // So it should have at least 2 connections (one per importer)
    assert.ok(dir.files['Models/User.cs'], 'User.cs must be in files map');
  });
});

describe('namespace connection resolution — Java', () => {
  before(() => {
    fs.mkdirSync(path.join(TEST_DIR, 'java-project', 'models'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'java-project', 'services'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'java-project', 'controllers'), { recursive: true });

    fs.writeFileSync(path.join(TEST_DIR, 'java-project', 'models', 'User.java'),
      'package com.myapp.models;\n' +
      'public class User {\n' +
      '  public String name;\n' +
      '}\n'
    );

    fs.writeFileSync(path.join(TEST_DIR, 'java-project', 'services', 'UserService.java'),
      'package com.myapp.services;\n' +
      'import com.myapp.models.User;\n' +
      'public class UserService {\n' +
      '  public User getUser() { return new User(); }\n' +
      '}\n'
    );

    fs.writeFileSync(path.join(TEST_DIR, 'java-project', 'controllers', 'UserController.java'),
      'package com.myapp.controllers;\n' +
      'import com.myapp.models.User;\n' +
      'import com.myapp.services.UserService;\n' +
      'public class UserController {\n' +
      '  private UserService svc;\n' +
      '}\n'
    );

    // Static import test fixtures
    fs.writeFileSync(path.join(TEST_DIR, 'java-project', 'services', 'Helper.java'),
      'package com.myapp.services;\n' +
      'public class Helper {\n' +
      '  public static String format() { return ""; }\n' +
      '}\n'
    );

    fs.writeFileSync(path.join(TEST_DIR, 'java-project', 'controllers', 'Formatter.java'),
      'package com.myapp.controllers;\n' +
      'import static com.myapp.services.Helper.format;\n' +
      'import com.myapp.models.User;\n' +
      'public class Formatter {\n' +
      '  public String run() { return format(); }\n' +
      '}\n'
    );
  });

  it('gives Java files connections via type-level namespace imports', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(
      path.join(TEST_DIR, 'java-project'), 'java-project', 'java-project/'
    );

    // User.java: imported by UserService + UserController = 2 connections
    assert.ok(dir.files['models/User.java'], 'User.java should be mapped — imported by 2 files');
    // UserController: imports User + UserService = 2 connections
    assert.ok(dir.files['controllers/UserController.java'], 'UserController.java should be mapped — 2 imports');
  });

  it('resolves static imports via second-level fallback', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(
      path.join(TEST_DIR, 'java-project'), 'java-project', 'java-project/'
    );

    // Helper.java: exports "Helper", namespace "com.myapp.services"
    // Formatter imports "static com.myapp.services.Helper.format"
    //   -> first try: nsPrefix="com.myapp.services.Helper", type="format" — no namespace match
    //   -> second try: nsPrefix2="com.myapp.services", type2="Helper" — matches Helper.java export
    // Helper.java should get a connection from this
    assert.ok(dir.files['services/Helper.java'], 'Helper.java should be mapped — static import resolved');
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `node --test hippocampus/test/scan-namespace.test.js`
Expected: All tests PASS.

- [ ] **Step 3: Run full test suite — verify nothing broke**

Run: `cd /home/sonderbread/websites/thebrain-package && npm test`
Expected: All existing tests PASS. The `scan-namespace.test.js` integration test is included.

**Note:** The `npm test` glob (`hippocampus/test/*.test.js`) does not cover `hippocampus/test/extractors/*.test.js`. Run extractor tests separately:
```bash
node --test hippocampus/test/extractors/csharp.test.js hippocampus/test/extractors/java.test.js
```

- [ ] **Step 4: Commit**

```bash
git add hippocampus/test/scan-namespace.test.js
git commit -m "test(hippocampus): integration tests for namespace connection resolution"
```

---

## Chunk 3: Documentation

### Task 5: Update hippocampus docs

**Files:**
- Modify: `docs/hippocampus.md`

- [ ] **Step 1: Add "Language Connection Patterns" section**

Insert after the "File Inclusion Rules" section (after line 89 "or has a conversational alias.") and before the "Term Index" section (line 91):

```markdown

### Connection Resolution Strategies

**Relative-path languages** (JS, TS, Python, CSS, Shell): Imports start with `.` or are bare specifiers. `scan.js` resolves the relative path to a file in the project. This is the original mechanism.

**Namespace-based languages** (C#, Java): Imports are namespace/package strings (e.g., `using MyApp.Models`, `import com.foo.bar.MyClass`). `scan.js` builds a namespace-to-files map from `extractNamespace()` and resolves imports against it. Three resolution levels:

1. **Direct namespace match** — `using Foo.Bar` matches all files in namespace `Foo.Bar`
2. **Prefix + type match** — `import com.foo.bar.MyClass` splits into namespace `com.foo.bar` + type `MyClass`, matches files exporting that type
3. **Static import fallback** — `import static com.foo.Bar.method` tries one level up: namespace `com.foo` + type `Bar`

External dependency imports (NuGet, Maven, etc.) silently produce 0 connections — correct behavior since they're not project files.

**Known gaps** (Go, Rust): Go uses directory-based packages; Rust derives module paths from the file tree and `mod` declarations. Neither is supported yet.

### Adding Namespace Support to New Extractors

When creating an extractor for a namespace-based language, add an optional `extractNamespace(filePath, content)` method that returns the namespace/package string or `null`. This method is NOT in `REQUIRED_METHODS` — it's checked at runtime via `typeof extractor.extractNamespace === 'function'`. Extractors without it work fine; their files just use relative-path resolution only.
```

- [ ] **Step 2: Update the "Current extractors" line**

In `docs/hippocampus.md`, update line 117:

From:
```
**Current extractors:** JavaScript (`.js`, `.mjs`, `.cjs`), TypeScript (`.ts`, `.tsx`), Python (`.py`), Shell (`.sh`, `.bash`), CSS (`.css`)
```

To:
```
**Current extractors:** JavaScript (`.js`, `.mjs`, `.cjs`), TypeScript (`.ts`, `.tsx`), Python (`.py`), Shell (`.sh`, `.bash`), CSS (`.css`), C# (`.cs`), Java (`.java`), Go (`.go`), Rust (`.rs`)
```

- [ ] **Step 3: Commit**

```bash
git add docs/hippocampus.md
git commit -m "docs(hippocampus): add language connection patterns section"
```

---

## Verification

After all tasks complete, run the full suite one more time:

```bash
cd /home/sonderbread/websites/thebrain-package && npm test
```

All tests should pass. Then do a manual smoke test:

```bash
# Scan the workspace to verify no regressions
node hippocampus/scripts/scan.js
```

The scanner should complete without errors. Any C#/Java projects in the workspace should now show mapped files that were previously filtered out.
