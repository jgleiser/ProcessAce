const { after, before, describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
process.env.LOG_LEVEL = 'silent';

const app = require('../../src/app');

describe('App security integration tests', () => {
  let server;

  before(() => {
    server = app.listen(0);
  });

  after(() => {
    server.close();
  });

  it('injects a CSP nonce into login HTML and removes the placeholder', async () => {
    const res = await request(server).get('/login.html').expect(200);

    const nonceMatches = [...res.text.matchAll(/nonce="([^"]+)"/g)].map((match) => match[1]);
    assert.strictEqual(nonceMatches.length, 1);
    assert.ok(nonceMatches[0]);
    assert.ok(!res.text.includes('__CSP_NONCE__'));
    assert.match(res.headers['content-security-policy'], /script-src[^;]*'nonce-[^']+'/);
    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(res.headers['content-security-policy']));
  });

  it('serves dashboard HTML without nonce placeholders and with a nonce-bearing CSP header', async () => {
    const res = await request(server).get('/').expect(200);

    const nonceMatches = [...res.text.matchAll(/nonce="([^"]+)"/g)].map((match) => match[1]);
    assert.strictEqual(nonceMatches.length, 0);
    assert.ok(!res.text.includes('__CSP_NONCE__'));
    assert.match(res.headers['content-security-policy'], /script-src[^;]*'nonce-[^']+'/);
    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(res.headers['content-security-policy']));
    assert.match(res.text, /<script src="js\/app\.js"><\/script>/);
  });

  it('serves the public about page with the shared footer assets', async () => {
    const res = await request(server).get('/about.html').expect(200);

    assert.match(res.text, /About ProcessAce/);
    assert.match(res.text, /id="app-footer"/);
    assert.match(res.text, /src="js\/app-info\.js"/);
    assert.match(res.text, /src="js\/footer\.js"/);
    assert.ok(!res.text.includes('__CSP_NONCE__'));
  });

  it('includes the shared footer mount and assets on login and dashboard pages', async () => {
    const loginRes = await request(server).get('/login.html').expect(200);
    const dashboardRes = await request(server).get('/').expect(200);

    for (const res of [loginRes, dashboardRes]) {
      assert.match(res.text, /id="app-footer"/);
      assert.match(res.text, /src="js\/app-info\.js"/);
      assert.match(res.text, /src="js\/footer\.js"/);
    }
  });
});
