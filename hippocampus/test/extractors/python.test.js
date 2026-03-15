'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('python extractor', () => {
  const ext = require('../../extractors/python');

  it('claims .py extension', () => {
    assert.deepStrictEqual(ext.extensions, ['.py']);
  });

  describe('extractImports', () => {
    it('extracts relative imports', () => {
      const content = "from . import utils\nfrom .lib import helper\nfrom ..core import base";
      const result = ext.extractImports('app.py', content);
      assert.ok(result.includes('.'));
      assert.ok(result.includes('.lib'));
      assert.ok(result.includes('..core'));
    });

    it('skips stdlib/pip imports', () => {
      const content = "import os\nimport sys\nfrom collections import OrderedDict";
      const result = ext.extractImports('app.py', content);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('extractExports', () => {
    it('extracts top-level function and class names', () => {
      const content = "def main():\n    pass\n\nclass App:\n    pass\n\n    def method(self):\n        pass";
      const result = ext.extractExports('app.py', content);
      assert.ok(result.includes('main'));
      assert.ok(result.includes('App'));
      assert.ok(!result.includes('method'));
    });
  });

  describe('extractRoutes', () => {
    it('extracts Flask routes', () => {
      const content = "@app.route('/api/users')\ndef users(): pass\n@app.route('/api/items', methods=['POST'])";
      const result = ext.extractRoutes('app.py', content);
      assert.ok(result.includes('ROUTE /api/users'));
      assert.ok(result.includes('ROUTE /api/items'));
    });

    it('extracts FastAPI routes', () => {
      const content = "@app.get('/items')\n@router.post('/users')";
      const result = ext.extractRoutes('app.py', content);
      assert.ok(result.includes('GET /items'));
      assert.ok(result.includes('POST /users'));
    });

    it('returns empty for non-route files', () => {
      const content = "def helper(): pass";
      assert.deepStrictEqual(ext.extractRoutes('utils.py', content), []);
    });
  });

  describe('extractIdentifiers', () => {
    it('extracts identifiers and skips Python keywords', () => {
      const result = ext.extractIdentifiers('def myFunction(self, arg_name):', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('def'));
      assert.ok(!terms.includes('self'));
      assert.ok(terms.includes('myFunction'));
      assert.ok(terms.includes('arg_name'));
    });
  });

  describe('extractDefinitions', () => {
    it('extracts function and class definitions', () => {
      const content = "def main():\n    pass\n\nasync def fetch():\n    pass\n\nclass App:\n    pass\n\nclass Router(Base):\n    pass";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'main' && d.type === 'function'));
      assert.ok(defs.find(d => d.name === 'fetch' && d.type === 'async_function'));
      assert.ok(defs.find(d => d.name === 'App' && d.type === 'class'));
      assert.ok(defs.find(d => d.name === 'Router' && d.type === 'class'));
    });

    it('includes line numbers', () => {
      const content = "x = 1\ndef foo():\n    pass";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'foo' && d.line === 2));
    });
  });
});
