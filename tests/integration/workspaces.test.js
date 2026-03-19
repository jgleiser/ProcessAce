const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// Set up test environment BEFORE requiring modules
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/services/db');
const workspaceService = require('../../src/services/workspaceService');

describe('Workspace API Integration Tests', () => {
  let server;
  let agent; // Persistent agent (carries auth cookie)
  let secondAgent;
  let workspaceId;
  let ownerUserId;
  let secondUserId;

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
    secondAgent = request.agent(server);

    // Register and login the owner user
    await agent.post('/api/auth/register').send(testUser).expect(201);
    await agent.post('/api/auth/login').send({ email: testUser.email, password: testUser.password }).expect(200);
    ownerUserId = db.prepare('SELECT id FROM users WHERE email = ?').get(testUser.email).id;

    // Register second user (we'll use a fresh agent for their actions)
    await secondAgent.post('/api/auth/register').send(secondUser).expect(201);
    const secondUserRecord = db.prepare('SELECT id FROM users WHERE email = ?').get(secondUser.email);
    secondUserId = secondUserRecord.id;
    db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(secondUserRecord.id);
    await secondAgent.post('/api/auth/login').send({ email: secondUser.email, password: secondUser.password }).expect(200);
  });

  after(() => {
    server.close();
  });

  // --- GET /api/workspaces ---
  it('should list user workspaces', async () => {
    const res = await agent.get('/api/workspaces').expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1); // Default workspace created on registration
    assert.strictEqual(res.body[0].workspace_kind, 'personal');
    assert.strictEqual(res.body[0].is_default_workspace, true);
    assert.strictEqual(res.body[0].is_protected_personal_workspace, false);
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
    assert.strictEqual(owner.status, 'active');
  });

  it('should return 403 when a non-member lists workspace members', async () => {
    await secondAgent.get(`/api/workspaces/${workspaceId}/members`).expect(403);
  });

  // --- POST /api/workspaces/:id/invite ---
  it('should invite a registered user', async () => {
    const res = await agent.post(`/api/workspaces/${workspaceId}/invite`).send({ email: secondUser.email, role: 'editor' }).expect(200);

    assert.ok(res.body.token);
    assert.strictEqual(res.body.email, secondUser.email);
  });

  it('should fail to invite non-registered user', async () => {
    const res = await agent.post(`/api/workspaces/${workspaceId}/invite`).send({ email: 'nonexistent@test.com', role: 'viewer' }).expect(500);

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
    const createRes = await agent.post('/api/workspaces').send({ name: 'Throwaway WS' }).expect(201);

    await agent.delete(`/api/workspaces/${createRes.body.id}`).expect(200);
  });

  it('should reject deleting a personal workspace', async () => {
    const personalWorkspaceId = db.prepare('SELECT id FROM workspaces WHERE owner_id = ? AND workspace_kind = ?').get(ownerUserId, 'personal').id;
    const res = await agent.delete(`/api/workspaces/${personalWorkspaceId}`).expect(403);
    assert.strictEqual(res.body.error, 'Personal workspaces cannot be deleted');
  });

  it('should allow a superadmin to transfer ownership of a named workspace to an active member', async () => {
    const transferWorkspace = await agent.post('/api/workspaces').send({ name: 'Ownership Transfer WS' }).expect(201);
    workspaceService.addMember(transferWorkspace.body.id, secondUserId, 'editor');

    const res = await agent
      .post(`/api/workspaces/${transferWorkspace.body.id}/transfer-ownership`)
      .send({ newOwnerUserId: secondUserId })
      .expect(200);

    assert.strictEqual(res.body.workspace.owner_id, secondUserId);
    assert.strictEqual(db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(transferWorkspace.body.id).owner_id, secondUserId);
  });

  it('should reject ownership transfer for personal workspaces', async () => {
    const personalWorkspaceId = db.prepare('SELECT id FROM workspaces WHERE owner_id = ? AND workspace_kind = ?').get(ownerUserId, 'personal').id;
    const res = await agent.post(`/api/workspaces/${personalWorkspaceId}/transfer-ownership`).send({ newOwnerUserId: secondUserId }).expect(403);

    assert.strictEqual(res.body.error, 'Personal workspaces cannot be transferred');
  });

  it('should reject ownership transfer attempts from non-superadmin users', async () => {
    const namedWorkspace = await agent.post('/api/workspaces').send({ name: 'Restricted Ownership WS' }).expect(201);
    workspaceService.addMember(namedWorkspace.body.id, secondUserId, 'editor');

    await secondAgent.post(`/api/workspaces/${namedWorkspace.body.id}/transfer-ownership`).send({ newOwnerUserId: secondUserId }).expect(403);
  });

  // --- Unauthorized access ---
  it('should return 401 for unauthenticated requests', async () => {
    await request(server).get('/api/workspaces').expect(401);
  });
});
