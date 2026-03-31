'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('javascript extractor', () => {
  const ext = require('../../extractors/javascript');

  describe('extensions', () => {
    it('claims .js, .mjs, .cjs', () => {
      assert.deepStrictEqual(ext.extensions, ['.js', '.mjs', '.cjs']);
    });
  });

  describe('extractImports', () => {
    it('extracts require() with relative paths', () => {
      const content = "const db = require('./database');\nconst auth = require('./auth');";
      const result = ext.extractImports('lib/server.js', content);
      assert.ok(result.includes('./database'));
      assert.ok(result.includes('./auth'));
    });

    it('extracts import...from with relative paths', () => {
      const content = "import { foo } from './utils';\nimport bar from '../lib/bar';";
      const result = ext.extractImports('app.mjs', content);
      assert.ok(result.includes('./utils'));
      assert.ok(result.includes('../lib/bar'));
    });

    it('skips node builtins', () => {
      const content = "const fs = require('fs');\nconst path = require('path');";
      const result = ext.extractImports('app.js', content);
      assert.strictEqual(result.length, 0);
    });

    it('skips npm packages', () => {
      const content = "const express = require('express');\nconst bcrypt = require('bcrypt');";
      const result = ext.extractImports('app.js', content);
      assert.strictEqual(result.length, 0);
    });

    it('deduplicates', () => {
      const content = "require('./db');\nrequire('./db');";
      const result = ext.extractImports('app.js', content);
      assert.strictEqual(result.length, 1);
    });
  });

  describe('extractExports', () => {
    it('extracts module.exports = { destructured }', () => {
      const content = "module.exports = { createApp, login };";
      const result = ext.extractExports('server.js', content);
      assert.ok(result.includes('createApp'));
      assert.ok(result.includes('login'));
    });

    it('extracts module.exports = identifier', () => {
      const content = "module.exports = createApp;";
      const result = ext.extractExports('server.js', content);
      assert.ok(result.includes('createApp'));
    });

    it('extracts exports.name assignments', () => {
      const content = "exports.foo = foo;\nexports.bar = bar;";
      const result = ext.extractExports('utils.js', content);
      assert.ok(result.includes('foo'));
      assert.ok(result.includes('bar'));
    });

    it('extracts ES module exports', () => {
      const content = "export function createApp() {}\nexport class Router {}\nexport default main;";
      const result = ext.extractExports('app.mjs', content);
      assert.ok(result.includes('createApp'));
      assert.ok(result.includes('Router'));
      assert.ok(result.includes('main'));
    });
  });

  describe('extractRoutes', () => {
    it('extracts Express route patterns', () => {
      const content = "router.get('/api/items', handler);\napp.post('/api/auth/login', handler);";
      const result = ext.extractRoutes('routes.js', content);
      assert.ok(result.includes('GET /api/items'));
      assert.ok(result.includes('POST /api/auth/login'));
    });

    it('returns empty for non-route files', () => {
      const content = "const x = 1;";
      const result = ext.extractRoutes('utils.js', content);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('extractIdentifiers', () => {
    it('extracts word-like identifiers', () => {
      const result = ext.extractIdentifiers('const myVar = createApp()', 1);
      const terms = result.map(r => r.term);
      assert.ok(terms.includes('myVar'));
      assert.ok(terms.includes('createApp'));
    });

    it('skips JS keywords', () => {
      const result = ext.extractIdentifiers('const function return async', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('const'));
      assert.ok(!terms.includes('function'));
      assert.ok(!terms.includes('return'));
    });

    it('skips short identifiers (< 3 chars)', () => {
      const result = ext.extractIdentifiers('const a = b + cd', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('a'));
      assert.ok(!terms.includes('b'));
      assert.ok(!terms.includes('cd'));
    });

    it('includes line number', () => {
      const result = ext.extractIdentifiers('const myVar = 1', 42);
      assert.ok(result.find(r => r.term === 'myVar' && r.line === 42));
    });
  });

  describe('extractNpmImports', () => {
    it('extracts npm package requires', () => {
      const content = "const express = require('express');\nconst db = require('better-sqlite3');";
      const result = ext.extractNpmImports('app.js', content);
      assert.deepStrictEqual(result, ['express', 'better-sqlite3']);
    });

    it('excludes relative imports', () => {
      const content = "const db = require('./db');\nconst utils = require('../lib/utils');";
      const result = ext.extractNpmImports('app.js', content);
      assert.deepStrictEqual(result, []);
    });

    it('excludes Node builtins', () => {
      const content = "const fs = require('fs');\nconst path = require('path');\nconst test = require('node:test');";
      const result = ext.extractNpmImports('app.js', content);
      assert.deepStrictEqual(result, []);
    });

    it('excludes all node: prefixed modules', () => {
      const content = "const tp = require('node:timers/promises');\nconst rl = require('node:readline/promises');";
      const result = ext.extractNpmImports('app.js', content);
      assert.deepStrictEqual(result, []);
    });

    it('handles ES import syntax', () => {
      const content = "import express from 'express';\nimport { Pool } from 'pg';";
      const result = ext.extractNpmImports('app.js', content);
      assert.deepStrictEqual(result, ['express', 'pg']);
    });

    it('handles scoped packages', () => {
      const content = "const sdk = require('@anthropic-ai/sdk');";
      const result = ext.extractNpmImports('app.js', content);
      assert.deepStrictEqual(result, ['@anthropic-ai/sdk']);
    });

    it('deduplicates', () => {
      const content = "const a = require('express');\nconst b = require('express');";
      const result = ext.extractNpmImports('app.js', content);
      assert.deepStrictEqual(result, ['express']);
    });
  });

  describe('extractDefinitions', () => {
    it('extracts function declarations', () => {
      const content = "function createApp() {\n  return {};\n}";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'createApp' && d.type === 'function'));
    });

    it('extracts async function declarations', () => {
      const content = "async function login() {}";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'login' && d.type === 'function'));
    });

    it('extracts class declarations', () => {
      const content = "class Router {\n  handle() {}\n}";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Router' && d.type === 'class'));
      assert.ok(defs.find(d => d.name === 'handle' && d.type === 'method'));
    });

    it('extracts arrow functions', () => {
      const content = "const handler = (req, res) => {};";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'handler' && d.type === 'arrow'));
    });

    it('extracts function expressions', () => {
      const content = "const validate = function(input) {};";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'validate' && d.type === 'function'));
    });

    it('includes line numbers', () => {
      const content = "const x = 1;\nfunction foo() {}";
      const defs = ext.extractDefinitions(content);
      const foo = defs.find(d => d.name === 'foo');
      assert.ok(foo);
      assert.strictEqual(foo.line, 2);
    });
  });
});
