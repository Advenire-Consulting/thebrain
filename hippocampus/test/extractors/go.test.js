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
