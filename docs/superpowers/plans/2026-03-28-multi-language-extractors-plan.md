# Multi-Language Extractors Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add C#, Java, Go, and Rust extractors to the hippocampus so the brain works with those codebases out of the box.

**Architecture:** Drop-in extractor files auto-discovered by the existing registry. Each extractor exports `extensions`, `extractImports`, `extractExports`, `extractRoutes`, `extractIdentifiers`, `extractDefinitions`. One edit to `file-collector.js` for build-artifact skip dirs. No other files change.

**Tech Stack:** Node.js, `node:test`, `node:assert/strict`, regex-based parsing

**Spec:** `docs/superpowers/specs/2026-03-28-multi-language-extractors-design.md`

---

## Chunk 1: Skip List + C# Extractor

### Task 1: Update file-collector skip list

**Files:**
- Modify: `hippocampus/lib/file-collector.js:6-8`
- Modify: `hippocampus/test/file-collector.test.js`

- [ ] **Step 1: Add skip dirs to file-collector.js**

In `hippocampus/lib/file-collector.js`, replace the `SKIP_DIRS_EXACT` set:

```js
const SKIP_DIRS_EXACT = new Set([
  'node_modules', '.git', '.worktrees', 'marked-for-deletion',
  // Build output
  'bin', 'obj', 'target', 'build', 'dist', 'out',
  // Vendored dependencies
  'vendor',
  // IDE metadata
  '.vs', '.idea', '.gradle',
]);
```

- [ ] **Step 2: Add skip list test for new directories**

In `hippocampus/test/file-collector.test.js`, add test fixture directories in the `before()` block after the existing `Archived` mkdir:

```js
fs.mkdirSync(path.join(TEST_DIR, 'bin/Debug'), { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, 'obj'), { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, 'target/release'), { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, 'build'), { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, 'dist'), { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, 'vendor'), { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, '.vs'), { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, '.idea'), { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, 'out'), { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, '.gradle'), { recursive: true });

fs.writeFileSync(path.join(TEST_DIR, 'bin/Debug/app.dll'), 'binary');
fs.writeFileSync(path.join(TEST_DIR, 'obj/project.assets.json'), '{}');
fs.writeFileSync(path.join(TEST_DIR, 'target/release/main'), 'binary');
fs.writeFileSync(path.join(TEST_DIR, 'build/output.js'), 'built');
fs.writeFileSync(path.join(TEST_DIR, 'dist/bundle.js'), 'bundled');
fs.writeFileSync(path.join(TEST_DIR, 'vendor/lib.go'), 'package lib');
fs.writeFileSync(path.join(TEST_DIR, '.vs/settings.json'), '{}');
fs.writeFileSync(path.join(TEST_DIR, '.idea/workspace.xml'), '<xml/>');
fs.writeFileSync(path.join(TEST_DIR, 'out/compiled.js'), 'compiled');
fs.writeFileSync(path.join(TEST_DIR, '.gradle/caches.bin'), 'cache');
```

Add a new test after the "skips Archived directories" test:

```js
it('skips build artifact and IDE directories', () => {
  const exts = new Set(['.js', '.json', '.go', '.xml']);
  const files = collectCodeFiles(TEST_DIR, exts);
  const names = files.map(f => f.relative);
  for (const dir of ['bin', 'obj', 'target', 'build', 'dist', 'out', 'vendor', '.vs', '.idea', '.gradle']) {
    assert.ok(!names.some(n => n.startsWith(dir + path.sep) || n.startsWith(dir + '/')),
      `should skip ${dir}/ but found file inside it`);
  }
});
```

