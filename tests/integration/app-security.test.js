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

  it('injects the same nonce into dashboard importmap and module scripts', async () => {
    const res = await request(server).get('/').expect(200);

    const nonceMatches = [...res.text.matchAll(/nonce="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(nonceMatches.length >= 2);
    assert.strictEqual(new Set(nonceMatches).size, 1);
    assert.match(res.text, /<script type="importmap" nonce="[^"]+">/);
    assert.match(res.text, /<script type="module" nonce="[^"]+">/);
    assert.ok(!res.text.includes('__CSP_NONCE__'));
  });
});
