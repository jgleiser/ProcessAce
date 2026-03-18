const { describe, it } = require('node:test');
const assert = require('node:assert');

const { createLogger } = require('../../src/logging/logger');

describe('logger redaction', () => {
  it('redacts sensitive fields from structured logs', () => {
    let output = '';
    const stream = {
      write(chunk) {
        output += chunk;
      },
    };

    const logger = createLogger(
      {
        transport: undefined,
      },
      stream,
    );

    logger.info({
      req: {
        headers: {
          cookie: 'auth_token=secret-cookie',
          authorization: 'Bearer secret-token',
        },
      },
      email: 'owner@example.com',
      password: 'Password123!',
      apiKey: 'super-secret-api-key',
      session: {
        token: 'secret-session-token',
      },
      invitation: {
        recipient_email: 'recipient@example.com',
      },
    });

    const logEntry = JSON.parse(output.trim());

    assert.strictEqual(logEntry.req.headers.cookie, '[REDACTED]');
    assert.strictEqual(logEntry.req.headers.authorization, '[REDACTED]');
    assert.strictEqual(logEntry.email, '[REDACTED]');
    assert.strictEqual(logEntry.password, '[REDACTED]');
    assert.strictEqual(logEntry.apiKey, '[REDACTED]');
    assert.strictEqual(logEntry.session.token, '[REDACTED]');
    assert.strictEqual(logEntry.invitation.recipient_email, '[REDACTED]');
  });
});