- [ ] **Step 3: Run file-collector tests**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/file-collector.test.js`
Expected: All tests pass including the new skip test.

- [ ] **Step 4: Commit**

Ready to commit. Run `npm run commit` from `/websites/`.
Message: "feat(hippocampus): add build artifact and IDE dirs to skip list"

---

### Task 2: C# extractor — tests

**Files:**
- Create: `hippocampus/test/extractors/csharp.test.js`

- [ ] **Step 1: Write C# extractor test file**

Create `hippocampus/test/extractors/csharp.test.js`:

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('csharp extractor', () => {
  const ext = require('../../extractors/csharp');

  describe('extensions', () => {
    it('claims .cs', () => {
      assert.deepStrictEqual(ext.extensions, ['.cs']);
    });
  });

  describe('extractImports', () => {
    it('extracts using directives', () => {
      const content = 'using MyApp.Services;\nusing MyApp.Models;';
      const result = ext.extractImports('UserService.cs', content);
      assert.ok(result.includes('MyApp.Services'));
      assert.ok(result.includes('MyApp.Models'));
    });

    it('extracts using static directives', () => {
      const content = 'using static MyApp.Helpers.MathUtils;';
      const result = ext.extractImports('Calc.cs', content);
      assert.ok(result.includes('MyApp.Helpers.MathUtils'));
    });

    it('skips System and Microsoft namespaces', () => {
      const content = 'using System;\nusing System.Collections.Generic;\nusing Microsoft.Extensions.DependencyInjection;';
      const result = ext.extractImports('App.cs', content);
      assert.strictEqual(result.length, 0);
    });

    it('deduplicates', () => {
      const content = 'using MyApp.Models;\nusing MyApp.Models;';
      const result = ext.extractImports('App.cs', content);
      assert.strictEqual(result.length, 1);
    });
  });

  describe('extractExports', () => {
    it('extracts public class', () => {
      const content = 'public class UserService\n{\n}';
      const result = ext.extractExports('UserService.cs', content);
      assert.ok(result.includes('UserService'));
    });

    it('extracts public static class', () => {
      const content = 'public static class Extensions\n{\n}';
      const result = ext.extractExports('Extensions.cs', content);
      assert.ok(result.includes('Extensions'));
    });

    it('extracts public abstract class', () => {
      const content = 'public abstract class BaseRepository\n{\n}';
      const result = ext.extractExports('BaseRepository.cs', content);
      assert.ok(result.includes('BaseRepository'));
    });

    it('extracts public interface', () => {
      const content = 'public interface IUserRepository\n{\n}';
      const result = ext.extractExports('IUserRepository.cs', content);
      assert.ok(result.includes('IUserRepository'));
    });

    it('extracts public struct', () => {
      const content = 'public struct Point\n{\n}';
      const result = ext.extractExports('Point.cs', content);
      assert.ok(result.includes('Point'));
    });

    it('extracts public enum', () => {
      const content = 'public enum Status\n{\n    Active,\n    Inactive\n}';
      const result = ext.extractExports('Status.cs', content);
      assert.ok(result.includes('Status'));
    });

    it('extracts public record', () => {
      const content = 'public record UserDto(string Name, string Email);';
      const result = ext.extractExports('UserDto.cs', content);
      assert.ok(result.includes('UserDto'));
    });

    it('skips non-public types', () => {
      const content = 'internal class InternalHelper\n{\n}\nprivate class PrivateHelper\n{\n}';
      const result = ext.extractExports('Helpers.cs', content);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('extractRoutes', () => {
    it('extracts HttpGet attribute', () => {
      const content = '[HttpGet("api/users")]\npublic IActionResult GetUsers()';
      const result = ext.extractRoutes('UsersController.cs', content);
      assert.ok(result.includes('GET api/users'));
    });

    it('extracts HttpPost attribute', () => {
      const content = '[HttpPost("api/users")]\npublic IActionResult CreateUser()';
      const result = ext.extractRoutes('UsersController.cs', content);
      assert.ok(result.includes('POST api/users'));
    });

    it('extracts HttpPut, HttpDelete, HttpPatch', () => {
      const content = '[HttpPut("api/users/{id}")]\n[HttpDelete("api/users/{id}")]\n[HttpPatch("api/users/{id}")]';
      const result = ext.extractRoutes('UsersController.cs', content);
      assert.ok(result.includes('PUT api/users/{id}'));
      assert.ok(result.includes('DELETE api/users/{id}'));
      assert.ok(result.includes('PATCH api/users/{id}'));
    });

    it('extracts Route attribute', () => {
      const content = '[Route("api/[controller]")]';
      const result = ext.extractRoutes('Controller.cs', content);
      assert.ok(result.includes('ROUTE api/[controller]'));
    });

    it('extracts minimal API MapGet/MapPost', () => {
      const content = 'app.MapGet("/api/items", () => Results.Ok());\nendpoints.MapPost("/api/items", handler);';
      const result = ext.extractRoutes('Program.cs', content);
      assert.ok(result.includes('GET /api/items'));
      assert.ok(result.includes('POST /api/items'));
    });

    it('returns empty for non-route files', () => {
      const content = 'public class UserService { }';
      assert.deepStrictEqual(ext.extractRoutes('UserService.cs', content), []);
    });
  });

  describe('extractIdentifiers', () => {
    it('extracts identifiers', () => {
      const result = ext.extractIdentifiers('var userService = new UserService();', 1);
      const terms = result.map(r => r.term);
      assert.ok(terms.includes('userService'));
      assert.ok(terms.includes('UserService'));
    });

    it('skips C# keywords', () => {
      const result = ext.extractIdentifiers('public static void async return', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('public'));
      assert.ok(!terms.includes('static'));
      assert.ok(!terms.includes('void'));
      assert.ok(!terms.includes('async'));
      assert.ok(!terms.includes('return'));
    });

    it('skips short identifiers', () => {
      const result = ext.extractIdentifiers('int x = ab + cd;', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('x'));
      assert.ok(!terms.includes('ab'));
      assert.ok(!terms.includes('cd'));
    });

    it('includes line number', () => {
      const result = ext.extractIdentifiers('var myService = Init();', 42);
      assert.ok(result.find(r => r.term === 'myService' && r.line === 42));
    });
  });

  describe('extractDefinitions', () => {
    it('extracts class definitions', () => {
      const content = 'public class UserService\n{\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'UserService' && d.type === 'class'));
    });

    it('extracts struct definitions', () => {
      const content = 'public struct Point\n{\n    public int X;\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Point' && d.type === 'struct'));
    });

    it('extracts interface definitions', () => {
      const content = 'public interface IUserRepository\n{\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'IUserRepository' && d.type === 'interface'));
    });

    it('extracts enum definitions', () => {
      const content = 'public enum Status\n{\n    Active\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Status' && d.type === 'enum'));
    });

    it('extracts record definitions', () => {
      const content = 'public record UserDto(string Name);';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'UserDto' && d.type === 'record'));
    });

    it('extracts method definitions', () => {
      const content = 'public class Svc\n{\n    public async Task<User> GetById(int id)\n    {\n    }\n    private void DoWork()\n    {\n    }\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'GetById' && d.type === 'method'));
      assert.ok(defs.find(d => d.name === 'DoWork' && d.type === 'method'));
    });

    it('does not extract control flow as methods', () => {
      const content = 'public class Svc\n{\n    public void Run()\n    {\n        if (true)\n        {\n        }\n        for (int i = 0; i < 10; i++)\n        {\n        }\n    }\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(!defs.find(d => d.name === 'if'));
      assert.ok(!defs.find(d => d.name === 'for'));
    });

    it('includes line numbers', () => {
      const content = 'using System;\n\npublic class Svc\n{\n    public void Run()\n    {\n    }\n}';
      const defs = ext.extractDefinitions(content);
      const svc = defs.find(d => d.name === 'Svc');
      assert.ok(svc);
      assert.strictEqual(svc.line, 3);
      const run = defs.find(d => d.name === 'Run');
      assert.ok(run);
      assert.strictEqual(run.line, 5);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/extractors/csharp.test.js`
Expected: FAIL — module `../../extractors/csharp` not found.

---

### Task 3: C# extractor — implementation

**Files:**
- Create: `hippocampus/extractors/csharp.js`

- [ ] **Step 1: Write C# extractor**

Create `hippocampus/extractors/csharp.js`:

```js
'use strict';

const CSHARP_KEYWORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char',
  'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate',
  'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false',
  'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit',
  'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace',
  'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private',
  'protected', 'public', 'readonly', 'record', 'ref', 'return', 'sbyte',
  'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong',
  'unchecked', 'unsafe', 'ushort', 'using', 'var', 'virtual', 'void',
  'volatile', 'while', 'async', 'await', 'get', 'set', 'value', 'yield',
  'partial', 'where', 'when', 'dynamic', 'nint', 'nuint',
]);

const MIN_IDENTIFIER_LENGTH = 3;

// Keywords that look like method calls in control flow
const CONTROL_FLOW = new Set([
  'if', 'for', 'foreach', 'while', 'switch', 'catch', 'lock', 'using', 'when',
  'typeof', 'sizeof', 'nameof', 'default',
]);

// Type declaration keywords — lines with these aren't methods
const TYPE_DECL = /\b(class|struct|interface|enum|record|namespace|delegate)\s+/;

function extractImports(filePath, content) {
  const imports = [];
  // using Namespace; and using static Namespace.Class;
  const pattern = /using\s+(?:static\s+)?([A-Z][\w.]+)\s*;/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const ns = match[1];
    // Skip System.* and Microsoft.* standard library namespaces
    if (ns.startsWith('System') || ns.startsWith('Microsoft')) continue;
    imports.push(ns);
  }
  return [...new Set(imports)];
}

function extractExports(filePath, content) {
  const exports_ = [];
  // public [modifiers] (class|struct|interface|enum|record) Name
  const pattern = /public\s+(?:(?:static|abstract|sealed|partial)\s+)*(?:class|struct|interface|enum|record)\s+(\w+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    exports_.push(match[1]);
  }
  return exports_;
}

function extractRoutes(filePath, content) {
  const routes = [];
  let match;

  // ASP.NET attribute routes: [HttpGet("path")], [HttpPost("path")], etc.
  const httpPattern = /\[Http(Get|Post|Put|Delete|Patch)\("([^"]+)"\)\]/g;
  while ((match = httpPattern.exec(content)) !== null) {
    routes.push(match[1].toUpperCase() + ' ' + match[2]);
  }

  // [Route("path")]
  const routePattern = /\[Route\("([^"]+)"\)\]/g;
  while ((match = routePattern.exec(content)) !== null) {
    routes.push('ROUTE ' + match[1]);
  }

  // Minimal API: app.MapGet("/path", ...), endpoints.MapPost("/path", ...), etc.
  const minimalPattern = /\w+\.Map(Get|Post|Put|Delete|Patch)\(\s*"([^"]+)"/g;
  while ((match = minimalPattern.exec(content)) !== null) {
    routes.push(match[1].toUpperCase() + ' ' + match[2]);
  }

  return routes;
}

function extractIdentifiers(line, lineNumber) {
  const seen = new Set();
  const results = [];
  const pattern = /[a-zA-Z_]\w*/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const term = match[0];
    if (term.length < MIN_IDENTIFIER_LENGTH) continue;
    if (CSHARP_KEYWORDS.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    results.push({ term, line: lineNumber });
  }
  return results;
}

function extractDefinitions(content) {
  const lines = content.split('\n');
  const defs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Type declarations: class, struct, interface, enum, record
    const classMatch = trimmed.match(/\bclass\s+(\w+)/);
    if (classMatch) { defs.push({ name: classMatch[1], type: 'class', line: i + 1 }); continue; }

    const structMatch = trimmed.match(/\bstruct\s+(\w+)/);
    if (structMatch) { defs.push({ name: structMatch[1], type: 'struct', line: i + 1 }); continue; }

    const ifaceMatch = trimmed.match(/\binterface\s+(\w+)/);
    if (ifaceMatch) { defs.push({ name: ifaceMatch[1], type: 'interface', line: i + 1 }); continue; }

    const enumMatch = trimmed.match(/\benum\s+(\w+)/);
    if (enumMatch) { defs.push({ name: enumMatch[1], type: 'enum', line: i + 1 }); continue; }

    const recordMatch = trimmed.match(/\brecord\s+(\w+)/);
    if (recordMatch) { defs.push({ name: recordMatch[1], type: 'record', line: i + 1 }); continue; }

    // Method detection: indented lines with name( that aren't type decls or control flow
    if (TYPE_DECL.test(trimmed)) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent === 0) continue; // Top-level lines aren't methods
    const methodMatch = trimmed.match(/(\w+)\s*\(/);
    if (methodMatch) {
      const name = methodMatch[1];
      if (CONTROL_FLOW.has(name)) continue;
      // Heuristic: method declarations have at least one word before the method name
      const beforeName = trimmed.slice(0, methodMatch.index).trim();
      if (beforeName.length === 0) continue; // bare "Name(" — likely a call, not declaration
      defs.push({ name, type: 'method', line: i + 1 });
    }
  }

  return defs;
}

module.exports = {
  extensions: ['.cs'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
```

