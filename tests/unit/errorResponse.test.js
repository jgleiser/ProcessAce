const { describe, it } = require('node:test');
const assert = require('node:assert');

process.env.LOG_LEVEL = 'silent';

const { AppError, sendErrorResponse } = require('../../src/utils/errorResponse');

const createResponseDouble = () => ({
  statusCode: null,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return payload;
  },
});

describe('errorResponse', () => {
  it('returns the request correlation id for operational errors', () => {
    const res = createResponseDouble();

    sendErrorResponse(res, new AppError(503, 'Provider unavailable'), {
      headers: { 'x-request-id': 'req-1234' },
    });

    assert.strictEqual(res.statusCode, 503);
    assert.deepStrictEqual(res.payload, {
      error: 'Provider unavailable',
      correlationId: 'req-1234',
    });
  });

  it('returns a generic 500 response without leaking the internal message', () => {
    const res = createResponseDouble();

    sendErrorResponse(res, new Error('database connection refused'), { headers: {} });

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.payload.error, 'Something went wrong. Please try again or contact support.');
    assert.ok(res.payload.correlationId);
    assert.notStrictEqual(res.payload.error, 'database connection refused');
  });
});
