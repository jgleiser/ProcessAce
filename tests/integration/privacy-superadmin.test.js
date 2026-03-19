const { after, before, describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
process.env.UPLOADS_DIR = 'tmp/test-uploads-privacy-superadmin';

const uploadsDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR);
const app = require('../../src/app');
const db = require('../../src/services/db');
const { DEFAULT_PERSONAL_WORKSPACE_NAME } = require('../../src/utils/workspaces');

describe('Privacy and Superadmin Integration Tests', () => {
  let server;
  let superadminAgent;
  let adminAgent;
  let editorAgent;
  let superadminId;
  let adminUserId;
  let editorUserId;
  let editorWorkspaceId;
  let editorCookie;

  const superadminUser = {
    email: `phase4_superadmin_${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Phase 4 Superadmin',
  };

  const adminUser = {
    email: `phase4_admin_${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Phase 4 Admin',
  };

  const editorUser = {
    email: `phase4_editor_${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Phase 4 Editor',
  };

  before(async () => {
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    fs.mkdirSync(uploadsDir, { recursive: true });

    server = app.listen(0);
    superadminAgent = request.agent(server);
    adminAgent = request.agent(server);
    editorAgent = request.agent(server);
  });

  after(() => {
    server.close();
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  });

  it('bootstraps the first user as superadmin and promotes another user to admin', async () => {
    const registerSuperadminRes = await superadminAgent.post('/api/auth/register').send(superadminUser).expect(201);
    superadminId = registerSuperadminRes.body.user.id;
    assert.strictEqual(registerSuperadminRes.body.user.role, 'superadmin');

    await superadminAgent.post('/api/auth/login').send({ email: superadminUser.email, password: superadminUser.password }).expect(200);

    const registerAdminRes = await adminAgent.post('/api/auth/register').send(adminUser).expect(201);
    adminUserId = registerAdminRes.body.user.id;
    await superadminAgent.post(`/api/admin/users/${adminUserId}/approve`).expect(200);
    const promoteRes = await superadminAgent.patch(`/api/admin/users/${adminUserId}`).send({ role: 'admin' }).expect(200);

    assert.strictEqual(promoteRes.body.role, 'admin');

    const registerEditorRes = await editorAgent.post('/api/auth/register').send(editorUser).expect(201);
    editorUserId = registerEditorRes.body.user.id;
    editorWorkspaceId = db.prepare('SELECT id FROM workspaces WHERE owner_id = ?').get(editorUserId).id;
    await superadminAgent.post(`/api/admin/users/${editorUserId}/approve`).expect(200);
  });

  it('prevents regular admins from assigning privileged roles or managing privileged accounts', async () => {
    await adminAgent.post('/api/auth/login').send({ email: adminUser.email, password: adminUser.password }).expect(200);

    const promoteAttempt = await adminAgent.patch(`/api/admin/users/${editorUserId}`).send({ role: 'superadmin' }).expect(403);
    assert.strictEqual(promoteAttempt.body.error, 'Only superadmins can assign admin or superadmin roles');

    const manageSuperadminAttempt = await adminAgent.patch(`/api/admin/users/${superadminId}`).send({ status: 'inactive' }).expect(403);
    assert.strictEqual(manageSuperadminAttempt.body.error, 'Only superadmins can manage admin or superadmin accounts');
  });

  it('exports user data and omits secret or internal fields', async () => {
    const loginRes = await editorAgent.post('/api/auth/login').send({ email: editorUser.email, password: editorUser.password }).expect(200);
    editorCookie = loginRes.header['set-cookie'].find((cookie) => cookie.startsWith('auth_token=')).split(';')[0];

    const consentRes = await editorAgent.get('/api/auth/me/consent').expect(200);
    const exportRes = await editorAgent.get('/api/auth/me/data-export').expect(200);
    const parsedExport = JSON.parse(exportRes.text);

    assert.strictEqual(consentRes.body.consentHistory.length, 2);
    assert.match(exportRes.header['content-disposition'], /processace-data-export/);
    assert.match(exportRes.text, /\r?\n {2}"user": \{/);
    assert.ok(exportRes.text.endsWith('\n') || exportRes.text.endsWith('\r\n'));
    assert.strictEqual(parsedExport.user.email, editorUser.email);
    assert.ok(parsedExport.user.createdAt);
    assert.ok(parsedExport.user.lastLoginAt);
    assert.strictEqual(parsedExport.user.password_hash, undefined);
    assert.strictEqual(parsedExport.consentHistory.length, 2);
  });

  it('deactivates the current user, transfers workspace ownership, revokes the session, and blocks future login', async () => {
    await editorAgent.post('/api/auth/me/deactivate').send({ currentPassword: editorUser.password }).expect(200);

    const transferredWorkspace = db
      .prepare('SELECT owner_id, name, workspace_kind, personal_owner_user_id FROM workspaces WHERE id = ?')
      .get(editorWorkspaceId);
    assert.strictEqual(transferredWorkspace.owner_id, superadminId);
    assert.strictEqual(transferredWorkspace.workspace_kind, 'personal');
    assert.strictEqual(transferredWorkspace.personal_owner_user_id, editorUserId);
    assert.strictEqual(transferredWorkspace.name, `${editorUser.name} Personal Workspace`);

    await request(server).get('/api/auth/me').set('Cookie', editorCookie).expect(403);

    const loginRes = await request(server).post('/api/auth/login').send({ email: editorUser.email, password: editorUser.password }).expect(403);
    assert.strictEqual(loginRes.body.error, 'Account is deactivated');

    const superadminWorkspaces = await superadminAgent.get('/api/workspaces').expect(200);
    const transferredPersonalWorkspace = superadminWorkspaces.body.find((workspace) => workspace.id === editorWorkspaceId);
    assert.ok(transferredPersonalWorkspace);
    assert.strictEqual(transferredPersonalWorkspace.name, `${editorUser.name} Personal Workspace`);
    assert.strictEqual(transferredPersonalWorkspace.is_default_workspace, false);
    assert.strictEqual(transferredPersonalWorkspace.is_protected_personal_workspace, true);
  });

  it('reactivates the user and restores ownership of the original personal workspace', async () => {
    await superadminAgent.patch(`/api/admin/users/${editorUserId}`).send({ status: 'active' }).expect(200);

    const restoredWorkspace = db.prepare('SELECT owner_id, name FROM workspaces WHERE id = ?').get(editorWorkspaceId);
    assert.strictEqual(restoredWorkspace.owner_id, editorUserId);
    assert.strictEqual(restoredWorkspace.name, DEFAULT_PERSONAL_WORKSPACE_NAME);

    await editorAgent.post('/api/auth/login').send({ email: editorUser.email, password: editorUser.password }).expect(200);
  });

  it('restricts full reset to superadmins and requires password plus DELETE ALL confirmation', async () => {
    fs.writeFileSync(path.join(uploadsDir, 'reset-target.txt'), 'sensitive');

    await adminAgent.post('/api/superadmin/reset-instance').send({ currentPassword: adminUser.password, confirmationText: 'DELETE ALL' }).expect(403);

    const badConfirmationRes = await superadminAgent
      .post('/api/superadmin/reset-instance')
      .send({ currentPassword: superadminUser.password, confirmationText: 'delete all' })
      .expect(400);
    assert.strictEqual(badConfirmationRes.body.error, 'Confirmation text must be exactly DELETE ALL');

    await superadminAgent
      .post('/api/superadmin/reset-instance')
      .send({ currentPassword: superadminUser.password, confirmationText: 'DELETE ALL' })
      .expect(200);

    const counts = {
      users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      workspaces: db.prepare('SELECT COUNT(*) as count FROM workspaces').get().count,
      evidence: db.prepare('SELECT COUNT(*) as count FROM evidence').get().count,
      artifacts: db.prepare('SELECT COUNT(*) as count FROM artifacts').get().count,
      notifications: db.prepare('SELECT COUNT(*) as count FROM notifications').get().count,
      consentRecords: db.prepare('SELECT COUNT(*) as count FROM consent_records').get().count,
      loginAttempts: db.prepare('SELECT COUNT(*) as count FROM login_attempts').get().count,
      appSettings: db.prepare('SELECT COUNT(*) as count FROM app_settings').get().count,
    };

    assert.deepStrictEqual(counts, {
      users: 0,
      workspaces: 0,
      evidence: 0,
      artifacts: 0,
      notifications: 0,
      consentRecords: 0,
      loginAttempts: 0,
      appSettings: 0,
    });
    assert.strictEqual(fs.existsSync(path.join(uploadsDir, 'reset-target.txt')), false);
  });

  it('allows a fresh bootstrap registration after reset', async () => {
    const newBootstrapUser = {
      email: `phase4_rebootstrap_${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Fresh Bootstrap',
    };

    const res = await request(server).post('/api/auth/register').send(newBootstrapUser).expect(201);
    assert.strictEqual(res.body.user.role, 'superadmin');
    assert.strictEqual(res.body.user.status, 'active');
  });
});