- [ ] **Step 2: Run C# tests**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/extractors/csharp.test.js`
Expected: All tests pass.

- [ ] **Step 3: Commit**

Ready to commit. Run `npm run commit` from `/websites/`.
Message: "feat(hippocampus): add C# extractor"

---

## Chunk 2: Java Extractor

### Task 4: Java extractor — tests

**Files:**
- Create: `hippocampus/test/extractors/java.test.js`

- [ ] **Step 1: Write Java extractor test file**

Create `hippocampus/test/extractors/java.test.js`:

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('java extractor', () => {
  const ext = require('../../extractors/java');

  describe('extensions', () => {
    it('claims .java', () => {
      assert.deepStrictEqual(ext.extensions, ['.java']);
    });
  });

  describe('extractImports', () => {
    it('extracts project-local imports', () => {
      const content = 'import com.myapp.service.UserService;\nimport com.myapp.model.User;';
      const result = ext.extractImports('App.java', content);
      assert.ok(result.includes('com.myapp.service.UserService'));
      assert.ok(result.includes('com.myapp.model.User'));
    });

    it('extracts static imports', () => {
      const content = 'import static com.myapp.Utils.format;';
      const result = ext.extractImports('App.java', content);
      assert.ok(result.includes('com.myapp.Utils.format'));
    });

    it('skips java/javax/jakarta stdlib', () => {
      const content = 'import java.util.List;\nimport javax.persistence.Entity;\nimport jakarta.inject.Inject;';
      const result = ext.extractImports('App.java', content);
      assert.strictEqual(result.length, 0);
    });

    it('skips sun.* imports', () => {
      const content = 'import sun.misc.Unsafe;\nimport com.sun.net.httpserver.HttpServer;';
      const result = ext.extractImports('App.java', content);
      assert.strictEqual(result.length, 0);
    });

    it('deduplicates', () => {
      const content = 'import com.myapp.User;\nimport com.myapp.User;';
      const result = ext.extractImports('App.java', content);
      assert.strictEqual(result.length, 1);
    });
  });

  describe('extractExports', () => {
    it('extracts public class', () => {
      const content = 'public class UserService {\n}';
      const result = ext.extractExports('UserService.java', content);
      assert.ok(result.includes('UserService'));
    });

    it('extracts public abstract class', () => {
      const content = 'public abstract class BaseRepository {\n}';
      const result = ext.extractExports('BaseRepository.java', content);
      assert.ok(result.includes('BaseRepository'));
    });

    it('extracts public interface', () => {
      const content = 'public interface UserRepository {\n}';
      const result = ext.extractExports('UserRepository.java', content);
      assert.ok(result.includes('UserRepository'));
    });

    it('extracts public enum', () => {
      const content = 'public enum Status {\n    ACTIVE, INACTIVE\n}';
      const result = ext.extractExports('Status.java', content);
      assert.ok(result.includes('Status'));
    });

    it('extracts public record', () => {
      const content = 'public record UserDto(String name, String email) {\n}';
      const result = ext.extractExports('UserDto.java', content);
      assert.ok(result.includes('UserDto'));
    });

    it('extracts public annotation', () => {
      const content = 'public @interface Cacheable {\n}';
      const result = ext.extractExports('Cacheable.java', content);
      assert.ok(result.includes('Cacheable'));
    });

    it('skips non-public types', () => {
      const content = 'class InternalHelper {\n}';
      const result = ext.extractExports('InternalHelper.java', content);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('extractRoutes', () => {
    it('extracts Spring GetMapping', () => {
      const content = '@GetMapping("/api/users")\npublic List<User> getUsers()';
      const result = ext.extractRoutes('UserController.java', content);
      assert.ok(result.includes('GET /api/users'));
    });

    it('extracts Spring PostMapping', () => {
      const content = '@PostMapping("/api/users")\npublic User createUser()';
      const result = ext.extractRoutes('UserController.java', content);
      assert.ok(result.includes('POST /api/users'));
    });

    it('extracts PutMapping, DeleteMapping, PatchMapping', () => {
      const content = '@PutMapping("/api/users/{id}")\n@DeleteMapping("/api/users/{id}")\n@PatchMapping("/api/users/{id}")';
      const result = ext.extractRoutes('UserController.java', content);
      assert.ok(result.includes('PUT /api/users/{id}'));
      assert.ok(result.includes('DELETE /api/users/{id}'));
      assert.ok(result.includes('PATCH /api/users/{id}'));
    });

    it('extracts RequestMapping', () => {
      const content = '@RequestMapping("/api")\npublic class ApiController';
      const result = ext.extractRoutes('ApiController.java', content);
      assert.ok(result.includes('ROUTE /api'));
    });

    it('extracts JAX-RS @Path', () => {
      const content = '@Path("/api/users")\npublic class UserResource';
      const result = ext.extractRoutes('UserResource.java', content);
      assert.ok(result.includes('ROUTE /api/users'));
    });

    it('returns empty for non-route files', () => {
      const content = 'public class UserService { }';
      assert.deepStrictEqual(ext.extractRoutes('UserService.java', content), []);
    });
  });

  describe('extractIdentifiers', () => {
    it('extracts identifiers', () => {
      const result = ext.extractIdentifiers('UserService service = new UserService();', 1);
      const terms = result.map(r => r.term);
      assert.ok(terms.includes('UserService'));
      assert.ok(terms.includes('service'));
    });

    it('skips Java keywords', () => {
      const result = ext.extractIdentifiers('public static final void return', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('public'));
      assert.ok(!terms.includes('static'));
      assert.ok(!terms.includes('final'));
      assert.ok(!terms.includes('void'));
      assert.ok(!terms.includes('return'));
    });

    it('skips common stdlib identifiers', () => {
      const result = ext.extractIdentifiers('String System Override', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('String'));
      assert.ok(!terms.includes('System'));
      assert.ok(!terms.includes('Override'));
    });

    it('skips short identifiers', () => {
      const result = ext.extractIdentifiers('int x = ab;', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('x'));
      assert.ok(!terms.includes('ab'));
    });

    it('includes line number', () => {
      const result = ext.extractIdentifiers('UserService service = init();', 10);
      assert.ok(result.find(r => r.term === 'service' && r.line === 10));
    });
  });

  describe('extractDefinitions', () => {
    it('extracts class definitions', () => {
      const content = 'public class UserService {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'UserService' && d.type === 'class'));
    });

    it('extracts interface definitions', () => {
      const content = 'public interface UserRepository {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'UserRepository' && d.type === 'interface'));
    });

    it('extracts enum definitions', () => {
      const content = 'public enum Status {\n    ACTIVE\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Status' && d.type === 'enum'));
    });

    it('extracts record definitions', () => {
      const content = 'public record UserDto(String name) {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'UserDto' && d.type === 'record'));
    });

    it('extracts annotation definitions', () => {
      const content = 'public @interface Cacheable {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Cacheable' && d.type === 'annotation'));
    });

    it('extracts method definitions', () => {
      const content = 'public class Svc {\n    public List<User> findAll() {\n    }\n    private void doWork() {\n    }\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'findAll' && d.type === 'method'));
      assert.ok(defs.find(d => d.name === 'doWork' && d.type === 'method'));
    });

    it('does not extract control flow as methods', () => {
      const content = 'public class Svc {\n    public void run() {\n        if (true) {\n        }\n        for (int i = 0; i < 10; i++) {\n        }\n    }\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(!defs.find(d => d.name === 'if'));
      assert.ok(!defs.find(d => d.name === 'for'));
    });

    it('includes line numbers', () => {
      const content = 'package com.myapp;\n\npublic class Svc {\n    public void run() {\n    }\n}';
      const defs = ext.extractDefinitions(content);
      assert.strictEqual(defs.find(d => d.name === 'Svc').line, 3);
      assert.strictEqual(defs.find(d => d.name === 'run').line, 4);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/extractors/java.test.js`
Expected: FAIL — module `../../extractors/java` not found.

---

### Task 5: Java extractor — implementation

**Files:**
- Create: `hippocampus/extractors/java.js`

- [ ] **Step 1: Write Java extractor**

Create `hippocampus/extractors/java.js`:

```js
'use strict';

const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'false', 'final', 'finally', 'float', 'for', 'goto', 'if',
  'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'null', 'package', 'private', 'protected', 'public', 'return',
  'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this',
  'throw', 'throws', 'transient', 'true', 'try', 'var', 'void', 'volatile',
  'while', 'yield', 'record', 'sealed', 'permits',
  // Common stdlib identifiers — filtered to reduce noise
  'String', 'System', 'Override',
]);

const MIN_IDENTIFIER_LENGTH = 3;

const CONTROL_FLOW = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'synchronized', 'assert',
  'typeof', 'instanceof',
]);

const TYPE_DECL = /\b(class|interface|enum|record|@interface)\s+/;

function extractImports(filePath, content) {
  const imports = [];
  // import [static] package.Class;
  const pattern = /import\s+(?:static\s+)?([\w.]+)\s*;/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const pkg = match[1];
    if (pkg.startsWith('java.') || pkg.startsWith('javax.') ||
        pkg.startsWith('jakarta.') || pkg.startsWith('sun.') ||
        pkg.startsWith('com.sun.')) continue;
    imports.push(pkg);
  }
  return [...new Set(imports)];
}

function extractExports(filePath, content) {
  const exports_ = [];
  // public [modifiers] (class|abstract class|interface|enum|record) Name
  const pattern = /public\s+(?:(?:abstract|final|sealed|static)\s+)*(?:class|interface|enum|record)\s+(\w+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    exports_.push(match[1]);
  }
  // public @interface Name (annotations)
  const annotPattern = /public\s+@interface\s+(\w+)/g;
  while ((match = annotPattern.exec(content)) !== null) {
    exports_.push(match[1]);
  }
  return exports_;
}

function extractRoutes(filePath, content) {
  const routes = [];
  let match;

  // Spring: @GetMapping("/path"), @PostMapping("/path"), etc.
  const springPattern = /@(Get|Post|Put|Delete|Patch)Mapping\(\s*"([^"]+)"/g;
  while ((match = springPattern.exec(content)) !== null) {
    routes.push(match[1].toUpperCase() + ' ' + match[2]);
  }

  // Spring: @RequestMapping("/path")
  const reqMapPattern = /@RequestMapping\(\s*"([^"]+)"/g;
  while ((match = reqMapPattern.exec(content)) !== null) {
    routes.push('ROUTE ' + match[1]);
  }

  // JAX-RS: @Path("/path")
  const pathPattern = /@Path\(\s*"([^"]+)"/g;
  while ((match = pathPattern.exec(content)) !== null) {
    routes.push('ROUTE ' + match[1]);
  }

  return routes;
}

