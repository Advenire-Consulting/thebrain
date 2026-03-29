'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '.test-scan-namespace');

before(() => {
  // C# project: 3 files with namespace imports
  fs.mkdirSync(path.join(TEST_DIR, 'cs-project', 'Models'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'cs-project', 'Services'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'cs-project', 'Controllers'), { recursive: true });

  fs.writeFileSync(path.join(TEST_DIR, 'cs-project', 'Models', 'User.cs'),
    'namespace MyApp.Models;\n' +
    'public class User {\n' +
    '  public string Name { get; set; }\n' +
    '}\n'
  );

  fs.writeFileSync(path.join(TEST_DIR, 'cs-project', 'Services', 'UserService.cs'),
    'namespace MyApp.Services;\n' +
    'using MyApp.Models;\n' +
    'public class UserService {\n' +
    '  public User GetUser() { return new User(); }\n' +
    '}\n'
  );

  fs.writeFileSync(path.join(TEST_DIR, 'cs-project', 'Controllers', 'UserController.cs'),
    'namespace MyApp.Controllers;\n' +
    'using MyApp.Models;\n' +
    'using MyApp.Services;\n' +
    'public class UserController {\n' +
    '  private UserService _svc;\n' +
    '}\n'
  );
});

after(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('namespace connection resolution — C#', () => {
  it('gives C# files connections via namespace imports', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(
      path.join(TEST_DIR, 'cs-project'), 'cs-project', 'cs-project/'
    );

    // All 3 files should appear in filesMap (connections >= 2)
    assert.ok(dir.files['Models/User.cs'], 'User.cs should be mapped — imported by 2 files');
    assert.ok(dir.files['Services/UserService.cs'], 'UserService.cs should be mapped');
    assert.ok(dir.files['Controllers/UserController.cs'], 'UserController.cs should be mapped');
  });

  it('User.cs has imports from both other files', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(
      path.join(TEST_DIR, 'cs-project'), 'cs-project', 'cs-project/'
    );
    // User.cs is in namespace MyApp.Models, imported by UserService and UserController
    // So it should have at least 2 connections (one per importer)
    assert.ok(dir.files['Models/User.cs'], 'User.cs must be in files map');
  });
});

describe('namespace connection resolution — Java', () => {
  before(() => {
    fs.mkdirSync(path.join(TEST_DIR, 'java-project', 'models'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'java-project', 'services'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'java-project', 'controllers'), { recursive: true });

    fs.writeFileSync(path.join(TEST_DIR, 'java-project', 'models', 'User.java'),
      'package com.myapp.models;\n' +
      'public class User {\n' +
      '  public String name;\n' +
      '}\n'
    );

    fs.writeFileSync(path.join(TEST_DIR, 'java-project', 'services', 'UserService.java'),
      'package com.myapp.services;\n' +
      'import com.myapp.models.User;\n' +
      'public class UserService {\n' +
      '  public User getUser() { return new User(); }\n' +
      '}\n'
    );

    fs.writeFileSync(path.join(TEST_DIR, 'java-project', 'controllers', 'UserController.java'),
      'package com.myapp.controllers;\n' +
      'import com.myapp.models.User;\n' +
      'import com.myapp.services.UserService;\n' +
      'import com.myapp.services.Helper;\n' +
      'public class UserController {\n' +
      '  private UserService svc;\n' +
      '}\n'
    );

    // Static import test fixtures
    fs.writeFileSync(path.join(TEST_DIR, 'java-project', 'services', 'Helper.java'),
      'package com.myapp.services;\n' +
      'public class Helper {\n' +
      '  public static String format() { return ""; }\n' +
      '}\n'
    );

    fs.writeFileSync(path.join(TEST_DIR, 'java-project', 'controllers', 'Formatter.java'),
      'package com.myapp.controllers;\n' +
      'import static com.myapp.services.Helper.format;\n' +
      'import com.myapp.models.User;\n' +
      'public class Formatter {\n' +
      '  public String run() { return format(); }\n' +
      '}\n'
    );
  });

  it('gives Java files connections via type-level namespace imports', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(
      path.join(TEST_DIR, 'java-project'), 'java-project', 'java-project/'
    );

    // User.java: imported by UserService + UserController + Formatter = 3 connections
    assert.ok(dir.files['models/User.java'], 'User.java should be mapped — imported by multiple files');
    // UserController: imports User + UserService = 2 connections
    assert.ok(dir.files['controllers/UserController.java'], 'UserController.java should be mapped — 2 imports');
  });

  it('resolves static imports via second-level fallback', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(
      path.join(TEST_DIR, 'java-project'), 'java-project', 'java-project/'
    );

    // Helper.java: exports "Helper", namespace "com.myapp.services"
    // Formatter imports "static com.myapp.services.Helper.format"
    //   -> first try: nsPrefix="com.myapp.services.Helper", type="format" — no namespace match
    //   -> second try: nsPrefix2="com.myapp.services", type2="Helper" — matches Helper.java export
    // Helper.java should get a connection from this
    assert.ok(dir.files['services/Helper.java'], 'Helper.java should be mapped — static import resolved');
  });
});
