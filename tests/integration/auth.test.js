const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/services/db');

describe('Auth API Integration Tests', () => {
  let server;
  let testUser = {
    email: `test_${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Test User',
  };
  let agent;

  before(async () => {
    // Start server on a random port to avoid conflicts
    server = app.listen(0);
    agent = request.agent(server);
  });

  after(() => {
    server.close();
    try {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(testUser.email);
      if (user) {
        // 1. Get workspaces owned by user
        const workspaces = db.prepare('SELECT id FROM workspaces WHERE owner_id = ?').all(user.id);

        // 2. Delete all members of those workspaces (clears FK to workspaces)
        const deleteMembersStmt = db.prepare(
          'DELETE FROM workspace_members WHERE workspace_id = ?',
        );
        for (const ws of workspaces) {
          deleteMembersStmt.run(ws.id);
        }

        // 3. Delete the workspaces (clears FK to users.id via owner_id)
        const deleteWorkspaceStmt = db.prepare('DELETE FROM workspaces WHERE id = ?');
        for (const ws of workspaces) {
          deleteWorkspaceStmt.run(ws.id);
        }

        // 4. Delete any other memberships this user has (clears FK to users.id via user_id)
        db.prepare('DELETE FROM workspace_members WHERE user_id = ?').run(user.id);

        // 4b. Delete notifications (clears FK to users.id)
        try {
          db.prepare('DELETE FROM notifications WHERE user_id = ?').run(user.id);
        } catch {
          /* ignore */
        }

        // 4c. Delete invitations (clears FK to users.id)
        try {
          db.prepare('DELETE FROM workspace_invitations WHERE inviter_id = ?').run(user.id);
        } catch {
          /* ignore */
        }

        // 5. Finally delete the user
        db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
      }
    } catch (e) {
      console.error('Cleanup failed:', e);
    }
  });

  it('should register a new user', async () => {
    const res = await agent
      .post('/api/auth/register')
      .send(testUser)
      .expect('Content-Type', /json/)
      .expect(201);

    assert.ok(res.body.id, 'Response should contain user id');
    assert.strictEqual(res.body.email, testUser.email);
    // Token is NOT expected on register, client must login
  });

  it('should not register user with duplicate email', async () => {
    const res = await agent.post('/api/auth/register').send(testUser).expect(409);

    assert.ok(res.body.error, 'Should return an error message');
  });

  it('should login with valid credentials', async () => {
    const loginAgent = request.agent(server);

    const res = await loginAgent
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    // API uses HTTP-only cookies, no token in body
    assert.ok(res.body.user, 'Response should contain user');
    assert.strictEqual(
      res.header['set-cookie'].some((c) => c.startsWith('auth_token=')),
      true,
      'Should set auth_token cookie',
    );
  });

  it('should fail login with invalid password', async () => {
    await request(server)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'WrongPassword!',
      })
      .expect(401);
  });

  it('should get current user profile (GET /api/auth/me)', async () => {
    // We need to login first with 'agent' to persist cookie for this test
    await agent
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    const res = await agent.get('/api/auth/me').expect(200);

    assert.strictEqual(res.body.email, testUser.email);
  });

  it('should fail /api/auth/me without token', async () => {
    await request(server).get('/api/auth/me').expect(401); // New agent without cookies
  });

  it('should logout successfully', async () => {
    // Ensure we are logged in with agent
    await agent
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    await agent.post('/api/auth/logout').expect(200);

    // Verify logout by trying to access protected route
    await agent.get('/api/auth/me').expect(401);
  });
});