function extractIdentifiers(line, lineNumber) {
  const seen = new Set();
  const results = [];
  const pattern = /[a-zA-Z_]\w*/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const term = match[0];
    if (term.length < MIN_IDENTIFIER_LENGTH) continue;
    if (JAVA_KEYWORDS.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    results.push({ term, line: lineNumber });
  }
  return results;
}

function extractDefinitions(content) {
  const lines = content.split('\n');
  const defs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Type declarations
    const classMatch = trimmed.match(/\bclass\s+(\w+)/);
    if (classMatch) { defs.push({ name: classMatch[1], type: 'class', line: i + 1 }); continue; }

    const ifaceMatch = trimmed.match(/\binterface\s+(\w+)/);
    // Distinguish @interface (annotation) from interface
    if (ifaceMatch) {
      const isAnnotation = trimmed.match(/@interface\s+(\w+)/);
      if (isAnnotation) {
        defs.push({ name: isAnnotation[1], type: 'annotation', line: i + 1 });
      } else {
        defs.push({ name: ifaceMatch[1], type: 'interface', line: i + 1 });
      }
      continue;
    }

    const enumMatch = trimmed.match(/\benum\s+(\w+)/);
    if (enumMatch) { defs.push({ name: enumMatch[1], type: 'enum', line: i + 1 }); continue; }

    const recordMatch = trimmed.match(/\brecord\s+(\w+)/);
    if (recordMatch) { defs.push({ name: recordMatch[1], type: 'record', line: i + 1 }); continue; }

    // Method detection: indented, has name(, not a type decl or control flow
    if (TYPE_DECL.test(trimmed)) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent === 0) continue;
    const methodMatch = trimmed.match(/(\w+)\s*\(/);
    if (methodMatch) {
      const name = methodMatch[1];
      if (CONTROL_FLOW.has(name)) continue;
      const beforeName = trimmed.slice(0, methodMatch.index).trim();
      if (beforeName.length === 0) continue;
      defs.push({ name, type: 'method', line: i + 1 });
    }
  }

  return defs;
}

