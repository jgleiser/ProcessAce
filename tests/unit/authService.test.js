const { before, describe, it } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const authService = require('../../src/services/authService');
const db = require('../../src/services/db');
const tokenBlocklist = require('../../src/services/tokenBlocklist');

const createUniqueUser = (prefix) => ({
  name: `${prefix} User`,
  email: `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}@example.com`,
  password: 'Password123',
});

const createActiveUser = async (prefix) => {
  const userDetails = createUniqueUser(prefix);
  const user = await authService.registerUser(userDetails.name, userDetails.email, userDetails.password);

  if (user.status === 'pending') {
    authService.approveUser(user.id);
  }

  return userDetails;
};

const expireAccountLock = (userId) => {
  db.prepare('UPDATE login_attempts SET locked_until = ? WHERE user_id = ?').run(new Date(Date.now() - 1000).toISOString(), userId);
};

describe('AuthService', () => {
  before(() => {
    tokenBlocklist.__resetForTests();
  });

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

  it('issues JWTs with a jti claim and verifies against current user state', async () => {
    const { user, token } = await authService.authenticateUser('admin@example.com', 'Password123');
    const decoded = jwt.decode(token);
    const verifiedUser = await authService.verifyToken(token);

    assert.strictEqual(user.email, 'admin@example.com');
    assert.ok(decoded.jti);
    assert.strictEqual(verifiedUser.id, user.id);
    assert.strictEqual(verifiedUser.role, 'admin');
    assert.strictEqual(verifiedUser.status, 'active');
  });

  it('blocks login for pending, rejected, and inactive users', async () => {
    await assert.rejects(async () => {
      await authService.authenticateUser('editor@example.com', 'Password123');
    }, /pending administrator approval/);

    const rejectedCandidate = await authService.registerUser('Rejected User', 'rejected@example.com', 'Password123');
    authService.rejectUser(rejectedCandidate.id);

    await assert.rejects(async () => {
      await authService.authenticateUser('rejected@example.com', 'Password123');
    }, /not approved/);

    const inactiveUser = await createActiveUser('inactive_user');
    const inactiveRecord = db.prepare('SELECT id FROM users WHERE email = ?').get(inactiveUser.email);
    authService.updateUser(inactiveRecord.id, { status: 'inactive' });

    await assert.rejects(async () => {
      await authService.authenticateUser(inactiveUser.email, inactiveUser.password);
    }, /Account is deactivated/);
  });

  it('locks accounts after repeated failed logins and escalates lock duration', async () => {
    const lockoutUser = await createActiveUser('lockout_user');
    const userRecord = db.prepare('SELECT id FROM users WHERE email = ?').get(lockoutUser.email);

    for (let attempt = 1; attempt < authService.LOCKOUT_THRESHOLD; attempt += 1) {
      await assert.rejects(async () => {
        await authService.authenticateUser(lockoutUser.email, 'WrongPass123');
      }, /Invalid email or password/);
    }

    let loginAttempt = authService.getLoginAttempt(userRecord.id);
    assert.strictEqual(loginAttempt.attempt_count, 4);
    assert.strictEqual(loginAttempt.locked_until, null);

    await assert.rejects(async () => {
      await authService.authenticateUser(lockoutUser.email, 'WrongPass123');
    }, /Too many failed login attempts/);

    loginAttempt = authService.getLoginAttempt(userRecord.id);
    assert.strictEqual(loginAttempt.attempt_count, 5);
    assert.ok(loginAttempt.locked_until);

    expireAccountLock(userRecord.id);

    await assert.rejects(async () => {
      await authService.authenticateUser(lockoutUser.email, 'WrongPass123');
    }, /Too many failed login attempts/);

    loginAttempt = authService.getLoginAttempt(userRecord.id);
    assert.strictEqual(loginAttempt.attempt_count, 6);
    assert.ok(new Date(loginAttempt.locked_until).getTime() - Date.now() > 25 * 60 * 1000);

    expireAccountLock(userRecord.id);

    await assert.rejects(async () => {
      await authService.authenticateUser(lockoutUser.email, 'WrongPass123');
    }, /Too many failed login attempts/);

    loginAttempt = authService.getLoginAttempt(userRecord.id);
    assert.strictEqual(loginAttempt.attempt_count, 7);
    assert.ok(new Date(loginAttempt.locked_until).getTime() - Date.now() > 55 * 60 * 1000);
  });

  it('resets failed login counters after a successful login', async () => {
    const resetUser = await createActiveUser('reset_user');
    const userRecord = db.prepare('SELECT id FROM users WHERE email = ?').get(resetUser.email);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await assert.rejects(async () => {
        await authService.authenticateUser(resetUser.email, 'WrongPass123');
      }, /Invalid email or password/);
    }

    await authService.authenticateUser(resetUser.email, resetUser.password);

    assert.strictEqual(authService.getLoginAttempt(userRecord.id), null);
  });

  it('revokes issued tokens', async () => {
    const { token } = await authService.authenticateUser('admin@example.com', 'Password123');
    const revoked = await authService.revokeToken(token);

    assert.strictEqual(revoked, true);

    await assert.rejects(async () => {
      await authService.verifyToken(token);
    }, /Invalid token/);
  });

  it('fails to register an existing email', async () => {
    await assert.rejects(async () => {
      await authService.registerUser('Duplicate', 'admin@example.com', 'Password123');
    }, /User already exists/);
  });
});
