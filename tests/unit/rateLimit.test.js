const { describe, it } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');

process.env.LOG_LEVEL = 'silent';

const {
  GENERAL_API_RATE_LIMIT_MAX,
  createRateLimiter,
  getApiRateLimitKey,
  isExcludedFromGlobalApiRateLimit,
} = require('../../src/middleware/rateLimit');

const buildApp = (method, route, limiter) => {
  const app = express();
  app[method](route, limiter, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
};

describe('rateLimit middleware', () => {
  it('returns JSON 429 responses with Retry-After when the auth threshold is exceeded', async () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 2,
      message: 'Too many authentication attempts. Please try again in 15 minutes.',
      skip: () => false,
    });
    const app = buildApp('post', '/login', limiter);

    await request(app).post('/login').expect(200);
    await request(app).post('/login').expect(200);
    const res = await request(app).post('/login').expect(429);

    assert.strictEqual(res.body.error, 'Too many authentication attempts. Please try again in 15 minutes.');
    assert.ok(res.headers['retry-after']);
  });

  it('returns JSON 429 responses for the general API limiter', async () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 2,
      message: 'Too many requests. Please try again later.',
      skip: () => false,
    });
    const app = buildApp('get', '/profile', limiter);

    await request(app).get('/profile').expect(200);
    await request(app).get('/profile').expect(200);
    const res = await request(app).get('/profile').expect(429);

    assert.deepStrictEqual(res.body, {
      error: 'Too many requests. Please try again later.',
    });
  });

  it('excludes auth login and register from the global API limiter', () => {
    assert.strictEqual(isExcludedFromGlobalApiRateLimit({ originalUrl: '/api/auth/login' }), true);
    assert.strictEqual(isExcludedFromGlobalApiRateLimit({ originalUrl: '/api/auth/register?next=%2F' }), true);
    assert.strictEqual(isExcludedFromGlobalApiRateLimit({ originalUrl: '/api/auth/me' }), false);
    assert.strictEqual(isExcludedFromGlobalApiRateLimit({ originalUrl: '/api/workspaces' }), false);
  });

  it('keys authenticated API traffic by session cookie and falls back to IP for anonymous traffic', () => {
    const sessionKey = getApiRateLimitKey({
      cookies: { auth_token: 'session-token-1' },
      ip: '203.0.113.10',
    });
    const anotherSessionKey = getApiRateLimitKey({
      cookies: { auth_token: 'session-token-2' },
      ip: '203.0.113.10',
    });
    const anonymousKey = getApiRateLimitKey({
      cookies: {},
      ip: '203.0.113.10',
    });

    assert.match(sessionKey, /^session:/);
    assert.match(anotherSessionKey, /^session:/);
    assert.notStrictEqual(sessionKey, anotherSessionKey);
    assert.strictEqual(anonymousKey, 'ip:203.0.113.10');
  });

  it('keeps the general API limiter high enough for normal dashboard polling', () => {
    assert.strictEqual(GENERAL_API_RATE_LIMIT_MAX, 1000);
  });
});