module.exports = {
  extensions: ['.java'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
```

- [ ] **Step 2: Run Java tests**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/extractors/java.test.js`
Expected: All tests pass.

- [ ] **Step 3: Commit**

Ready to commit. Run `npm run commit` from `/websites/`.
Message: "feat(hippocampus): add Java extractor"

---

## Chunk 3: Go Extractor

### Task 6: Go extractor — tests

**Files:**
- Create: `hippocampus/test/extractors/go.test.js`

- [ ] **Step 1: Write Go extractor test file**

Create `hippocampus/test/extractors/go.test.js`:

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('go extractor', () => {
  const ext = require('../../extractors/go');

  describe('extensions', () => {
    it('claims .go', () => {
      assert.deepStrictEqual(ext.extensions, ['.go']);
    });
  });

  describe('extractImports', () => {
    it('extracts module imports from single import', () => {
      const content = 'import "github.com/gorilla/mux"';
      const result = ext.extractImports('main.go', content);
      assert.ok(result.includes('github.com/gorilla/mux'));
    });

    it('extracts module imports from block import', () => {
      const content = 'import (\n\t"fmt"\n\t"github.com/gorilla/mux"\n\t"github.com/lib/pq"\n)';
      const result = ext.extractImports('main.go', content);
      assert.ok(result.includes('github.com/gorilla/mux'));
      assert.ok(result.includes('github.com/lib/pq'));
    });

    it('skips stdlib (no dots in path)', () => {
      const content = 'import (\n\t"fmt"\n\t"net/http"\n\t"os"\n)';
      const result = ext.extractImports('main.go', content);
      assert.strictEqual(result.length, 0);
    });

    it('handles aliased imports', () => {
      const content = 'import (\n\tmux "github.com/gorilla/mux"\n)';
      const result = ext.extractImports('main.go', content);
      assert.ok(result.includes('github.com/gorilla/mux'));
    });

    it('deduplicates', () => {
      const content = 'import "github.com/lib/pq"\nimport "github.com/lib/pq"';
      const result = ext.extractImports('main.go', content);
      assert.strictEqual(result.length, 1);
    });
  });

  describe('extractExports', () => {
    it('extracts exported functions (uppercase)', () => {
      const content = 'func HandleRequest(w http.ResponseWriter, r *http.Request) {\n}';
      const result = ext.extractExports('handler.go', content);
      assert.ok(result.includes('HandleRequest'));
    });

    it('extracts exported types', () => {
      const content = 'type UserService struct {\n}\ntype Repository interface {\n}';
      const result = ext.extractExports('types.go', content);
      assert.ok(result.includes('UserService'));
      assert.ok(result.includes('Repository'));
    });

    it('extracts exported vars and consts', () => {
      const content = 'var DefaultConfig = Config{}\nconst MaxRetries = 3';
      const result = ext.extractExports('config.go', content);
      assert.ok(result.includes('DefaultConfig'));
      assert.ok(result.includes('MaxRetries'));
    });

    it('skips unexported (lowercase) identifiers', () => {
      const content = 'func handleInternal() {\n}\ntype helper struct {\n}\nvar defaultVal = 1';
      const result = ext.extractExports('internal.go', content);
      assert.strictEqual(result.length, 0);
    });

    it('skips receiver methods for exports', () => {
      const content = 'func (s *Service) HandleRequest() {\n}';
      const result = ext.extractExports('service.go', content);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('extractRoutes', () => {
    it('extracts Chi/Gorilla routes', () => {
      const content = 'r.Get("/api/users", listUsers)\nr.Post("/api/users", createUser)';
      const result = ext.extractRoutes('routes.go', content);
      assert.ok(result.includes('GET /api/users'));
      assert.ok(result.includes('POST /api/users'));
    });

    it('extracts Put and Delete routes', () => {
      const content = 'r.Put("/api/users/{id}", updateUser)\nr.Delete("/api/users/{id}", deleteUser)';
      const result = ext.extractRoutes('routes.go', content);
      assert.ok(result.includes('PUT /api/users/{id}'));
      assert.ok(result.includes('DELETE /api/users/{id}'));
    });

    it('extracts HandleFunc routes', () => {
      const content = 'http.HandleFunc("/api/health", healthCheck)';
      const result = ext.extractRoutes('main.go', content);
      assert.ok(result.includes('ROUTE /api/health'));
    });

    it('extracts Handle routes', () => {
      const content = 'r.Handle("/api/items", itemHandler)';
      const result = ext.extractRoutes('routes.go', content);
      assert.ok(result.includes('ROUTE /api/items'));
    });

    it('extracts Gin uppercase routes', () => {
      const content = 'r.GET("/api/users", listUsers)\nr.POST("/api/users", createUser)';
      const result = ext.extractRoutes('routes.go', content);
      assert.ok(result.includes('GET /api/users'));
      assert.ok(result.includes('POST /api/users'));
    });

    it('returns empty for non-route files', () => {
      const content = 'func helper() { }';
      assert.deepStrictEqual(ext.extractRoutes('utils.go', content), []);
    });
  });

  describe('extractIdentifiers', () => {
    it('extracts identifiers', () => {
      const result = ext.extractIdentifiers('userService := NewUserService(db)', 1);
      const terms = result.map(r => r.term);
      assert.ok(terms.includes('userService'));
      assert.ok(terms.includes('NewUserService'));
    });

    it('skips Go keywords and builtins', () => {
      const result = ext.extractIdentifiers('func interface struct return package', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('func'));
      assert.ok(!terms.includes('interface'));
      assert.ok(!terms.includes('struct'));
      assert.ok(!terms.includes('return'));
      assert.ok(!terms.includes('package'));
    });

    it('skips short identifiers', () => {
      const result = ext.extractIdentifiers('x := ab + cd', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('x'));
      assert.ok(!terms.includes('ab'));
      assert.ok(!terms.includes('cd'));
    });

    it('includes line number', () => {
      const result = ext.extractIdentifiers('userService := Init()', 7);
      assert.ok(result.find(r => r.term === 'userService' && r.line === 7));
    });
  });

  describe('extractDefinitions', () => {
    it('extracts package-level functions', () => {
      const content = 'func HandleRequest(w http.ResponseWriter, r *http.Request) {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'HandleRequest' && d.type === 'function'));
    });

    it('extracts receiver methods', () => {
      const content = 'func (s *Service) GetUser(id int) (*User, error) {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'GetUser' && d.type === 'method'));
    });

    it('extracts struct definitions', () => {
      const content = 'type UserService struct {\n\tdb *sql.DB\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'UserService' && d.type === 'struct'));
    });

    it('extracts interface definitions', () => {
      const content = 'type Repository interface {\n\tFind(id int) (*Entity, error)\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Repository' && d.type === 'interface'));
    });

    it('extracts type aliases', () => {
      const content = 'type ID = int64';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'ID' && d.type === 'type'));
    });

    it('extracts const and var', () => {
      const content = 'const MaxRetries = 3\nvar ErrNotFound = errors.New("not found")';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'MaxRetries' && d.type === 'const'));
      assert.ok(defs.find(d => d.name === 'ErrNotFound' && d.type === 'var'));
    });

    it('includes line numbers', () => {
      const content = 'package main\n\nfunc main() {\n}';
      const defs = ext.extractDefinitions(content);
      assert.strictEqual(defs.find(d => d.name === 'main').line, 3);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/extractors/go.test.js`
Expected: FAIL — module `../../extractors/go` not found.

---

### Task 7: Go extractor — implementation

**Files:**
- Create: `hippocampus/extractors/go.js`

- [ ] **Step 1: Write Go extractor**

Create `hippocampus/extractors/go.js`:

```js
'use strict';

const GO_KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
  'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
  'var', 'nil', 'true', 'false', 'iota',
  // Predeclared types and builtins — filtered to reduce noise
  'bool', 'byte', 'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8',
  'uint16', 'uint32', 'uint64', 'float32', 'float64', 'complex64', 'complex128',
  'string', 'error', 'rune', 'uintptr', 'append', 'cap', 'close', 'copy',
  'delete', 'len', 'make', 'new', 'panic', 'print', 'println', 'recover',
  'any', 'comparable',
]);

const MIN_IDENTIFIER_LENGTH = 3;

function extractImports(filePath, content) {
  const imports = [];

  // Single import: import "path" or import alias "path"
  const singlePattern = /import\s+(?:\w+\s+)?"([^"]+)"/g;
  let match;
  while ((match = singlePattern.exec(content)) !== null) {
    if (match[1].includes('.')) imports.push(match[1]);
  }

  // Block import: import ( "path1" \n "path2" )
  const blockPattern = /import\s*\(([^)]+)\)/gs;
  while ((match = blockPattern.exec(content)) !== null) {
    const block = match[1];
    const linePattern = /(?:\w+\s+)?"([^"]+)"/g;
    let lineMatch;
    while ((lineMatch = linePattern.exec(block)) !== null) {
      if (lineMatch[1].includes('.')) imports.push(lineMatch[1]);
    }
  }

  return [...new Set(imports)];
}

