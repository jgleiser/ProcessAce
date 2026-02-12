const { describe, it } = require('node:test');
const assert = require('node:assert');

// Set up Environment for Testing BEFORE requiring modules
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

// Import service (this triggers DB init in memory)
const authService = require('../../src/services/authService');

describe('AuthService', async () => {
  it('should register a new user (admin by default)', async () => {
    const user = await authService.registerUser('Test Admin', 'admin@example.com', 'Password123');
    assert.strictEqual(user.email, 'admin@example.com');
    assert.strictEqual(user.role, 'admin'); // First user is admin
    assert.ok(user.id);
  });

  it('should register a second user as viewer', async () => {
    const user = await authService.registerUser('Test Viewer', 'viewer@example.com', 'Password123');
    assert.strictEqual(user.email, 'viewer@example.com');
    assert.strictEqual(user.role, 'viewer');
  });

  it('should fail to register user with weak password', async () => {
    await assert.rejects(async () => {
      await authService.registerUser('Weak User', 'weak@example.com', 'weak');
    }, /Password must be at least 8 characters/);
  });

  it('should authenticate valid user', async () => {
    const { user, token } = await authService.authenticateUser('admin@example.com', 'Password123');
    assert.strictEqual(user.email, 'admin@example.com');
    assert.ok(token);
  });

  it('should fail authentication with wrong password', async () => {
    await assert.rejects(async () => {
      await authService.authenticateUser('admin@example.com', 'WrongPass123');
    }, /Invalid email or password/);
  });

  it('should fail to register existing email', async () => {
    await assert.rejects(async () => {
      await authService.registerUser('Duplicate', 'admin@example.com', 'Password123');
    }, /User already exists/);
  });
});
