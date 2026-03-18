const { after, before, describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

const app = require('../../src/app');
const db = require('../../src/services/db');

describe('Auth API Integration Tests', () => {
  let server;
  let adminAgent;
  let secondUserAgent;
  let thirdUserAgent;
  let secondUserId;
  let thirdUserId;
  let secondUserCookie;
  let adminCookie;

  const adminUser = {
    email: `test_admin_${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Test Admin',
  };

  const pendingUser = {
    email: `test_pending_${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Pending User',
  };

  const rejectedUser = {
    email: `test_rejected_${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Rejected User',
  };

  before(async () => {
    server = app.listen(0);
    adminAgent = request.agent(server);
    secondUserAgent = request.agent(server);
    thirdUserAgent = request.agent(server);
  });

  after(() => {
    server.close();
  });

  it('registers the first user as an active superadmin and returns a success message', async () => {
    const res = await adminAgent.post('/api/auth/register').send(adminUser).expect('Content-Type', /json/).expect(201);

    assert.ok(res.body.user.id);
    assert.strictEqual(res.body.user.email, adminUser.email);
    assert.strictEqual(res.body.user.role, 'superadmin');
    assert.strictEqual(res.body.user.status, 'active');
    assert.strictEqual(res.body.message, 'Account created successfully. You can now sign in.');
  });

  it('does not register a duplicate email', async () => {
    const res = await adminAgent.post('/api/auth/register').send(adminUser).expect(409);
    assert.ok(res.body.error);
  });

  it('logs in the first user and sets SameSite=Strict on auth cookies', async () => {
    const res = await adminAgent.post('/api/auth/login').send({ email: adminUser.email, password: adminUser.password }).expect(200);

    adminCookie = res.header['set-cookie'].find((cookie) => cookie.startsWith('auth_token=')).split(';')[0];

    assert.ok(res.body.user);
    assert.ok(adminCookie, 'Should set auth_token cookie');
    assert.strictEqual(
      res.header['set-cookie'].some((cookie) => cookie.includes('SameSite=Strict')),
      true,
      'Should set SameSite=Strict on auth cookies',
    );
  });

  it('fails login with an invalid password', async () => {
    await request(server).post('/api/auth/login').send({ email: adminUser.email, password: 'WrongPassword!' }).expect(401);
  });

  it('registers a later user as pending and notifies admins', async () => {
    const res = await secondUserAgent.post('/api/auth/register').send(pendingUser).expect(201);

    secondUserId = res.body.user.id;

    assert.strictEqual(res.body.user.role, 'editor');
    assert.strictEqual(res.body.user.status, 'pending');
    assert.strictEqual(res.body.message, 'Your account has been created and is pending administrator approval.');

    const notificationsRes = await adminAgent.get('/api/notifications').expect(200);
    const registrationRequest = notificationsRes.body.notifications.find((notification) => notification.type === 'registration_request');

    assert.ok(registrationRequest);
    assert.strictEqual(registrationRequest.data.userId, secondUserId);
    assert.strictEqual(registrationRequest.data.email, pendingUser.email);
  });

  it('blocks login for pending users', async () => {
    const res = await secondUserAgent.post('/api/auth/login').send({ email: pendingUser.email, password: pendingUser.password }).expect(403);
    assert.strictEqual(res.body.error, 'Your account is pending administrator approval.');
  });

  it('approves a pending user, creates a notification, and allows login', async () => {
    const approveRes = await adminAgent.post(`/api/admin/users/${secondUserId}/approve`).expect(200);
    assert.strictEqual(approveRes.body.status, 'active');

    const approvalNotification = db
      .prepare("SELECT type, title, message FROM notifications WHERE user_id = ? AND type = 'account_approved'")
      .get(secondUserId);

    assert.ok(approvalNotification);
    assert.strictEqual(approvalNotification.title, 'Account approved');

    const loginRes = await secondUserAgent.post('/api/auth/login').send({ email: pendingUser.email, password: pendingUser.password }).expect(200);
    secondUserCookie = loginRes.header['set-cookie'].find((cookie) => cookie.startsWith('auth_token=')).split(';')[0];

    assert.strictEqual(loginRes.body.user.email, pendingUser.email);
    assert.ok(secondUserCookie);
  });

  it('returns the authenticated user profile after approval', async () => {
    const res = await secondUserAgent.get('/api/auth/me').expect(200);
    assert.strictEqual(res.body.email, pendingUser.email);
  });

  it('removes access immediately when an active user is deactivated', async () => {
    await adminAgent.patch(`/api/admin/users/${secondUserId}`).send({ status: 'inactive' }).expect(200);

    const res = await request(server).get('/api/auth/me').set('Cookie', secondUserCookie).expect(403);
    assert.strictEqual(res.body.error, 'Account is deactivated');
  });

  it('rejects a pending user, blocks login, and allows later approval', async () => {
    const registerRes = await thirdUserAgent.post('/api/auth/register').send(rejectedUser).expect(201);
    thirdUserId = registerRes.body.user.id;
    assert.strictEqual(registerRes.body.user.status, 'pending');

    const rejectRes = await adminAgent.post(`/api/admin/users/${thirdUserId}/reject`).expect(200);
    assert.strictEqual(rejectRes.body.status, 'rejected');

    const rejectionNotification = db
      .prepare("SELECT type, title, message FROM notifications WHERE user_id = ? AND type = 'account_rejected'")
      .get(thirdUserId);

    assert.ok(rejectionNotification);
    assert.strictEqual(rejectionNotification.title, 'Registration not approved');

    const rejectedLoginRes = await thirdUserAgent
      .post('/api/auth/login')
      .send({ email: rejectedUser.email, password: rejectedUser.password })
      .expect(403);
    assert.strictEqual(rejectedLoginRes.body.error, 'Your registration was not approved.');

    const approveRes = await adminAgent.post(`/api/admin/users/${thirdUserId}/approve`).expect(200);
    assert.strictEqual(approveRes.body.status, 'active');

    await thirdUserAgent.post('/api/auth/login').send({ email: rejectedUser.email, password: rejectedUser.password }).expect(200);
  });

  it('returns 423 after repeated failed logins for the same account', async () => {
    const lockoutUser = {
      email: `test_lockout_${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Lockout User',
    };

    const registerRes = await request(server).post('/api/auth/register').send(lockoutUser).expect(201);
    await adminAgent.post(`/api/admin/users/${registerRes.body.user.id}/approve`).expect(200);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await request(server).post('/api/auth/login').send({ email: lockoutUser.email, password: 'WrongPassword!' }).expect(401);
    }

    const res = await request(server).post('/api/auth/login').send({ email: lockoutUser.email, password: 'WrongPassword!' }).expect(423);
    assert.strictEqual(res.body.error, 'Too many failed login attempts. Try again later.');
  });

  it('fails /api/auth/me without a token', async () => {
    await request(server).get('/api/auth/me').expect(401);
  });

  it('logs out successfully, clears the auth cookie, and revokes the existing token', async () => {
    const res = await adminAgent.post('/api/auth/logout').expect(200);

    assert.strictEqual(
      res.header['set-cookie'].some((cookie) => cookie.includes('SameSite=Strict')),
      true,
      'Should clear auth cookie with SameSite=Strict',
    );

    await adminAgent.get('/api/auth/me').expect(401);
    await request(server).get('/api/auth/me').set('Cookie', adminCookie).expect(403);
  });
});
