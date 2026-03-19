const { after, before, describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.UPLOADS_DIR = 'tmp/test-uploads-auth-service';

const uploadsDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR);

const authService = require('../../src/services/authService');
const workspaceService = require('../../src/services/workspaceService');
const db = require('../../src/services/db');
const tokenBlocklist = require('../../src/services/tokenBlocklist');
const { DEFAULT_PERSONAL_WORKSPACE_NAME, WORKSPACE_KINDS } = require('../../src/utils/workspaces');

const createUniqueUser = (prefix) => ({
  name: `${prefix} User`,
  email: `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}@example.com`,
  password: 'Password123',
});

const createActiveUser = async (prefix) => {
  const userDetails = createUniqueUser(prefix);
  const user = await authService.registerUser(userDetails.name, userDetails.email, userDetails.password, {
    ipAddress: '127.0.0.1',
  });

  if (user.status === 'pending') {
    authService.approveUser(user.id);
  }

  return userDetails;
};

const expireAccountLock = (userId) => {
  db.prepare('UPDATE login_attempts SET locked_until = ? WHERE user_id = ?').run(new Date(Date.now() - 1000).toISOString(), userId);
};

describe('AuthService', () => {
  let superadminUserDetails;
  let promotedAdminId;

  before(async () => {
    tokenBlocklist.__resetForTests();
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    fs.mkdirSync(uploadsDir, { recursive: true });

    superadminUserDetails = {
      name: 'Test Superadmin',
      email: 'superadmin@example.com',
      password: 'Password123',
    };

    await authService.registerUser(superadminUserDetails.name, superadminUserDetails.email, superadminUserDetails.password, {
      ipAddress: '127.0.0.1',
    });

    const promotedAdminDetails = createUniqueUser('delegated_admin');
    const promotedAdmin = await authService.registerUser(promotedAdminDetails.name, promotedAdminDetails.email, promotedAdminDetails.password, {
      ipAddress: '127.0.0.2',
    });
    authService.approveUser(promotedAdmin.id);
    promotedAdminId = promotedAdmin.id;
  });

  after(() => {
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  });

  it('registers the first user as an active superadmin and records required consent', () => {
    const user = authService.getUserRecordByEmail(superadminUserDetails.email);
    const consentRecords = authService.getConsentHistory(user.id);
    const bootstrapWorkspace = db.prepare('SELECT * FROM workspaces WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1').get(user.id);

    assert.strictEqual(user.email, superadminUserDetails.email);
    assert.strictEqual(user.role, 'superadmin');
    assert.strictEqual(user.status, 'active');
    assert.strictEqual(consentRecords.length, 2);
    assert.deepStrictEqual(consentRecords.map((record) => record.consent_type).sort(), ['data_processing', 'terms_of_service']);
    assert.strictEqual(bootstrapWorkspace.name, DEFAULT_PERSONAL_WORKSPACE_NAME);
    assert.strictEqual(bootstrapWorkspace.workspace_kind, WORKSPACE_KINDS.PERSONAL);
    assert.strictEqual(bootstrapWorkspace.personal_owner_user_id, user.id);
  });

  it('registers later users as pending editors', async () => {
    const user = await authService.registerUser('Test Editor', 'editor@example.com', 'Password123', {
      ipAddress: '127.0.0.3',
    });

    assert.strictEqual(user.email, 'editor@example.com');
    assert.strictEqual(user.role, 'editor');
    assert.strictEqual(user.status, 'pending');
  });

  it('fails to register a user with a weak password', async () => {
    await assert.rejects(async () => {
      await authService.registerUser('Weak User', 'weak@example.com', 'weak', {
        ipAddress: '127.0.0.4',
      });
    }, /Password must be at least 8 characters/);
  });

  it('issues JWTs with a jti claim, verifies against current user state, and records last_login_at', async () => {
    const { user, token } = await authService.authenticateUser(superadminUserDetails.email, superadminUserDetails.password);
    const decoded = jwt.decode(token);
    const verifiedUser = await authService.verifyToken(token);
    const persistedUser = authService.getUserById(user.id);

    assert.strictEqual(user.email, superadminUserDetails.email);
    assert.ok(decoded.jti);
    assert.strictEqual(verifiedUser.id, user.id);
    assert.strictEqual(verifiedUser.role, 'superadmin');
    assert.strictEqual(verifiedUser.status, 'active');
    assert.ok(persistedUser.last_login_at);
  });

  it('blocks login for pending, rejected, and inactive users', async () => {
    await assert.rejects(async () => {
      await authService.authenticateUser('editor@example.com', 'Password123');
    }, /pending administrator approval/);

    const rejectedCandidate = await authService.registerUser('Rejected User', 'rejected@example.com', 'Password123', {
      ipAddress: '127.0.0.5',
    });
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
    const { token } = await authService.authenticateUser(superadminUserDetails.email, superadminUserDetails.password);
    const revoked = await authService.revokeToken(token);

    assert.strictEqual(revoked, true);

    await assert.rejects(async () => {
      await authService.verifyToken(token);
    }, /Invalid token/);
  });

  it('allows only superadmins to assign admin or superadmin roles', async () => {
    const superadminActor = authService.getUserById(db.prepare('SELECT id FROM users WHERE email = ?').get(superadminUserDetails.email).id);
    const promotedAdmin = authService.updateUser(promotedAdminId, { role: 'admin' }, superadminActor);
    const regularUser = await createActiveUser('role_target');
    const regularUserRecord = db.prepare('SELECT id FROM users WHERE email = ?').get(regularUser.email);
    const adminActor = authService.getUserById(promotedAdminId);

    assert.strictEqual(promotedAdmin.role, 'admin');

    assert.throws(() => {
      authService.updateUser(regularUserRecord.id, { role: 'superadmin' }, adminActor);
    }, /Only superadmins can assign admin or superadmin roles/);

    assert.throws(() => {
      authService.updateUser(superadminActor.id, { status: 'inactive' }, adminActor);
    }, /Only superadmins can manage admin or superadmin accounts/);
  });

  it('prevents demoting or deactivating the last active superadmin', async () => {
    const superadminActor = authService.getUserById(db.prepare('SELECT id FROM users WHERE email = ?').get(superadminUserDetails.email).id);

    assert.throws(() => {
      authService.updateUser(superadminActor.id, { role: 'admin' }, superadminActor);
    }, /Cannot change the role of the last active superadmin/);

    await assert.rejects(async () => {
      await authService.deactivateUserAccount(superadminActor.id, superadminUserDetails.password);
    }, /Cannot deactivate the last active superadmin/);
  });

  it('exports user data without leaking password hashes or internal evidence paths', async () => {
    const exportUser = await createActiveUser('export_user');
    const exportRecord = db.prepare('SELECT id FROM users WHERE email = ?').get(exportUser.email);
    const evidenceId = 'evidence-export-test';

    await authService.authenticateUser(exportUser.email, exportUser.password);

    db.prepare(
      `
        INSERT INTO evidence (id, filename, originalName, mimeType, size, path, status, metadata, createdAt, updatedAt, user_id, workspace_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      evidenceId,
      'stored-file.txt',
      'Human Readable.txt',
      'text/plain',
      42,
      path.join('uploads', 'stored-file.txt'),
      'completed',
      JSON.stringify({ source: 'unit-test' }),
      new Date().toISOString(),
      new Date().toISOString(),
      exportRecord.id,
      null,
    );

    const exportPayload = authService.exportUserData(exportRecord.id);

    assert.ok(exportPayload.user.createdAt);
    assert.ok(exportPayload.user.lastLoginAt);
    assert.strictEqual(exportPayload.user.password_hash, undefined);
    assert.strictEqual(exportPayload.consentHistory.length, 2);
    assert.strictEqual(exportPayload.evidence[0].path, undefined);
    assert.strictEqual(exportPayload.evidence[0].originalName, 'Human Readable.txt');
  });

  it('deactivates a user with password confirmation, renames personal workspaces, and transfers named workspaces to the primary superadmin', async () => {
    const firstSuperadminId = db.prepare('SELECT id FROM users WHERE email = ?').get(superadminUserDetails.email).id;
    const secondSuperadminDetails = await createActiveUser('second_superadmin');
    const secondSuperadminRecord = db.prepare('SELECT id FROM users WHERE email = ?').get(secondSuperadminDetails.email);
    const firstSuperadminActor = authService.getUserById(firstSuperadminId);
    const ownerUserDetails = await createActiveUser('owned_workspace_user');
    const ownerUserRecord = db.prepare('SELECT id FROM users WHERE email = ?').get(ownerUserDetails.email);
    const personalWorkspace = db
      .prepare('SELECT * FROM workspaces WHERE owner_id = ? AND workspace_kind = ? ORDER BY created_at ASC LIMIT 1')
      .get(ownerUserRecord.id, WORKSPACE_KINDS.PERSONAL);
    const namedWorkspace = await workspaceService.createWorkspace('Operations Workspace', ownerUserRecord.id);

    authService.updateUser(secondSuperadminRecord.id, { role: 'superadmin' }, firstSuperadminActor);

    const updatedUser = await authService.deactivateUserAccount(ownerUserRecord.id, ownerUserDetails.password);
    const transferredPersonalWorkspace = workspaceService.getWorkspace(personalWorkspace.id);
    const transferredNamedWorkspace = workspaceService.getWorkspace(namedWorkspace.id);

    assert.strictEqual(updatedUser.status, 'inactive');
    assert.strictEqual(transferredPersonalWorkspace.owner_id, firstSuperadminId);
    assert.strictEqual(transferredPersonalWorkspace.workspace_kind, WORKSPACE_KINDS.PERSONAL);
    assert.strictEqual(transferredPersonalWorkspace.personal_owner_user_id, ownerUserRecord.id);
    assert.strictEqual(transferredPersonalWorkspace.name, `${ownerUserDetails.name} Personal Workspace`);
    assert.strictEqual(transferredNamedWorkspace.owner_id, firstSuperadminId);
    assert.strictEqual(transferredNamedWorkspace.workspace_kind, WORKSPACE_KINDS.NAMED);
    assert.strictEqual(workspaceService.isMember(personalWorkspace.id, firstSuperadminId), true);
    assert.strictEqual(workspaceService.isMember(namedWorkspace.id, firstSuperadminId), true);
  });

  it('repairs a stale My Workspace row before deactivation so it is renamed and transferred as personal', async () => {
    const superadminId = db.prepare('SELECT id FROM users WHERE email = ?').get(superadminUserDetails.email).id;
    const staleUserDetails = await createActiveUser('stale_personal_workspace');
    const staleUserRecord = db.prepare('SELECT id FROM users WHERE email = ?').get(staleUserDetails.email);
    const staleWorkspace = db
      .prepare('SELECT * FROM workspaces WHERE owner_id = ? AND name = ? ORDER BY created_at ASC LIMIT 1')
      .get(staleUserRecord.id, DEFAULT_PERSONAL_WORKSPACE_NAME);

    db.prepare('UPDATE workspaces SET workspace_kind = ?, personal_owner_user_id = NULL WHERE id = ?').run(WORKSPACE_KINDS.NAMED, staleWorkspace.id);

    await authService.deactivateUserAccount(staleUserRecord.id, staleUserDetails.password);

    const transferredWorkspace = workspaceService.getWorkspace(staleWorkspace.id);

    assert.strictEqual(transferredWorkspace.owner_id, superadminId);
    assert.strictEqual(transferredWorkspace.workspace_kind, WORKSPACE_KINDS.PERSONAL);
    assert.strictEqual(transferredWorkspace.personal_owner_user_id, staleUserRecord.id);
    assert.strictEqual(transferredWorkspace.name, `${staleUserDetails.name} Personal Workspace`);
  });

  it('restores transferred personal workspaces when an inactive user is reactivated', async () => {
    const superadminActor = authService.getUserById(db.prepare('SELECT id FROM users WHERE email = ?').get(superadminUserDetails.email).id);
    const reactivationUserDetails = await createActiveUser('reactivation_user');
    const reactivationUserRecord = db.prepare('SELECT id FROM users WHERE email = ?').get(reactivationUserDetails.email);
    const personalWorkspace = db
      .prepare('SELECT * FROM workspaces WHERE owner_id = ? AND workspace_kind = ? ORDER BY created_at ASC LIMIT 1')
      .get(reactivationUserRecord.id, WORKSPACE_KINDS.PERSONAL);
    const namedWorkspace = await workspaceService.createWorkspace('Transfer Stays Named', reactivationUserRecord.id);

    await authService.deactivateUserAccount(reactivationUserRecord.id, reactivationUserDetails.password);
    const deactivatedPersonalWorkspace = workspaceService.getWorkspace(personalWorkspace.id);
    assert.notStrictEqual(deactivatedPersonalWorkspace.owner_id, reactivationUserRecord.id);

    const reactivatedUser = authService.updateUser(reactivationUserRecord.id, { status: 'active' }, superadminActor);
    const restoredPersonalWorkspace = workspaceService.getWorkspace(personalWorkspace.id);
    const retainedNamedWorkspace = workspaceService.getWorkspace(namedWorkspace.id);

    assert.strictEqual(reactivatedUser.status, 'active');
    assert.strictEqual(restoredPersonalWorkspace.owner_id, reactivationUserRecord.id);
    assert.strictEqual(restoredPersonalWorkspace.name, DEFAULT_PERSONAL_WORKSPACE_NAME);
    assert.strictEqual(restoredPersonalWorkspace.workspace_kind, WORKSPACE_KINDS.PERSONAL);
    assert.strictEqual(restoredPersonalWorkspace.personal_owner_user_id, reactivationUserRecord.id);
    assert.strictEqual(retainedNamedWorkspace.owner_id, superadminActor.id);
  });

  it('fails to register an existing email', async () => {
    await assert.rejects(async () => {
      await authService.registerUser('Duplicate', superadminUserDetails.email, 'Password123', {
        ipAddress: '127.0.0.6',
      });
    }, /User already exists/);
  });

  it('resets the instance, clears uploads, and allows bootstrap superadmin registration again', async () => {
    const superadminId = db.prepare('SELECT id FROM users WHERE email = ?').get(superadminUserDetails.email).id;

    fs.writeFileSync(path.join(uploadsDir, 'reset-me.txt'), 'temporary upload');
    await authService.resetInstance(superadminId, superadminUserDetails.password, 'DELETE ALL');

    const tableCounts = {
      users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      workspaces: db.prepare('SELECT COUNT(*) as count FROM workspaces').get().count,
      notifications: db.prepare('SELECT COUNT(*) as count FROM notifications').get().count,
      consent_records: db.prepare('SELECT COUNT(*) as count FROM consent_records').get().count,
    };

    assert.deepStrictEqual(tableCounts, {
      users: 0,
      workspaces: 0,
      notifications: 0,
      consent_records: 0,
    });
    assert.strictEqual(fs.existsSync(path.join(uploadsDir, 'reset-me.txt')), false);

    const bootstrapUser = await authService.registerUser('New Bootstrap', 'new_bootstrap@example.com', 'Password123', {
      ipAddress: '127.0.0.7',
    });
    assert.strictEqual(bootstrapUser.role, 'superadmin');
    assert.strictEqual(bootstrapUser.status, 'active');
  });
});
