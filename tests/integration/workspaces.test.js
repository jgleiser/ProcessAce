const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// Set up test environment BEFORE requiring modules
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

const request = require('supertest');
const app = require('../../src/app');

describe('Workspace API Integration Tests', () => {
  let server;
  let agent; // Persistent agent (carries auth cookie)
  let workspaceId;

  const testUser = {
    name: 'WS Owner',
    email: `ws_owner_${Date.now()}@test.com`,
    password: 'Password123',
  };

  const secondUser = {
    name: 'WS Member',
    email: `ws_member_${Date.now()}@test.com`,
    password: 'Password123',
  };

  before(async () => {
    server = app.listen(0);
    agent = request.agent(server);

    // Register and login the owner user
    await agent.post('/api/auth/register').send(testUser).expect(201);
    await agent
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);

    // Register second user (we'll use a fresh agent for their actions)
    const secondAgent = request.agent(server);
    await secondAgent.post('/api/auth/register').send(secondUser).expect(201);
  });

  after(() => {
    server.close();
  });

  // --- GET /api/workspaces ---
  it('should list user workspaces', async () => {
    const res = await agent.get('/api/workspaces').expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1); // Default workspace created on registration
  });

  // --- POST /api/workspaces ---
  it('should create a new workspace', async () => {
    const res = await agent.post('/api/workspaces').send({ name: 'Integration WS' }).expect(201);

    assert.ok(res.body.id);
    assert.strictEqual(res.body.name, 'Integration WS');
    workspaceId = res.body.id;
  });

  it('should return 400 when creating workspace without name', async () => {
    await agent.post('/api/workspaces').send({}).expect(400);
  });

  // --- GET /api/workspaces/:id/members ---
  it('should list workspace members', async () => {
    const res = await agent.get(`/api/workspaces/${workspaceId}/members`).expect(200);

    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
    // Owner should be listed
    const owner = res.body.find((m) => m.email === testUser.email);
    assert.ok(owner);
    assert.strictEqual(owner.role, 'owner');
  });

  // --- POST /api/workspaces/:id/invite ---
  it('should invite a registered user', async () => {
    const res = await agent
      .post(`/api/workspaces/${workspaceId}/invite`)
      .send({ email: secondUser.email, role: 'editor' })
      .expect(200);

    assert.ok(res.body.token);
    assert.strictEqual(res.body.email, secondUser.email);
  });

  it('should fail to invite non-registered user', async () => {
    const res = await agent
      .post(`/api/workspaces/${workspaceId}/invite`)
      .send({ email: 'nonexistent@test.com', role: 'viewer' })
      .expect(500);

    assert.ok(res.body.error);
  });

  // --- GET /api/workspaces/:id/invitations ---
  it('should list pending invitations', async () => {
    const res = await agent.get(`/api/workspaces/${workspaceId}/invitations`).expect(200);

    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
  });

  // --- DELETE /api/workspaces/:id ---
  it('should delete a workspace owned by user', async () => {
    // Create a throwaway workspace
    const createRes = await agent
      .post('/api/workspaces')
      .send({ name: 'Throwaway WS' })
      .expect(201);

    await agent.delete(`/api/workspaces/${createRes.body.id}`).expect(200);
  });

  // --- Unauthorized access ---
  it('should return 401 for unauthenticated requests', async () => {
    await request(server).get('/api/workspaces').expect(401);
  });
});
