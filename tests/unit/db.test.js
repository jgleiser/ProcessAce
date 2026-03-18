const { after, describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.SQLITE_ENCRYPTION_KEY = 'test-sqlcipher-key';

const dbModule = require('../../src/services/db');

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
    assert.strictEqual(config.driverModuleName, '@journeyapps/sqlcipher');
    assert.strictEqual(config.usesSqlCipher, true);
  });

  it('applies the SQLCipher key pragma to the database connection', () => {
    const pragmaCalls = [];
    const fakeDatabase = {
      pragma(value) {
        pragmaCalls.push(value);
      },
    };

    dbModule.applyDatabaseEncryptionKey(fakeDatabase, "phase3'key");

    assert.deepStrictEqual(pragmaCalls, ["key = 'phase3''key'"]);
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
});
