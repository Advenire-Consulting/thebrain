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
