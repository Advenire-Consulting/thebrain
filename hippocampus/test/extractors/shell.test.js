'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('shell extractor', () => {
  const ext = require('../../extractors/shell');

  it('claims .sh and .bash extensions', () => {
    assert.deepStrictEqual(ext.extensions, ['.sh', '.bash']);
  });

  describe('extractImports', () => {
    it('extracts source commands', () => {
      const content = "source ./lib/helpers.sh\n. ./config.sh";
      const result = ext.extractImports('setup.sh', content);
      assert.ok(result.includes('./lib/helpers.sh'));
      assert.ok(result.includes('./config.sh'));
    });

    it('skips non-relative source', () => {
      const content = "source /etc/profile\n. /usr/local/bin/env.sh";
      const result = ext.extractImports('setup.sh', content);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('extractExports', () => {
    it('extracts function definitions', () => {
      const content = "function setup_env() {\n  echo ok\n}\n\ncleanup() {\n  rm -f tmp\n}";
      const result = ext.extractExports('helpers.sh', content);
      assert.ok(result.includes('setup_env'));
      assert.ok(result.includes('cleanup'));
    });
  });

  it('extractRoutes returns empty', () => {
    assert.deepStrictEqual(ext.extractRoutes('script.sh', 'echo hi'), []);
  });

  describe('extractIdentifiers', () => {
    it('extracts variable names', () => {
      const result = ext.extractIdentifiers('MY_VAR="hello"', 1);
      const terms = result.map(r => r.term);
      assert.ok(terms.includes('MY_VAR'));
    });

    it('skips shell builtins', () => {
      const result = ext.extractIdentifiers('echo export local return', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('echo'));
      assert.ok(!terms.includes('export'));
      assert.ok(!terms.includes('local'));
    });
  });

  describe('extractDefinitions', () => {
    it('extracts function keyword style', () => {
      const content = "function setup_env() {\n  echo ok\n}";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'setup_env' && d.type === 'function'));
    });

    it('extracts shorthand style', () => {
      const content = "cleanup() {\n  rm -f tmp\n}";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'cleanup' && d.type === 'function'));
    });

    it('includes line numbers', () => {
      const content = "#!/bin/bash\nfunction foo() {\n  echo bar\n}";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'foo' && d.line === 2));
    });
  });
});
