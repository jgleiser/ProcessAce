const { describe, it } = require('node:test');
const assert = require('node:assert');

const { createRedisOptions } = require('../../src/config/redisOptions');

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

describe('redisOptions', () => {
  it('omits the password when REDIS_PASSWORD is not set', () => {
    withEnv({ REDIS_PASSWORD: undefined }, () => {
      const options = createRedisOptions();

      assert.strictEqual(options.password, undefined);
      assert.strictEqual(options.maxRetriesPerRequest, null);
    });
  });

  it('includes the password when REDIS_PASSWORD is set', () => {
    withEnv({ REDIS_PASSWORD: 'super-secret' }, () => {
      const options = createRedisOptions();

      assert.strictEqual(options.password, 'super-secret');
    });
  });
});
