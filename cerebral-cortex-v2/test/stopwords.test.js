const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tokenize, filterLight, filterMedium, filterHeavy } = require('../lib/stopwords');

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric', () => {
    assert.deepStrictEqual(tokenize('Hello World!'), ['hello', 'world']);
  });

  it('preserves hyphenated terms', () => {
    assert.deepStrictEqual(tokenize('portal-nav.js'), ['portal-nav', 'js']);
  });

  it('preserves numbers', () => {
    assert.deepStrictEqual(tokenize('v2 port 3030'), ['v2', 'port', '3030']);
  });

  it('drops single characters', () => {
    assert.deepStrictEqual(tokenize('a b cd'), ['cd']);
  });
});

describe('filterLight', () => {
  it('removes standard English stopwords', () => {
    const tokens = ['the', 'burger', 'is', 'on', 'the', 'portal'];
    assert.deepStrictEqual(filterLight(tokens), ['burger', 'portal']);
  });

  it('keeps action verbs', () => {
    const tokens = ['add', 'fix', 'change', 'burger'];
    assert.deepStrictEqual(filterLight(tokens), ['add', 'fix', 'change', 'burger']);
  });
});

describe('filterMedium', () => {
  it('removes Claude filler words', () => {
    const tokens = ['certainly', 'let', 'me', 'look', 'at', 'burger'];
    assert.deepStrictEqual(filterMedium(tokens), ['look', 'burger']);
  });

  it('removes ubiquitous programming terms', () => {
    const tokens = ['file', 'code', 'function', 'error', 'burger', 'portal'];
    assert.deepStrictEqual(filterMedium(tokens), ['burger', 'portal']);
  });
});

describe('filterHeavy', () => {
  it('applies medium filter plus length filter', () => {
    const tokens = ['hi', 'ok', 'burger', 'portal', 'nav'];
    const result = filterHeavy(tokens);
    assert.ok(!result.includes('hi'));
    assert.ok(!result.includes('ok'));
    assert.ok(result.includes('burger'));
  });
});
