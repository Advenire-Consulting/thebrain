'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('typescript extractor', () => {
  const ext = require('../../extractors/typescript');

  it('claims .ts and .tsx extensions', () => {
    assert.deepStrictEqual(ext.extensions, ['.ts', '.tsx']);
  });

  describe('extractImports', () => {
    it('extracts import...from (same as JS)', () => {
      const content = "import { foo } from './utils';";
      const result = ext.extractImports('app.ts', content);
      assert.ok(result.includes('./utils'));
    });

    it('extracts import type statements', () => {
      const content = "import type { Config } from './types';";
      const result = ext.extractImports('app.ts', content);
      assert.ok(result.includes('./types'));
    });

    it('extracts require() for compat', () => {
      const content = "const path = require('./helpers');";
      const result = ext.extractImports('app.ts', content);
      assert.ok(result.includes('./helpers'));
    });
  });

  describe('extractExports', () => {
    it('extracts export function/class/const/interface/type/enum', () => {
      const content = [
        "export function createApp() {}",
        "export class Router {}",
        "export const PORT = 3000;",
        "export interface Config {}",
        "export type Options = {};",
        "export enum Status { Active, Inactive }",
        "export default main;",
      ].join('\n');
      const result = ext.extractExports('app.ts', content);
      assert.ok(result.includes('createApp'));
      assert.ok(result.includes('Router'));
      assert.ok(result.includes('PORT'));
      assert.ok(result.includes('Config'));
      assert.ok(result.includes('Options'));
      assert.ok(result.includes('Status'));
      assert.ok(result.includes('main'));
    });
  });

  describe('extractDefinitions', () => {
    it('extracts JS definitions (function, class, arrow)', () => {
      const content = "function foo() {}\nclass Bar {}\nconst baz = () => {};";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'foo' && d.type === 'function'));
      assert.ok(defs.find(d => d.name === 'Bar' && d.type === 'class'));
      assert.ok(defs.find(d => d.name === 'baz' && d.type === 'arrow'));
    });

    it('extracts interface definitions', () => {
      const content = "interface Config {\n  port: number;\n}";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Config' && d.type === 'interface'));
    });

    it('extracts type aliases', () => {
      const content = "type Options = {\n  verbose: boolean;\n};";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Options' && d.type === 'type'));
    });

    it('extracts enums', () => {
      const content = "enum Status {\n  Active,\n  Inactive,\n}";
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Status' && d.type === 'enum'));
    });
  });
});
