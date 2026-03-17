const { describe, it } = require('node:test');
const assert = require('node:assert');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const authService = require('../../src/services/authService');

describe('AuthService', () => {
  it('registers the first user as an active admin', async () => {
    const user = await authService.registerUser('Test Admin', 'admin@example.com', 'Password123');

    assert.strictEqual(user.email, 'admin@example.com');
    assert.strictEqual(user.role, 'admin');
    assert.strictEqual(user.status, 'active');
    assert.ok(user.id);
  });

  it('registers later users as pending editors', async () => {
    const user = await authService.registerUser('Test Editor', 'editor@example.com', 'Password123');

    assert.strictEqual(user.email, 'editor@example.com');
    assert.strictEqual(user.role, 'editor');
    assert.strictEqual(user.status, 'pending');
  });

  it('fails to register a user with a weak password', async () => {
    await assert.rejects(async () => {
      await authService.registerUser('Weak User', 'weak@example.com', 'weak');
    }, /Password must be at least 8 characters/);
  });

  it('authenticates an active user with valid credentials', async () => {
    const { user, token } = await authService.authenticateUser('admin@example.com', 'Password123');

    assert.strictEqual(user.email, 'admin@example.com');
    assert.ok(token);
  });

  it('blocks login for pending users', async () => {
    await assert.rejects(async () => {
      await authService.authenticateUser('editor@example.com', 'Password123');
    }, /pending administrator approval/);
  });

  it('approves a pending user and then allows login', async () => {
    const pendingUser = authService.getAllUsers().find((user) => user.email === 'editor@example.com');
    const approvedUser = authService.approveUser(pendingUser.id);
    const { user, token } = await authService.authenticateUser('editor@example.com', 'Password123');

    assert.strictEqual(approvedUser.status, 'active');
    assert.strictEqual(user.email, 'editor@example.com');
    assert.ok(token);
  });

  it('rejects a pending user and blocks login until later approval', async () => {
    const rejectedCandidate = await authService.registerUser('Rejected User', 'rejected@example.com', 'Password123');
    const rejectedUser = authService.rejectUser(rejectedCandidate.id);

    assert.strictEqual(rejectedUser.status, 'rejected');

    await assert.rejects(async () => {
      await authService.authenticateUser('rejected@example.com', 'Password123');
    }, /not approved/);

    const approvedUser = authService.approveUser(rejectedCandidate.id);
    const { user, token } = await authService.authenticateUser('rejected@example.com', 'Password123');

    assert.strictEqual(approvedUser.status, 'active');
    assert.strictEqual(user.email, 'rejected@example.com');
    assert.ok(token);
  });

  it('fails authentication with the wrong password', async () => {
    await assert.rejects(async () => {
      await authService.authenticateUser('admin@example.com', 'WrongPass123');
    }, /Invalid email or password/);
  });

  it('fails to register an existing email', async () => {
    await assert.rejects(async () => {
      await authService.registerUser('Duplicate', 'admin@example.com', 'Password123');
    }, /User already exists/);
  });
});
