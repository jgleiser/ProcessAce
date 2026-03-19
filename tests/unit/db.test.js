const { after, describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.SQLITE_ENCRYPTION_KEY = 'test-sqlcipher-key';

const dbModule = require('../../src/services/db');
const { DEFAULT_PERSONAL_WORKSPACE_NAME, WORKSPACE_KINDS } = require('../../src/utils/workspaces');

describe('db configuration', () => {
  let temporaryDbPath = null;

  after(() => {
    if (temporaryDbPath && fs.existsSync(temporaryDbPath)) {
      fs.unlinkSync(temporaryDbPath);
    }
  });

  it('uses processAce-dev.db outside production', () => {
    const config = dbModule.resolveDatabaseConfig({
      NODE_ENV: 'development',
    });

    assert.match(config.dbPath, /processAce-dev\.db$/);
    assert.strictEqual(config.driverModuleName, 'better-sqlite3');
    assert.strictEqual(config.usesSqlCipher, false);
  });

  it('uses processAce.db and SQLCipher in production', () => {
    const config = dbModule.resolveDatabaseConfig({
      NODE_ENV: 'production',
      SQLITE_ENCRYPTION_KEY: 'phase3-key',
    });

    assert.match(config.dbPath, /processAce\.db$/);
    assert.strictEqual(config.driverModuleName, 'better-sqlite3-multiple-ciphers');
    assert.strictEqual(config.usesSqlCipher, true);
  });

  it('accepts direct constructor exports for better-sqlite3 style drivers', () => {
    function FakeDatabase() {}

    assert.strictEqual(dbModule.resolveDatabaseConstructor(FakeDatabase), FakeDatabase);
  });

  it('accepts named Database exports for sqlcipher style drivers', () => {
    function FakeDatabase() {}

    assert.strictEqual(dbModule.resolveDatabaseConstructor({ Database: FakeDatabase }), FakeDatabase);
  });

  it('applies the SQLCipher key pragma to the database connection', () => {
    const pragmaCalls = [];
    const fakeDatabase = {
      pragma(value) {
        pragmaCalls.push(value);
      },
    };

    dbModule.applyDatabaseEncryptionKey(fakeDatabase, "phase3'key");

    assert.deepStrictEqual(pragmaCalls, ["cipher = 'sqlcipher'", 'legacy = 4', "key = 'phase3''key'"]);
  });

  it('rejects plaintext production database files', () => {
    temporaryDbPath = path.join(os.tmpdir(), `phase3-plaintext-${Date.now()}.db`);
    fs.writeFileSync(temporaryDbPath, Buffer.concat([Buffer.from('SQLite format 3\0', 'utf8'), Buffer.from('extra-bytes')]));

    assert.throws(
      () =>
        dbModule.validateProductionDatabaseFile({
          usesSqlCipher: true,
          isInMemory: false,
          dbPath: temporaryDbPath,
        }),
      /plaintext SQLite database detected/i,
    );
  });

  it('repairs duplicate legacy My Workspace rows into active and transferred personal workspaces', () => {
    const testDatabase = dbModule.createDatabaseConnection({
      env: {
        DB_PATH: ':memory:',
        NODE_ENV: 'test',
        SQLITE_ENCRYPTION_KEY: 'test-sqlcipher-key',
      },
    });

    const superadminId = 'superadmin-user';
    const inactiveUserId = 'inactive-user';
    const activePersonalWorkspaceId = 'workspace-active-personal';
    const transferredPersonalWorkspaceId = 'workspace-transferred-personal';
    const timestamp = new Date().toISOString();

    testDatabase
      .prepare(
        `
          INSERT INTO users (id, email, password_hash, role, status, name, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(superadminId, 'superadmin@example.com', 'hash', 'superadmin', 'active', 'Primary Admin', timestamp);

    testDatabase
      .prepare(
        `
          INSERT INTO users (id, email, password_hash, role, status, name, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(inactiveUserId, 'inactive@example.com', 'hash', 'editor', 'inactive', 'Daniela Delaiglesia', timestamp);

    testDatabase
      .prepare(
        `
          INSERT INTO workspaces (id, name, owner_id, created_at, workspace_kind, personal_owner_user_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(activePersonalWorkspaceId, DEFAULT_PERSONAL_WORKSPACE_NAME, superadminId, timestamp, WORKSPACE_KINDS.NAMED, null);

    testDatabase
      .prepare(
        `
          INSERT INTO workspaces (id, name, owner_id, created_at, workspace_kind, personal_owner_user_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(transferredPersonalWorkspaceId, DEFAULT_PERSONAL_WORKSPACE_NAME, superadminId, timestamp, WORKSPACE_KINDS.NAMED, null);

    testDatabase
      .prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
      .run(activePersonalWorkspaceId, superadminId, 'admin');
    testDatabase
      .prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
      .run(transferredPersonalWorkspaceId, superadminId, 'admin');
    testDatabase
      .prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
      .run(transferredPersonalWorkspaceId, inactiveUserId, 'admin');

    dbModule.backfillWorkspaceKinds(testDatabase);

    const activePersonalWorkspace = testDatabase
      .prepare('SELECT name, owner_id, workspace_kind, personal_owner_user_id FROM workspaces WHERE id = ?')
      .get(activePersonalWorkspaceId);
    const transferredPersonalWorkspace = testDatabase
      .prepare('SELECT name, owner_id, workspace_kind, personal_owner_user_id FROM workspaces WHERE id = ?')
      .get(transferredPersonalWorkspaceId);

    assert.deepStrictEqual(activePersonalWorkspace, {
      name: DEFAULT_PERSONAL_WORKSPACE_NAME,
      owner_id: superadminId,
      workspace_kind: WORKSPACE_KINDS.PERSONAL,
      personal_owner_user_id: superadminId,
    });
    assert.deepStrictEqual(transferredPersonalWorkspace, {
      name: 'Daniela Delaiglesia Personal Workspace',
      owner_id: superadminId,
      workspace_kind: WORKSPACE_KINDS.PERSONAL,
      personal_owner_user_id: inactiveUserId,
    });
  });
});
