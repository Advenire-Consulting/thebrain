'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('sql-operations pattern', () => {
  let extractor;

  before(() => {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('flow-extractors/javascript')) delete require.cache[key];
    }
    extractor = require('../../flow-extractors/javascript/index');
  });

  const ctx = { project: 'test', projectRoot: '/tmp' };

  it('extracts SELECT with table and columns', () => {
    const code = "db.prepare('SELECT id, slug FROM companies WHERE slug = ?').get(slug);";
    const result = extractor.extract('query.js', code, ctx);
    const table = result.nodes.find(n => n.type === 'table' && n.name === 'companies');
    assert.ok(table, 'Should find companies table node');
    const edge = result.edges.find(e => e.type === 'queries_table');
    assert.ok(edge, 'Should have queries_table edge');
  });

  it('extracts INSERT as mutates_table', () => {
    const code = "db.prepare('INSERT INTO bookings (name, date) VALUES (?, ?)').run(name, date);";
    const result = extractor.extract('insert.js', code, ctx);
    const edge = result.edges.find(e => e.type === 'mutates_table');
    assert.ok(edge, 'Should have mutates_table edge');
    assert.ok(result.nodes.find(n => n.name === 'bookings'));
  });

  it('extracts UPDATE as mutates_table', () => {
    const code = "db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id);";
    const result = extractor.extract('update.js', code, ctx);
    const edge = result.edges.find(e => e.type === 'mutates_table');
    assert.ok(edge, 'Should have mutates_table edge');
    assert.ok(result.nodes.find(n => n.name === 'users'));
  });

  it('extracts DELETE as mutates_table', () => {
    const code = "db.prepare('DELETE FROM sessions WHERE expired = 1').run();";
    const result = extractor.extract('delete.js', code, ctx);
    assert.ok(result.edges.find(e => e.type === 'mutates_table'));
    assert.ok(result.nodes.find(n => n.name === 'sessions'));
  });

  it('extracts CREATE TABLE', () => {
    const code = "db.prepare('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY)').run();";
    const result = extractor.extract('schema.js', code, ctx);
    assert.ok(result.nodes.find(n => n.name === 'items'));
    assert.ok(result.edges.find(e => e.type === 'mutates_table'));
  });

  it('extracts JOIN table — at least primary table', () => {
    const code = "db.prepare('SELECT c.id, c.slug FROM companies c JOIN tools t ON c.id = t.company_id').all();";
    const result = extractor.extract('join.js', code, ctx);
    assert.ok(result.nodes.find(n => n.name === 'companies'), 'Should find primary table');
  });
});
