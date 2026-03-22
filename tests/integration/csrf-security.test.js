const { after, before, describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ENFORCE_TEST_CSRF = 'true';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
process.env.LOG_LEVEL = 'silent';

const app = require('../../src/app');

const extractCookieValue = (setCookieHeaders, cookieName) => {
  if (!Array.isArray(setCookieHeaders)) {
    return null;
  }

  const matchingCookie = setCookieHeaders.find((cookie) => cookie.startsWith(`${cookieName}=`));
  if (!matchingCookie) {
    return null;
  }

  return matchingCookie.split(';')[0].slice(cookieName.length + 1);
};

describe('CSRF security integration tests', () => {
  let server;
  let agent;
  let csrfToken;
  let origin;

  const user = {
    name: 'CSRF User',
    email: `csrf_user_${Date.now()}@example.com`,
    password: 'Password123!',
  };

  before(async () => {
    server = app.listen(0);
    agent = request.agent(server);
    origin = `http://127.0.0.1:${server.address().port}`;

    const registerRes = await agent.post('/api/auth/register').send(user).expect(201);
    csrfToken = extractCookieValue(registerRes.headers['set-cookie'], 'csrf_token');

    const loginRes = await agent.post('/api/auth/login').send({ email: user.email, password: user.password }).expect(200);
    csrfToken = csrfToken || extractCookieValue(loginRes.headers['set-cookie'], 'csrf_token');

    assert.ok(csrfToken, 'Expected csrf_token cookie to be issued');
  });

  after(() => {
    server.close();
  });

  it('rejects mutating authenticated requests without a CSRF header', async () => {
    const res = await agent.post('/api/auth/logout').set('Origin', origin).expect(403);
    assert.strictEqual(res.body.error, 'Invalid CSRF token');
  });

  it('rejects mutating authenticated requests from untrusted origins', async () => {
    const res = await agent.post('/api/auth/logout').set('Origin', 'http://evil.example').set('x-csrf-token', csrfToken).expect(403);
    assert.strictEqual(res.body.error, 'Invalid request origin');
  });

  it('allows mutating authenticated requests with valid origin and matching CSRF token', async () => {
    await agent.post('/api/auth/logout').set('Origin', origin).set('x-csrf-token', csrfToken).expect(200);
  });
});
