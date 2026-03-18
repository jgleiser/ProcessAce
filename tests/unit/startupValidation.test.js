const { describe, it } = require('node:test');
const assert = require('node:assert');

process.env.LOG_LEVEL = 'silent';

const restoreModuleCache = (modulePaths) => {
  for (const modulePath of modulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }
};

const withEnv = (updates, callback) => {
  const previousValues = new Map();

  for (const [key, value] of Object.entries(updates)) {
    previousValues.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    callback();
  } finally {
    for (const [key, value] of previousValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

describe('startup validation', () => {
  it('fails authService startup when JWT_SECRET is missing in production', () => {
    withEnv(
      {
        DB_PATH: ':memory:',
        NODE_ENV: 'production',
        JWT_SECRET: undefined,
        SQLITE_ENCRYPTION_KEY: 'phase3-sqlcipher-key',
      },
      () => {
        restoreModuleCache(['../../src/services/authService', '../../src/services/db']);
        assert.throws(() => require('../../src/services/authService'), /JWT_SECRET environment variable is required in production/);
      },
    );
  });

  it('fails settingsService startup when ENCRYPTION_KEY is missing in production', () => {
    withEnv(
      {
        DB_PATH: ':memory:',
        NODE_ENV: 'production',
        ENCRYPTION_KEY: undefined,
        SQLITE_ENCRYPTION_KEY: 'phase3-sqlcipher-key',
      },
      () => {
        restoreModuleCache(['../../src/services/settingsService', '../../src/services/db']);
        assert.throws(() => require('../../src/services/settingsService'), /ENCRYPTION_KEY environment variable is required in production/);
      },
    );
  });

  it('fails app startup when CORS_ALLOWED_ORIGINS is missing in production', () => {
    withEnv(
      {
        DB_PATH: ':memory:',
        NODE_ENV: 'production',
        JWT_SECRET: 'test-jwt-secret',
        ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        CORS_ALLOWED_ORIGINS: undefined,
        SQLITE_ENCRYPTION_KEY: 'phase3-sqlcipher-key',
      },
      () => {
        restoreModuleCache([
          '../../src/app',
          '../../src/api/auth',
          '../../src/api/settings',
          '../../src/middleware/auth',
          '../../src/middleware/rateLimit',
          '../../src/services/authService',
          '../../src/services/settingsService',
          '../../src/services/db',
        ]);

        assert.throws(() => require('../../src/app'), /CORS_ALLOWED_ORIGINS must be set in production and contain at least one allowed origin/);
      },
    );
  });

  it('fails database startup when SQLITE_ENCRYPTION_KEY is missing in production', () => {
    withEnv(
      {
        DB_PATH: ':memory:',
        NODE_ENV: 'production',
        SQLITE_ENCRYPTION_KEY: undefined,
      },
      () => {
        restoreModuleCache(['../../src/services/db']);
        assert.throws(() => require('../../src/services/db'), /SQLITE_ENCRYPTION_KEY environment variable is required in production/);
      },
    );
  });
});
