const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// Set up test environment BEFORE requiring modules
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.MOCK_LLM = 'true';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

const request = require('supertest');
const app = require('../../src/app');

describe('Jobs API Integration Tests', () => {
  let server;
  let agent;

  const testUser = {
    name: 'Jobs User',
    email: `jobs_user_${Date.now()}@test.com`,
    password: 'Password123',
  };

  before(async () => {
    server = app.listen(0);
    agent = request.agent(server);

    // Register and login
    await agent.post('/api/auth/register').send(testUser).expect(201);
    await agent
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);
  });

  after(() => {
    server.close();
  });

  // --- GET /api/jobs ---
  it('should return empty jobs list initially', async () => {
    const res = await agent.get('/api/jobs').expect(200);
    assert.ok(Array.isArray(res.body));
    // New user should have no jobs
    assert.strictEqual(res.body.length, 0);
  });

  // --- GET /api/jobs?workspaceId=... ---
  it('should return empty jobs for workspace filter', async () => {
    // Get user's workspace
    const wsRes = await agent.get('/api/workspaces').expect(200);
    const workspaceId = wsRes.body[0].id;

    const res = await agent.get(`/api/jobs?workspaceId=${workspaceId}`).expect(200);
    assert.ok(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 0);
  });

  // --- GET /api/jobs/:id ---
  it('should return 404 for non-existent job', async () => {
    await agent.get('/api/jobs/non-existent-id').expect(404);
  });

  // --- PATCH /api/jobs/:id ---
  it('should return 404 for updating non-existent job', async () => {
    await agent.patch('/api/jobs/non-existent-id').send({ processName: 'Updated' }).expect(404);
  });

  // --- DELETE /api/jobs/:id ---
  it('should return 200 even for deleting non-existent job (idempotent)', async () => {
    await agent.delete('/api/jobs/non-existent-id').expect(200);
  });

  // --- Unauthorized access ---
  it('should return 401 for unauthenticated requests', async () => {
    await request(server).get('/api/jobs').expect(401);
  });
});