function extractExports(filePath, content) {
  const exports_ = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Package-level exported functions (uppercase, no receiver)
    const funcMatch = trimmed.match(/^func\s+([A-Z]\w*)\s*\(/);
    if (funcMatch) { exports_.push(funcMatch[1]); continue; }

    // Exported types: type Name struct/interface
    const typeMatch = trimmed.match(/^type\s+([A-Z]\w*)\s+/);
    if (typeMatch) { exports_.push(typeMatch[1]); continue; }

    // Exported var/const
    const varMatch = trimmed.match(/^(?:var|const)\s+([A-Z]\w*)/);
    if (varMatch) { exports_.push(varMatch[1]); continue; }
  }

  return exports_;
}

function extractRoutes(filePath, content) {
  const routes = [];
  let match;

  // Chi/Gorilla/Gin: r.Get("/path", ...), r.POST("/path", ...) — case-insensitive method
  const routerPattern = /\w+\.(Get|Post|Put|Delete|Patch|GET|POST|PUT|DELETE|PATCH)\(\s*"([^"]+)"/g;
  while ((match = routerPattern.exec(content)) !== null) {
    routes.push(match[1].toUpperCase() + ' ' + match[2]);
  }

  // net/http: http.HandleFunc("/path", ...) or r.HandleFunc("/path", ...)
  const handleFuncPattern = /\w+\.HandleFunc\(\s*"([^"]+)"/g;
  while ((match = handleFuncPattern.exec(content)) !== null) {
    routes.push('ROUTE ' + match[1]);
  }

  // r.Handle("/path", ...)
  const handlePattern = /\w+\.Handle\(\s*"([^"]+)"/g;
  while ((match = handlePattern.exec(content)) !== null) {
    routes.push('ROUTE ' + match[1]);
  }

  return routes;
}

function extractIdentifiers(line, lineNumber) {
  const seen = new Set();
  const results = [];
  const pattern = /[a-zA-Z_]\w*/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const term = match[0];
    if (term.length < MIN_IDENTIFIER_LENGTH) continue;
    if (GO_KEYWORDS.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    results.push({ term, line: lineNumber });
  }
  return results;
}

