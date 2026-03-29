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
});
