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
  let inviteeAgent;
  let intruderAgent;
  let invitationToken;
  let expiredInvitationToken;
  let workspaceName;
  let workspaceId;
  let inviteeUserId;
  let intruderUserId;

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

  const intruderUser = {
    name: 'Invitation Intruder',
    email: `invitation_intruder_${Date.now()}@example.com`,
    password: 'Password123!',
  };

  const expiredInviteeUser = {
    name: 'Invitation Expired Invitee',
    email: `invitation_expired_${Date.now()}@example.com`,
    password: 'Password123!',
  };

  before(async () => {
    server = app.listen(0);
    adminAgent = request.agent(server);
    inviteeAgent = request.agent(server);
    intruderAgent = request.agent(server);

    await adminAgent.post('/api/auth/register').send(adminUser).expect(201);
    await adminAgent.post('/api/auth/login').send({ email: adminUser.email, password: adminUser.password }).expect(200);
    const inviteeRes = await request(server).post('/api/auth/register').send(inviteeUser).expect(201);
    inviteeUserId = inviteeRes.body.user.id;
    await adminAgent.post(`/api/admin/users/${inviteeUserId}/approve`).expect(200);
    await inviteeAgent.post('/api/auth/login').send({ email: inviteeUser.email, password: inviteeUser.password }).expect(200);

    const intruderRes = await request(server).post('/api/auth/register').send(intruderUser).expect(201);
    intruderUserId = intruderRes.body.user.id;
    await adminAgent.post(`/api/admin/users/${intruderUserId}/approve`).expect(200);
    await intruderAgent.post('/api/auth/login').send({ email: intruderUser.email, password: intruderUser.password }).expect(200);

    const expiredInviteeRes = await request(server).post('/api/auth/register').send(expiredInviteeUser).expect(201);
    await adminAgent.post(`/api/admin/users/${expiredInviteeRes.body.user.id}/approve`).expect(200);

    const workspacesRes = await adminAgent.get('/api/workspaces').expect(200);
    workspaceId = workspacesRes.body[0].id;
    workspaceName = workspacesRes.body[0].name;

    const inviteRes = await adminAgent.post(`/api/workspaces/${workspaceId}/invite`).send({ email: inviteeUser.email, role: 'editor' }).expect(200);

    invitationToken = inviteRes.body.token;

    const expiredInviteRes = await adminAgent
      .post(`/api/workspaces/${workspaceId}/invite`)
      .send({ email: expiredInviteeUser.email, role: 'viewer' })
      .expect(200);

    expiredInvitationToken = expiredInviteRes.body.token;
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
    db.prepare("UPDATE workspace_invitations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token = ?").run(expiredInvitationToken);

    const res = await request(server).get(`/api/invitations/${expiredInvitationToken}`).expect(410);

    assert.deepStrictEqual(res.body, {
      workspaceName,
      status: 'pending',
      expired: true,
    });
  });

  it('blocks invitation decline for authenticated users who are not the recipient', async () => {
    const res = await intruderAgent.post(`/api/invitations/${invitationToken}/decline`).expect(403);
    assert.strictEqual(res.body.error, 'Invitation does not belong to authenticated user');

    const invitation = db.prepare('SELECT status FROM workspace_invitations WHERE token = ?').get(invitationToken);
    assert.strictEqual(invitation.status, 'pending');
  });

  it('blocks invitation acceptance for authenticated users who are not the recipient', async () => {
    const res = await intruderAgent.post(`/api/invitations/${invitationToken}/accept`).expect(403);
    assert.strictEqual(res.body.error, 'Invitation does not belong to authenticated user');

    const invitation = db.prepare('SELECT status FROM workspace_invitations WHERE token = ?').get(invitationToken);
    assert.strictEqual(invitation.status, 'pending');

    const membership = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, intruderUserId);
    assert.strictEqual(Boolean(membership), false);
  });

  it('allows the invitation recipient to accept and become a workspace member', async () => {
    const acceptRes = await inviteeAgent.post(`/api/invitations/${invitationToken}/accept`).expect(200);
    assert.strictEqual(acceptRes.body.workspaceId, workspaceId);

    const invitation = db.prepare('SELECT status FROM workspace_invitations WHERE token = ?').get(invitationToken);
    assert.strictEqual(invitation.status, 'accepted');

    const membership = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, inviteeUserId);
    assert.strictEqual(Boolean(membership), true);
  });
});
