const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('extractIdentifiers', () => {
  let extractIdentifiers;

  before(() => {
    ({ extractIdentifiers } = require('../lib/extractor'));
  });

  it('extracts JS identifiers from a line', () => {
    const result = extractIdentifiers('const name = myEscapeFn(userInput);', 1);
    const terms = result.map(r => r.term);
    assert.ok(terms.includes('myEscapeFn'));
    assert.ok(terms.includes('userInput'));
    assert.ok(terms.includes('name'));
  });

  it('skips JS keywords', () => {
    const result = extractIdentifiers('const x = function() { return true; }', 1);
    const terms = result.map(r => r.term);
    assert.ok(!terms.includes('const'));
    assert.ok(!terms.includes('function'));
    assert.ok(!terms.includes('return'));
    assert.ok(!terms.includes('true'));
  });

  it('skips short identifiers (1-2 chars)', () => {
    const result = extractIdentifiers('const a = b + cd;', 1);
    const terms = result.map(r => r.term);
    assert.ok(!terms.includes('a'));
    assert.ok(!terms.includes('b'));
    assert.ok(!terms.includes('cd'));
  });

  it('extracts from require/import lines', () => {
    const result = extractIdentifiers("const { myHelper, myFormatter } = require('../../_shared/server-utils');", 5);
    const terms = result.map(r => r.term);
    assert.ok(terms.includes('myHelper'));
    assert.ok(terms.includes('myFormatter'));
    assert.ok(result.find(r => r.term === 'myHelper').line === 5);
  });

  it('extracts CSS class names', () => {
    const result = extractIdentifiers('.btn-primary {', 1, 'css');
    const terms = result.map(r => r.term);
    assert.ok(terms.includes('btn-primary'));
  });

  it('extracts CSS custom properties', () => {
    const result = extractIdentifiers('  --primary-light: #fff;', 3, 'css');
    const terms = result.map(r => r.term);
    assert.ok(terms.includes('--primary-light'));
  });

  it('deduplicates terms on the same line', () => {
    const result = extractIdentifiers('myFn(myFn(x))', 1);
    const count = result.filter(r => r.term === 'myFn').length;
    assert.strictEqual(count, 1);
  });

  it('handles HTML with embedded script', () => {
    const content = '<html>\n<script>\nfunction init() { console.log("hi"); }\n</script>\n</html>';
    const result = extractIdentifiers(content.split('\n')[2], 3, 'html');
    const terms = result.map(r => r.term);
    assert.ok(terms.includes('init'));
  });
});

describe('extractDefinitions', () => {
  let extractDefinitions;

  before(() => {
    ({ extractDefinitions } = require('../lib/extractor'));
  });

  it('extracts function declarations', () => {
    const defs = extractDefinitions('function getName() {\n  return "hi";\n}\n', 'js');
    assert.ok(defs.find(d => d.name === 'getName' && d.type === 'function' && d.line === 1));
  });

  it('extracts arrow functions', () => {
    const defs = extractDefinitions('const handleClick = (e) => {\n};\n', 'js');
    assert.ok(defs.find(d => d.name === 'handleClick' && d.type === 'arrow' && d.line === 1));
  });

  it('extracts async functions', () => {
    const defs = extractDefinitions('async function fetchData() {\n}\n', 'js');
    assert.ok(defs.find(d => d.name === 'fetchData' && d.type === 'function' && d.line === 1));
  });

  it('extracts class declarations', () => {
    const defs = extractDefinitions('class UserModel {\n  constructor() {}\n}\n', 'js');
    assert.ok(defs.find(d => d.name === 'UserModel' && d.type === 'class' && d.line === 1));
  });

  it('extracts class methods', () => {
    const defs = extractDefinitions('class Foo {\n  bar() {\n  }\n  async baz(x) {\n  }\n}\n', 'js');
    assert.ok(defs.find(d => d.name === 'bar' && d.type === 'method' && d.line === 2));
    assert.ok(defs.find(d => d.name === 'baz' && d.type === 'method' && d.line === 4));
  });

  it('does not extract if/for/while as methods', () => {
    const defs = extractDefinitions('class Foo {\n  bar() {\n    if (x) {\n    }\n    for (i) {\n    }\n  }\n}\n', 'js');
    const names = defs.map(d => d.name);
    assert.ok(!names.includes('if'));
    assert.ok(!names.includes('for'));
    assert.ok(names.includes('bar'));
  });

  it('extracts function expressions', () => {
    const defs = extractDefinitions('const helper = function() {\n};\n', 'js');
    assert.ok(defs.find(d => d.name === 'helper' && d.type === 'function' && d.line === 1));
  });

  it('extracts CSS class selectors', () => {
    const defs = extractDefinitions('.btn-primary {\n  color: red;\n}\n', 'css');
    assert.ok(defs.find(d => d.name === 'btn-primary' && d.type === 'css_class' && d.line === 1));
  });

  it('extracts CSS custom properties', () => {
    const defs = extractDefinitions(':root {\n  --primary-light: #fff;\n}\n', 'css');
    assert.ok(defs.find(d => d.name === '--primary-light' && d.type === 'css_var' && d.line === 2));
  });

  it('extracts multiple definitions with correct line numbers', () => {
    const code = 'const a = 1;\nfunction foo() {}\n\nconst bar = () => {};\nclass Baz {}\n';
    const defs = extractDefinitions(code, 'js');
    assert.ok(defs.find(d => d.name === 'foo' && d.line === 2));
    assert.ok(defs.find(d => d.name === 'bar' && d.line === 4));
    assert.ok(defs.find(d => d.name === 'Baz' && d.line === 5));
  });
});
