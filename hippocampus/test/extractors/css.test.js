'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('css extractor', () => {
  const ext = require('../../extractors/css');

  it('claims .css extension', () => {
    assert.deepStrictEqual(ext.extensions, ['.css']);
  });

  it('extractImports finds @import statements', () => {
    const content = "@import url('./base.css');\n@import './theme.css';";
    const result = ext.extractImports('style.css', content);
    assert.ok(result.includes('./base.css'));
    assert.ok(result.includes('./theme.css'));
  });

  it('extractExports returns empty', () => {
    assert.deepStrictEqual(ext.extractExports('style.css', '.btn {}'), []);
  });

  it('extractRoutes returns empty', () => {
    assert.deepStrictEqual(ext.extractRoutes('style.css', '.btn {}'), []);
  });

  it('extractIdentifiers finds class names', () => {
    const result = ext.extractIdentifiers('.btn-primary { color: red; }', 1);
    assert.ok(result.find(r => r.term === 'btn-primary'));
  });

  it('extractIdentifiers finds CSS variables', () => {
    const result = ext.extractIdentifiers('  --primary-color: #333;', 5);
    assert.ok(result.find(r => r.term === '--primary-color' && r.line === 5));
  });

  it('extractDefinitions finds class selectors', () => {
    const content = ".btn-primary {\n  color: red;\n}\n.modal-content {\n  display: flex;\n}";
    const defs = ext.extractDefinitions(content);
    assert.ok(defs.find(d => d.name === 'btn-primary' && d.type === 'css_class'));
    assert.ok(defs.find(d => d.name === 'modal-content' && d.type === 'css_class'));
  });

  it('extractDefinitions finds CSS variable declarations', () => {
    const content = ":root {\n  --primary-color: #333;\n  --font-size: 16px;\n}";
    const defs = ext.extractDefinitions(content);
    assert.ok(defs.find(d => d.name === '--primary-color' && d.type === 'css_var'));
    assert.ok(defs.find(d => d.name === '--font-size' && d.type === 'css_var'));
  });
});
