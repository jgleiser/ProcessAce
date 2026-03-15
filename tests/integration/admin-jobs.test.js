const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.MOCK_LLM = 'true';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/services/db');
const { Job, saveJob } = require('../../src/models/job');

describe('Admin Jobs API Integration Tests', () => {
  let server;
  let agent;
  let workspaceId;
  let adminUserId;

  const adminUser = {
    name: 'Admin User',
    email: `admin_jobs_${Date.now()}@test.com`,
    password: 'Password123',
  };

  before(async () => {
    server = app.listen(0);
    agent = request.agent(server);

    await agent.post('/api/auth/register').send(adminUser).expect(201);
    await agent.post('/api/auth/login').send({ email: adminUser.email, password: adminUser.password }).expect(200);

    const workspaceRes = await agent.get('/api/workspaces').expect(200);
    workspaceId = workspaceRes.body[0].id;

    const userRow = db.prepare('SELECT id FROM users WHERE email = ?').get(adminUser.email);
    adminUserId = userRow.id;

    saveJob(
      new Job({
        type: 'process_evidence',
        user_id: adminUserId,
        workspace_id: workspaceId,
        data: { processName: 'Artifacts Job' },
      }),
    );

    saveJob(
      new Job({
        type: 'transcribe_evidence',
        user_id: adminUserId,
        workspace_id: workspaceId,
        data: { processName: 'Transcript Job' },
      }),
    );
  });

  after(() => {
    server.close();
  });

  it('should filter jobs by process_evidence type', async () => {
    const res = await agent.get('/api/admin/jobs?type=process_evidence').expect(200);

    assert.ok(Array.isArray(res.body.jobs));
    assert.strictEqual(res.body.jobs.length, 1);
    assert.strictEqual(res.body.jobs[0].type, 'process_evidence');
    assert.strictEqual(res.body.pagination.total, 1);
  });

  it('should filter jobs by transcribe_evidence type', async () => {
    const res = await agent.get('/api/admin/jobs?type=transcribe_evidence').expect(200);

    assert.ok(Array.isArray(res.body.jobs));
    assert.strictEqual(res.body.jobs.length, 1);
    assert.strictEqual(res.body.jobs[0].type, 'transcribe_evidence');
    assert.strictEqual(res.body.pagination.total, 1);
  });
});