function extractDefinitions(content) {
  const lines = content.split('\n');
  const defs = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Package-level function: func Name(
    const funcMatch = trimmed.match(/^func\s+(\w+)\s*\(/);
    if (funcMatch) { defs.push({ name: funcMatch[1], type: 'function', line: i + 1 }); continue; }

    // Receiver method: func (recv) Name(
    const methodMatch = trimmed.match(/^func\s*\([^)]*\)\s*(\w+)\s*\(/);
    if (methodMatch) { defs.push({ name: methodMatch[1], type: 'method', line: i + 1 }); continue; }

    // Type definitions: type Name struct/interface/other
    const typeStructMatch = trimmed.match(/^type\s+(\w+)\s+struct\b/);
    if (typeStructMatch) { defs.push({ name: typeStructMatch[1], type: 'struct', line: i + 1 }); continue; }

    const typeIfaceMatch = trimmed.match(/^type\s+(\w+)\s+interface\b/);
    if (typeIfaceMatch) { defs.push({ name: typeIfaceMatch[1], type: 'interface', line: i + 1 }); continue; }

    // type Name = ... or type Name SomeType (alias or defined type)
    const typeOtherMatch = trimmed.match(/^type\s+(\w+)\s+/);
    if (typeOtherMatch) { defs.push({ name: typeOtherMatch[1], type: 'type', line: i + 1 }); continue; }

    // Top-level const/var
    const constMatch = trimmed.match(/^const\s+(\w+)/);
    if (constMatch) { defs.push({ name: constMatch[1], type: 'const', line: i + 1 }); continue; }

    const varMatch = trimmed.match(/^var\s+(\w+)/);
    if (varMatch) { defs.push({ name: varMatch[1], type: 'var', line: i + 1 }); continue; }
  }

  return defs;
}

module.exports = {
  extensions: ['.go'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
```

- [ ] **Step 2: Run Go tests**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/extractors/go.test.js`
Expected: All tests pass.

- [ ] **Step 3: Commit**

Ready to commit. Run `npm run commit` from `/websites/`.
Message: "feat(hippocampus): add Go extractor"

---

## Chunk 4: Rust Extractor + Regression

### Task 8: Rust extractor — tests

**Files:**
- Create: `hippocampus/test/extractors/rust.test.js`

- [ ] **Step 1: Write Rust extractor test file**

Create `hippocampus/test/extractors/rust.test.js`:

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('rust extractor', () => {
  const ext = require('../../extractors/rust');

  describe('extensions', () => {
    it('claims .rs', () => {
      assert.deepStrictEqual(ext.extensions, ['.rs']);
    });
  });

  describe('extractImports', () => {
    it('extracts crate-local use statements', () => {
      const content = 'use crate::services::user;\nuse crate::models::User;';
      const result = ext.extractImports('main.rs', content);
      assert.ok(result.includes('crate::services::user'));
      assert.ok(result.includes('crate::models::User'));
    });

    it('extracts super imports', () => {
      const content = 'use super::models::User;';
      const result = ext.extractImports('handler.rs', content);
      assert.ok(result.includes('super::models::User'));
    });

    it('extracts super imports with braces (captures base path)', () => {
      const content = 'use super::models::{User, Role};';
      const result = ext.extractImports('handler.rs', content);
      assert.ok(result.includes('super::models'));
    });

    it('extracts crate imports with braces (captures base path)', () => {
      const content = 'use crate::models::{User, Role};';
      const result = ext.extractImports('main.rs', content);
      assert.ok(result.includes('crate::models'));
    });

    it('extracts mod declarations', () => {
      const content = 'mod services;\nmod models;';
      const result = ext.extractImports('lib.rs', content);
      assert.ok(result.includes('services'));
      assert.ok(result.includes('models'));
    });

    it('skips std/core/alloc imports', () => {
      const content = 'use std::collections::HashMap;\nuse core::fmt;\nuse alloc::vec::Vec;';
      const result = ext.extractImports('main.rs', content);
      assert.strictEqual(result.length, 0);
    });

    it('deduplicates', () => {
      const content = 'use crate::models::User;\nuse crate::models::User;';
      const result = ext.extractImports('main.rs', content);
      assert.strictEqual(result.length, 1);
    });
  });

  describe('extractExports', () => {
    it('extracts pub fn', () => {
      const content = 'pub fn create_user(db: &Pool) -> User {\n}';
      const result = ext.extractExports('lib.rs', content);
      assert.ok(result.includes('create_user'));
    });

    it('extracts pub struct', () => {
      const content = 'pub struct UserService {\n    db: Pool,\n}';
      const result = ext.extractExports('lib.rs', content);
      assert.ok(result.includes('UserService'));
    });

    it('extracts pub enum', () => {
      const content = 'pub enum Status {\n    Active,\n    Inactive,\n}';
      const result = ext.extractExports('lib.rs', content);
      assert.ok(result.includes('Status'));
    });

    it('extracts pub trait', () => {
      const content = 'pub trait Repository {\n    fn find(&self, id: i64) -> Option<Entity>;\n}';
      const result = ext.extractExports('lib.rs', content);
      assert.ok(result.includes('Repository'));
    });

    it('extracts pub type, pub mod, pub const, pub static', () => {
      const content = 'pub type Result<T> = std::result::Result<T, Error>;\npub mod services;\npub const MAX_RETRIES: u32 = 3;\npub static GLOBAL: Mutex<State> = Mutex::new(State::new());';
      const result = ext.extractExports('lib.rs', content);
      assert.ok(result.includes('Result'));
      assert.ok(result.includes('services'));
      assert.ok(result.includes('MAX_RETRIES'));
      assert.ok(result.includes('GLOBAL'));
    });

    it('skips non-pub items', () => {
      const content = 'fn internal_helper() {\n}\nstruct PrivateData {\n}';
      const result = ext.extractExports('lib.rs', content);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('extractRoutes', () => {
    it('extracts Actix/Rocket attribute routes', () => {
      const content = '#[get("/api/users")]\nasync fn list_users() -> impl Responder {\n}';
      const result = ext.extractRoutes('handlers.rs', content);
      assert.ok(result.includes('GET /api/users'));
    });

    it('extracts post, put, delete, patch attributes', () => {
      const content = '#[post("/api/users")]\n#[put("/api/users/{id}")]\n#[delete("/api/users/{id}")]\n#[patch("/api/users/{id}")]';
      const result = ext.extractRoutes('handlers.rs', content);
      assert.ok(result.includes('POST /api/users'));
      assert.ok(result.includes('PUT /api/users/{id}'));
      assert.ok(result.includes('DELETE /api/users/{id}'));
      assert.ok(result.includes('PATCH /api/users/{id}'));
    });

    it('extracts Axum .route() patterns', () => {
      const content = '.route("/api/items", get(list_items))\n.route("/api/items", post(create_item))';
      const result = ext.extractRoutes('main.rs', content);
      assert.ok(result.includes('GET /api/items'));
      assert.ok(result.includes('POST /api/items'));
    });

    it('returns empty for non-route files', () => {
      const content = 'pub fn helper() -> i32 { 42 }';
      assert.deepStrictEqual(ext.extractRoutes('utils.rs', content), []);
    });
  });

  describe('extractIdentifiers', () => {
    it('extracts identifiers', () => {
      const result = ext.extractIdentifiers('let user_service = UserService::new(pool);', 1);
      const terms = result.map(r => r.term);
      assert.ok(terms.includes('user_service'));
      assert.ok(terms.includes('UserService'));
      assert.ok(terms.includes('pool'));
    });

    it('skips Rust keywords and common types', () => {
      const result = ext.extractIdentifiers('pub async fn impl struct let mut', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('pub'));
      assert.ok(!terms.includes('async'));
      assert.ok(!terms.includes('impl'));
      assert.ok(!terms.includes('struct'));
      assert.ok(!terms.includes('let'));
      assert.ok(!terms.includes('mut'));
    });

    it('skips short identifiers', () => {
      const result = ext.extractIdentifiers('let x = ab + cd;', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('x'));
      assert.ok(!terms.includes('ab'));
      assert.ok(!terms.includes('cd'));
    });

    it('includes line number', () => {
      const result = ext.extractIdentifiers('let user_service = init();', 5);
      assert.ok(result.find(r => r.term === 'user_service' && r.line === 5));
    });
  });

  describe('extractDefinitions', () => {
    it('extracts fn definitions', () => {
      const content = 'fn create_user(db: &Pool) -> User {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'create_user' && d.type === 'function'));
    });

    it('extracts pub fn definitions', () => {
      const content = 'pub fn create_user(db: &Pool) -> User {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'create_user' && d.type === 'function'));
    });

    it('extracts async fn definitions', () => {
      const content = 'pub async fn fetch_user(id: i64) -> User {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'fetch_user' && d.type === 'async_function'));
    });

    it('extracts struct definitions', () => {
      const content = 'pub struct UserService {\n    db: Pool,\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'UserService' && d.type === 'struct'));
    });

    it('extracts enum definitions', () => {
      const content = 'pub enum Status {\n    Active,\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Status' && d.type === 'enum'));
    });

    it('extracts trait definitions', () => {
      const content = 'pub trait Repository {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Repository' && d.type === 'trait'));
    });

    it('extracts impl blocks', () => {
      const content = 'impl UserService {\n}\nimpl Repository for UserService {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'UserService' && d.type === 'impl'));
      assert.ok(defs.find(d => d.name === 'Repository for UserService' && d.type === 'impl'));
    });

    it('extracts type, mod, const, static', () => {
      const content = 'pub type Result<T> = std::result::Result<T, Error>;\npub mod services;\npub const MAX_RETRIES: u32 = 3;\npub static GLOBAL: Mutex<State> = Mutex::new(State::new());';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Result' && d.type === 'type'));
      assert.ok(defs.find(d => d.name === 'services' && d.type === 'mod'));
      assert.ok(defs.find(d => d.name === 'MAX_RETRIES' && d.type === 'const'));
      assert.ok(defs.find(d => d.name === 'GLOBAL' && d.type === 'static'));
    });

    it('includes line numbers', () => {
      const content = 'use crate::models;\n\npub fn main() {\n}';
      const defs = ext.extractDefinitions(content);
      assert.strictEqual(defs.find(d => d.name === 'main').line, 3);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/extractors/rust.test.js`
Expected: FAIL — module `../../extractors/rust` not found.

---

### Task 9: Rust extractor — implementation

**Files:**
- Create: `hippocampus/extractors/rust.js`

- [ ] **Step 1: Write Rust extractor**

Create `hippocampus/extractors/rust.js`:

```js
'use strict';

const RUST_KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn',
  'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in',
  'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return',
  'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type',
  'union', 'unsafe', 'use', 'where', 'while', 'yield',
  // Predeclared types
  'bool', 'char', 'str', 'i8', 'i16', 'i32', 'i64', 'i128', 'isize',
  'u8', 'u16', 'u32', 'u64', 'u128', 'usize', 'f32', 'f64',
  // Common stdlib types and macros — filtered to reduce noise
  'String', 'Vec', 'Option', 'Result', 'Box', 'Some', 'None', 'Ok', 'Err',
  'println', 'eprintln', 'format', 'todo', 'unimplemented', 'unreachable',
  'assert', 'debug_assert', 'cfg',
]);

const MIN_IDENTIFIER_LENGTH = 3;

function extractImports(filePath, content) {
  const imports = [];
  let match;

  // use crate::path; or use crate::path::Name;
  const cratePattern = /use\s+(crate::\S+?)(?:::\{|;)/g;
  while ((match = cratePattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // use super::path; or use super::path::{items};
  const superPattern = /use\s+(super::\S+?)(?:::\{|;)/g;
  while ((match = superPattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // mod name; (not mod name { ... })
  const modPattern = /^mod\s+(\w+)\s*;/gm;
  while ((match = modPattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports.filter(i =>
    !i.startsWith('std::') && !i.startsWith('core::') && !i.startsWith('alloc::')
  ))];
}

function extractExports(filePath, content) {
  const exports_ = [];
  // pub fn/struct/enum/trait/type/mod/const/static Name
  const pattern = /pub(?:\(\w+\))?\s+(?:async\s+)?(?:unsafe\s+)?(?:fn|struct|enum|trait|type|mod|const|static)\s+(\w+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    exports_.push(match[1]);
  }
  return exports_;
}

function extractRoutes(filePath, content) {
  const routes = [];
  let match;

  // Actix/Rocket: #[get("/path")], #[post("/path")], etc.
  const attrPattern = /#\[(get|post|put|delete|patch)\("([^"]+)"\)\]/g;
  while ((match = attrPattern.exec(content)) !== null) {
    routes.push(match[1].toUpperCase() + ' ' + match[2]);
  }

  // Axum: .route("/path", get(handler))
  const axumPattern = /\.route\(\s*"([^"]+)"\s*,\s*(get|post|put|patch|delete)\s*\(/g;
  while ((match = axumPattern.exec(content)) !== null) {
    routes.push(match[2].toUpperCase() + ' ' + match[1]);
  }

  return routes;
}

function extractIdentifiers(line, lineNumber) {
  const seen = new Set();
  const results = [];
  const pattern = /[a-zA-Z_]\w*/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const term = match[0];
    if (term.length < MIN_IDENTIFIER_LENGTH) continue;
    if (RUST_KEYWORDS.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    results.push({ term, line: lineNumber });
  }
  return results;
}

function extractDefinitions(content) {
  const lines = content.split('\n');
  const defs = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // async fn — check before regular fn
    const asyncFnMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?async\s+(?:unsafe\s+)?fn\s+(\w+)/);
    if (asyncFnMatch) { defs.push({ name: asyncFnMatch[1], type: 'async_function', line: i + 1 }); continue; }

    // Regular fn (not async)
    const fnMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?(?:unsafe\s+)?fn\s+(\w+)/);
    if (fnMatch) { defs.push({ name: fnMatch[1], type: 'function', line: i + 1 }); continue; }

    // struct
    const structMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?struct\s+(\w+)/);
    if (structMatch) { defs.push({ name: structMatch[1], type: 'struct', line: i + 1 }); continue; }

    // enum
    const enumMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?enum\s+(\w+)/);
    if (enumMatch) { defs.push({ name: enumMatch[1], type: 'enum', line: i + 1 }); continue; }

    // trait
    const traitMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?trait\s+(\w+)/);
    if (traitMatch) { defs.push({ name: traitMatch[1], type: 'trait', line: i + 1 }); continue; }

    // impl Name or impl Trait for Name
    const implForMatch = trimmed.match(/^impl(?:<[^>]*>)?\s+(\w+)\s+for\s+(\w+)/);
    if (implForMatch) { defs.push({ name: implForMatch[1] + ' for ' + implForMatch[2], type: 'impl', line: i + 1 }); continue; }

    const implMatch = trimmed.match(/^impl(?:<[^>]*>)?\s+(\w+)/);
    if (implMatch) { defs.push({ name: implMatch[1], type: 'impl', line: i + 1 }); continue; }

    // type
    const typeMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?type\s+(\w+)/);
    if (typeMatch) { defs.push({ name: typeMatch[1], type: 'type', line: i + 1 }); continue; }

    // mod
    const modMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?mod\s+(\w+)/);
    if (modMatch) { defs.push({ name: modMatch[1], type: 'mod', line: i + 1 }); continue; }

    // const
    const constMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?const\s+(\w+)/);
    if (constMatch) { defs.push({ name: constMatch[1], type: 'const', line: i + 1 }); continue; }

    // static
    const staticMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?static\s+(?:mut\s+)?(\w+)/);
    if (staticMatch) { defs.push({ name: staticMatch[1], type: 'static', line: i + 1 }); continue; }
  }

  return defs;
}

module.exports = {
  extensions: ['.rs'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
```

- [ ] **Step 2: Run Rust tests**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/extractors/rust.test.js`
Expected: All tests pass.

- [ ] **Step 3: Commit**

Ready to commit. Run `npm run commit` from `/websites/`.
Message: "feat(hippocampus): add Rust extractor"

---

### Task 10: Full regression test

- [ ] **Step 1: Run ALL extractor tests**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/extractors/*.test.js`
Expected: All tests pass across all extractor test files (js, ts, python, css, csharp, java, go, rust).

- [ ] **Step 2: Run file-collector tests**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/file-collector.test.js`
Expected: All tests pass.

- [ ] **Step 3: Run full hippocampus test suite**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/*.test.js hippocampus/test/extractors/*.test.js`
Expected: All tests pass with no regressions.

- [ ] **Step 4: Verify registry auto-discovery**

Run: `cd /home/sonderbread/websites/thebrain-package && node -e "const {loadExtractors} = require('./hippocampus/lib/extractor-registry'); const r = loadExtractors('./hippocampus/extractors'); console.log('Extensions:', [...r.allExtensions].sort().join(', ')); console.log('Extractors:', r.extractors.length)"`
Expected output should include `.cs`, `.go`, `.java`, `.rs` alongside existing extensions, and show 9 total extractors.
