'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('svelte extractor', () => {
  const ext = require('../../extractors/svelte');

  it('claims .svelte extension', () => {
    assert.deepStrictEqual(ext.extensions, ['.svelte']);
  });

  describe('extractImports', () => {
    it('extracts relative imports from script block', () => {
      const content = `<script>
  import Sidebar from './Sidebar.svelte';
  import { getData } from '../lib/api.js';
</script>`;
      const result = ext.extractImports('App.svelte', content);
      assert.ok(result.includes('./Sidebar.svelte'));
      assert.ok(result.includes('../lib/api.js'));
    });

    it('skips npm package imports', () => {
      const content = `<script>
  import { writable } from 'svelte/store';
  import confetti from 'canvas-confetti';
  import Local from './Local.svelte';
</script>`;
      const result = ext.extractImports('App.svelte', content);
      assert.strictEqual(result.length, 1);
      assert.ok(result.includes('./Local.svelte'));
    });

    it('returns empty for files with no script section', () => {
      const content = `<div>Hello world</div>`;
      const result = ext.extractImports('Static.svelte', content);
      assert.deepStrictEqual(result, []);
    });

    it('returns empty for empty files', () => {
      const result = ext.extractImports('Empty.svelte', '');
      assert.deepStrictEqual(result, []);
    });
  });

  describe('extractExports', () => {
    it('extracts component name from filename', () => {
      const content = `<script>let count = 0;</script>`;
      const result = ext.extractExports('components/Sidebar.svelte', content);
      assert.ok(result.includes('Sidebar'));
    });

    it('extracts props from $props() destructuring', () => {
      const content = `<script>
  let { title, isOpen, onClose } = $props();
</script>`;
      const result = ext.extractExports('Modal.svelte', content);
      assert.ok(result.includes('Modal'));
      assert.ok(result.includes('prop:title'));
      assert.ok(result.includes('prop:isOpen'));
      assert.ok(result.includes('prop:onClose'));
    });

    it('extracts props with defaults', () => {
      const content = `<script>
  let { size = 'md', variant = 'primary' } = $props();
</script>`;
      const result = ext.extractExports('Button.svelte', content);
      assert.ok(result.includes('prop:size'));
      assert.ok(result.includes('prop:variant'));
    });

    it('handles empty file', () => {
      const result = ext.extractExports('Empty.svelte', '');
      assert.ok(result.includes('Empty'));
    });
  });

  describe('extractRoutes', () => {
    it('returns empty array for svelte files', () => {
      const content = `<script>let x = 1;</script>`;
      assert.deepStrictEqual(ext.extractRoutes('App.svelte', content), []);
    });
  });

  describe('extractIdentifiers', () => {
    it('extracts identifiers from a line', () => {
      const result = ext.extractIdentifiers('let { title, isOpen } = $props();', 5);
      const terms = result.map(r => r.term);
      assert.ok(terms.includes('title'));
      assert.ok(terms.includes('isOpen'));
      assert.ok(terms.includes('$props'));
    });

    it('skips short identifiers and svelte keywords', () => {
      const result = ext.extractIdentifiers('if (ok) { let x = true; }', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('if'));
      assert.ok(!terms.includes('let'));
      assert.ok(!terms.includes('true'));
      assert.ok(!terms.includes('ok'));
      assert.ok(!terms.includes('x'));
    });

    it('includes line number in results', () => {
      const result = ext.extractIdentifiers('function handleClick() {}', 10);
      const entry = result.find(r => r.term === 'handleClick');
      assert.ok(entry);
      assert.strictEqual(entry.line, 10);
    });
  });

  describe('extractDefinitions', () => {
    it('extracts function definitions with line numbers', () => {
      const content = `<script>
  function handleClick() {
    console.log('clicked');
  }

  async function fetchData() {
    return await fetch('/api');
  }
</script>`;
      const defs = ext.extractDefinitions(content);
      const handleClick = defs.find(d => d.name === 'handleClick' && d.type === 'function');
      assert.ok(handleClick);
      assert.strictEqual(handleClick.line, 2);

      const fetchData = defs.find(d => d.name === 'fetchData' && d.type === 'function');
      assert.ok(fetchData);
      assert.strictEqual(fetchData.line, 6);
    });

    it('extracts $derived declarations', () => {
      const content = `<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
  let formatted = $derived.by(() => {
    return count.toFixed(2);
  });
</script>`;
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'doubled' && d.type === 'derived'));
      assert.ok(defs.find(d => d.name === 'formatted' && d.type === 'derived'));
    });

    it('extracts $state declarations', () => {
      const content = `<script>
  let count = $state(0);
  let items = $state([]);
</script>`;
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'count' && d.type === 'state'));
      assert.ok(defs.find(d => d.name === 'items' && d.type === 'state'));
    });

    it('extracts $effect usage', () => {
      const content = `<script>
  let count = $state(0);
  $effect(() => {
    console.log(count);
  });
</script>`;
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === '$effect' && d.type === 'effect'));
    });

    it('extracts props from $props() destructuring', () => {
      const content = `<script>
  let { name, age } = $props();
</script>`;
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'name' && d.type === 'prop'));
      assert.ok(defs.find(d => d.name === 'age' && d.type === 'prop'));
    });

    it('handles files with no script section', () => {
      const content = `<div>Just markup</div>`;
      const defs = ext.extractDefinitions(content);
      assert.strictEqual(defs.length, 0);
    });

    it('handles empty files', () => {
      const defs = ext.extractDefinitions('');
      assert.strictEqual(defs.length, 0);
    });

    it('extracts arrow function definitions', () => {
      const content = `<script>
  const toggle = () => { open = !open; };
  const greet = async (name) => { return 'hi ' + name; };
</script>`;
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'toggle' && d.type === 'arrow'));
      assert.ok(defs.find(d => d.name === 'greet' && d.type === 'arrow'));
    });
  });
});
