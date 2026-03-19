const { after, before, describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
process.env.LOG_LEVEL = 'silent';

const app = require('../../src/app');
const db = require('../../src/services/db');

describe('Invitations API integration tests', () => {
  let server;
  let adminAgent;
  let invitationToken;
  let workspaceName;

  const adminUser = {
    name: 'Invitation Admin',
    email: `invitation_admin_${Date.now()}@example.com`,
    password: 'Password123!',
  };

  const inviteeUser = {
    name: 'Invitation Invitee',
    email: `invitation_invitee_${Date.now()}@example.com`,
    password: 'Password123!',
  };

  before(async () => {
    server = app.listen(0);
    adminAgent = request.agent(server);

    await adminAgent.post('/api/auth/register').send(adminUser).expect(201);
    await adminAgent.post('/api/auth/login').send({ email: adminUser.email, password: adminUser.password }).expect(200);
    await request(server).post('/api/auth/register').send(inviteeUser).expect(201);

    const workspacesRes = await adminAgent.get('/api/workspaces').expect(200);
    workspaceName = workspacesRes.body[0].name;

    const inviteRes = await adminAgent
      .post(`/api/workspaces/${workspacesRes.body[0].id}/invite`)
      .send({ email: inviteeUser.email, role: 'editor' })
      .expect(200);

    invitationToken = inviteRes.body.token;
  });

  after(() => {
    server.close();
  });

  it('returns a minimized public response for valid invitation tokens', async () => {
    const res = await request(server).get(`/api/invitations/${invitationToken}`).expect(200);

    assert.deepStrictEqual(res.body, {
      workspaceName,
      status: 'pending',
      expired: false,
    });
    assert.strictEqual('inviter_name' in res.body, false);
    assert.strictEqual('recipient_email' in res.body, false);
    assert.strictEqual('token' in res.body, false);
    assert.strictEqual('workspace_id' in res.body, false);
  });

  it('returns a minimized expired response when the invitation is no longer valid', async () => {
    db.prepare("UPDATE workspace_invitations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token = ?").run(invitationToken);

    const res = await request(server).get(`/api/invitations/${invitationToken}`).expect(410);

    assert.deepStrictEqual(res.body, {
      workspaceName,
      status: 'pending',
      expired: true,
    });
  });
});
