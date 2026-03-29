'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('rust extractor', () => {
  const ext = require('../../extractors/rust');

  describe('extensions', () => {
    it('claims .rs', () => {
      assert.deepStrictEqual(ext.extensions, ['.rs']);
    });
  });

  describe('extractImports', () => {
    it('extracts crate-local use statements', () => {
      const content = 'use crate::services::user;\nuse crate::models::User;';
      const result = ext.extractImports('main.rs', content);
      assert.ok(result.includes('crate::services::user'));
      assert.ok(result.includes('crate::models::User'));
    });

    it('extracts super imports', () => {
      const content = 'use super::models::User;';
      const result = ext.extractImports('handler.rs', content);
      assert.ok(result.includes('super::models::User'));
    });

    it('extracts super imports with braces (captures base path)', () => {
      const content = 'use super::models::{User, Role};';
      const result = ext.extractImports('handler.rs', content);
      assert.ok(result.includes('super::models'));
    });

    it('extracts crate imports with braces (captures base path)', () => {
      const content = 'use crate::models::{User, Role};';
      const result = ext.extractImports('main.rs', content);
      assert.ok(result.includes('crate::models'));
    });

    it('extracts mod declarations', () => {
      const content = 'mod services;\nmod models;';
      const result = ext.extractImports('lib.rs', content);
      assert.ok(result.includes('services'));
      assert.ok(result.includes('models'));
    });

    it('skips std/core/alloc imports', () => {
      const content = 'use std::collections::HashMap;\nuse core::fmt;\nuse alloc::vec::Vec;';
      const result = ext.extractImports('main.rs', content);
      assert.strictEqual(result.length, 0);
    });

    it('deduplicates', () => {
      const content = 'use crate::models::User;\nuse crate::models::User;';
      const result = ext.extractImports('main.rs', content);
      assert.strictEqual(result.length, 1);
    });
  });

  describe('extractExports', () => {
    it('extracts pub fn', () => {
      const content = 'pub fn create_user(db: &Pool) -> User {\n}';
      const result = ext.extractExports('lib.rs', content);
      assert.ok(result.includes('create_user'));
    });

    it('extracts pub struct', () => {
      const content = 'pub struct UserService {\n    db: Pool,\n}';
      const result = ext.extractExports('lib.rs', content);
      assert.ok(result.includes('UserService'));
    });

    it('extracts pub enum', () => {
      const content = 'pub enum Status {\n    Active,\n    Inactive,\n}';
      const result = ext.extractExports('lib.rs', content);
      assert.ok(result.includes('Status'));
    });

    it('extracts pub trait', () => {
      const content = 'pub trait Repository {\n    fn find(&self, id: i64) -> Option<Entity>;\n}';
      const result = ext.extractExports('lib.rs', content);
      assert.ok(result.includes('Repository'));
    });

    it('extracts pub type, pub mod, pub const, pub static', () => {
      const content = 'pub type Result<T> = std::result::Result<T, Error>;\npub mod services;\npub const MAX_RETRIES: u32 = 3;\npub static GLOBAL: Mutex<State> = Mutex::new(State::new());';
      const result = ext.extractExports('lib.rs', content);
      assert.ok(result.includes('Result'));
      assert.ok(result.includes('services'));
      assert.ok(result.includes('MAX_RETRIES'));
      assert.ok(result.includes('GLOBAL'));
    });

    it('skips non-pub items', () => {
      const content = 'fn internal_helper() {\n}\nstruct PrivateData {\n}';
      const result = ext.extractExports('lib.rs', content);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('extractRoutes', () => {
    it('extracts Actix/Rocket attribute routes', () => {
      const content = '#[get("/api/users")]\nasync fn list_users() -> impl Responder {\n}';
      const result = ext.extractRoutes('handlers.rs', content);
      assert.ok(result.includes('GET /api/users'));
    });

    it('extracts post, put, delete, patch attributes', () => {
      const content = '#[post("/api/users")]\n#[put("/api/users/{id}")]\n#[delete("/api/users/{id}")]\n#[patch("/api/users/{id}")]';
      const result = ext.extractRoutes('handlers.rs', content);
      assert.ok(result.includes('POST /api/users'));
      assert.ok(result.includes('PUT /api/users/{id}'));
      assert.ok(result.includes('DELETE /api/users/{id}'));
      assert.ok(result.includes('PATCH /api/users/{id}'));
    });

    it('extracts Axum .route() patterns', () => {
      const content = '.route("/api/items", get(list_items))\n.route("/api/items", post(create_item))';
      const result = ext.extractRoutes('main.rs', content);
      assert.ok(result.includes('GET /api/items'));
      assert.ok(result.includes('POST /api/items'));
    });

    it('returns empty for non-route files', () => {
      const content = 'pub fn helper() -> i32 { 42 }';
      assert.deepStrictEqual(ext.extractRoutes('utils.rs', content), []);
    });
  });

  describe('extractIdentifiers', () => {
    it('extracts identifiers', () => {
      const result = ext.extractIdentifiers('let user_service = UserService::new(pool);', 1);
      const terms = result.map(r => r.term);
      assert.ok(terms.includes('user_service'));
      assert.ok(terms.includes('UserService'));
      assert.ok(terms.includes('pool'));
    });

    it('skips Rust keywords and common types', () => {
      const result = ext.extractIdentifiers('pub async fn impl struct let mut', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('pub'));
      assert.ok(!terms.includes('async'));
      assert.ok(!terms.includes('impl'));
      assert.ok(!terms.includes('struct'));
      assert.ok(!terms.includes('let'));
      assert.ok(!terms.includes('mut'));
    });

    it('skips short identifiers', () => {
      const result = ext.extractIdentifiers('let x = ab + cd;', 1);
      const terms = result.map(r => r.term);
      assert.ok(!terms.includes('x'));
      assert.ok(!terms.includes('ab'));
      assert.ok(!terms.includes('cd'));
    });

    it('includes line number', () => {
      const result = ext.extractIdentifiers('let user_service = init();', 5);
      assert.ok(result.find(r => r.term === 'user_service' && r.line === 5));
    });
  });

  describe('extractDefinitions', () => {
    it('extracts fn definitions', () => {
      const content = 'fn create_user(db: &Pool) -> User {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'create_user' && d.type === 'function'));
    });

    it('extracts pub fn definitions', () => {
      const content = 'pub fn create_user(db: &Pool) -> User {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'create_user' && d.type === 'function'));
    });

    it('extracts async fn definitions', () => {
      const content = 'pub async fn fetch_user(id: i64) -> User {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'fetch_user' && d.type === 'async_function'));
    });

    it('extracts struct definitions', () => {
      const content = 'pub struct UserService {\n    db: Pool,\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'UserService' && d.type === 'struct'));
    });

    it('extracts enum definitions', () => {
      const content = 'pub enum Status {\n    Active,\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Status' && d.type === 'enum'));
    });

    it('extracts trait definitions', () => {
      const content = 'pub trait Repository {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Repository' && d.type === 'trait'));
    });

    it('extracts impl blocks', () => {
      const content = 'impl UserService {\n}\nimpl Repository for UserService {\n}';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'UserService' && d.type === 'impl'));
      assert.ok(defs.find(d => d.name === 'Repository for UserService' && d.type === 'impl'));
    });

    it('extracts type, mod, const, static', () => {
      const content = 'pub type Result<T> = std::result::Result<T, Error>;\npub mod services;\npub const MAX_RETRIES: u32 = 3;\npub static GLOBAL: Mutex<State> = Mutex::new(State::new());';
      const defs = ext.extractDefinitions(content);
      assert.ok(defs.find(d => d.name === 'Result' && d.type === 'type'));
      assert.ok(defs.find(d => d.name === 'services' && d.type === 'mod'));
      assert.ok(defs.find(d => d.name === 'MAX_RETRIES' && d.type === 'const'));
      assert.ok(defs.find(d => d.name === 'GLOBAL' && d.type === 'static'));
    });

    it('includes line numbers', () => {
      const content = 'use crate::models;\n\npub fn main() {\n}';
      const defs = ext.extractDefinitions(content);
      assert.strictEqual(defs.find(d => d.name === 'main').line, 3);
    });
  });
});
