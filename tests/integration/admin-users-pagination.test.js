const { after, before, describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
process.env.LOG_LEVEL = 'silent';

const app = require('../../src/app');

describe('Admin users pagination integration tests', () => {
  let server;
  let adminAgent;

  const adminUser = {
    name: 'Admin Pagination User',
    email: `admin_users_pagination_${Date.now()}@example.com`,
    password: 'Password123!',
  };

  before(async () => {
    server = app.listen(0);
    adminAgent = request.agent(server);

    await adminAgent.post('/api/auth/register').send(adminUser).expect(201);
    await adminAgent.post('/api/auth/login').send({ email: adminUser.email, password: adminUser.password }).expect(200);
  });

  after(() => {
    server.close();
  });

  it('returns paginated users when page and limit are valid', async () => {
    const res = await adminAgent.get('/api/admin/users?page=1&limit=100').expect(200);

    assert.ok(Array.isArray(res.body.users));
    assert.strictEqual(res.body.pagination.page, 1);
    assert.strictEqual(res.body.pagination.limit, 100);
  });

  it('rejects page values lower than 1', async () => {
    const res = await adminAgent.get('/api/admin/users?page=0').expect(400);
    assert.strictEqual(res.body.error, 'Invalid pagination parameters: page must be a positive integer.');
  });

  it('rejects non-numeric page values', async () => {
    const res = await adminAgent.get('/api/admin/users?page=1abc').expect(400);
    assert.strictEqual(res.body.error, 'Invalid pagination parameters: page must be a positive integer.');
  });

  it('rejects limit values above the enforced maximum', async () => {
    const res = await adminAgent.get('/api/admin/users?limit=101').expect(400);
    assert.strictEqual(res.body.error, 'Invalid pagination parameters: limit must be between 1 and 100.');
  });

  it('rejects non-numeric limit values', async () => {
    const res = await adminAgent.get('/api/admin/users?limit=abc').expect(400);
    assert.strictEqual(res.body.error, 'Invalid pagination parameters: limit must be between 1 and 100.');
  });
});
