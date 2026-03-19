const { describe, it } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const { auditMiddleware } = require('../../src/middleware/auditMiddleware');

describe('auditMiddleware', () => {
  it('logs successful reads with actor, resource, and correlation fields', () => {
    const logEntries = [];
    const middleware = auditMiddleware('artifact', (req) => req.params.id);
    const req = {
      user: { id: 'user-123' },
      params: { id: 'artifact-456' },
      correlationId: 'corr-789',
      log: {
        info(payload) {
          logEntries.push(payload);
        },
      },
    };
    const res = new EventEmitter();
    res.statusCode = 200;

    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);

    res.emit('finish');

    assert.deepStrictEqual(logEntries, [
      {
        event_type: 'data_access',
        actor: 'user-123',
        resource_type: 'artifact',
        resource_id: 'artifact-456',
        correlation_id: 'corr-789',
      },
    ]);
  });

  it('does not log failed responses', () => {
    const logEntries = [];
    const middleware = auditMiddleware('settings', () => 'app_settings');
    const req = {
      user: { id: 'user-123' },
      correlationId: 'corr-789',
      log: {
        info(payload) {
          logEntries.push(payload);
        },
      },
    };
    const res = new EventEmitter();
    res.statusCode = 403;

    middleware(req, res, () => {});
    res.emit('finish');

    assert.deepStrictEqual(logEntries, []);
  });
});
