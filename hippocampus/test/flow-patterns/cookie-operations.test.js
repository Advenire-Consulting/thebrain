'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('cookie-operations pattern', () => {
  let extractor;

  before(() => {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('flow-extractors/javascript')) delete require.cache[key];
    }
    extractor = require('../../flow-extractors/javascript/index');
  });

  const ctx = { project: 'test', projectRoot: '/tmp' };

  it('extracts res.cookie() as sets_cookie edge', () => {
    const code = `res.cookie('session_token', token, { httpOnly: true });`;
    const result = extractor.extract('auth.js', code, ctx);
    const edge = result.edges.find(e => e.type === 'sets_cookie');
    assert.ok(edge, 'Should have sets_cookie edge');
    assert.strictEqual(edge.data.cookieName, 'session_token');
  });

  it('extracts res.clearCookie() as sets_cookie with clear operation', () => {
    const code = `res.clearCookie('session_token', opts);`;
    const result = extractor.extract('logout.js', code, ctx);
    const edge = result.edges.find(e => e.type === 'sets_cookie');
    assert.ok(edge, 'Should have sets_cookie edge');
    assert.strictEqual(edge.data.operation, 'clear');
  });

  it('extracts req.cookies.x as reads_cookie edge', () => {
    const code = `const token = req.cookies.runtime_session;`;
    const result = extractor.extract('check.js', code, ctx);
    const edge = result.edges.find(e => e.type === 'reads_cookie');
    assert.ok(edge, 'Should have reads_cookie edge');
    assert.strictEqual(edge.data.cookieName, 'runtime_session');
  });
});
