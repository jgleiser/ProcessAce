const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../logging/logger');
const tokenBlocklist = require('./tokenBlocklist');
const { USER_ROLES, isAdminRole, isSuperAdminRole } = require('../utils/roles');
const { DEFAULT_PERSONAL_WORKSPACE_NAME, WORKSPACE_KINDS } = require('../utils/workspaces');
const { UPLOADS_DIR } = require('../config/storagePaths');

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = '24h';
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_ERROR_MSG = 'Password must be at least 8 characters long and include uppercase, lowercase, and numbers.';
const INVALID_CREDENTIALS_ERROR = 'Invalid email or password';
const INVALID_TOKEN_ERROR = 'Invalid token';
const ACCOUNT_INACTIVE_ERROR = 'Account is deactivated';
const ACCOUNT_PENDING_ERROR = 'Your account is pending administrator approval.';
const ACCOUNT_REJECTED_ERROR = 'Your registration was not approved.';
const ACCOUNT_LOCKED_ERROR = 'Too many failed login attempts. Try again later.';
const CURRENT_PASSWORD_REQUIRED_ERROR = 'Current password is required';
const CURRENT_PASSWORD_REQUIRED_DEACTIVATE_ERROR = 'Current password is required to deactivate your account';
const INCORRECT_CURRENT_PASSWORD_ERROR = 'Incorrect current password';
const LAST_SUPERADMIN_DEACTIVATION_ERROR = 'Cannot deactivate the last active superadmin';
const LAST_SUPERADMIN_ROLE_CHANGE_ERROR = 'Cannot change the role of the last active superadmin';
const SUPERADMIN_ROLE_REQUIRED_ERROR = 'Only superadmins can assign admin or superadmin roles';
const SUPERADMIN_ACCOUNT_MANAGEMENT_ERROR = 'Only superadmins can manage admin or superadmin accounts';
const NO_PRIMARY_SUPERADMIN_ERROR = 'No active superadmin is available to receive workspace ownership';
const RESET_CONFIRMATION_ERROR = 'Confirmation text must be exactly DELETE ALL';
const APPROVABLE_STATUSES = new Set(['pending', 'rejected']);
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATIONS_MINUTES = [15, 30, 60];
const CONSENT_TYPES = ['terms_of_service', 'data_processing'];
const MAX_USERS_PAGE_LIMIT = 100;
const resolveJwtSecret = () => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    logger.fatal('JWT_SECRET environment variable is required in production.');
    throw new Error('JWT_SECRET environment variable is required in production.');
  }

  const devSecret = crypto.randomBytes(32).toString('hex');
  logger.warn('JWT_SECRET is not set. Using a random per-process secret (dev only). Sessions will not survive restarts.');
  return devSecret;
};

const JWT_SECRET = resolveJwtSecret();
const db = require('./db');
const workspaceService = require('./workspaceService');

const getLockoutDurationMinutes = (attemptCount) => {
  if (attemptCount < LOCKOUT_THRESHOLD) {
    return 0;
  }

  const escalationIndex = Math.min(attemptCount - LOCKOUT_THRESHOLD, LOCKOUT_DURATIONS_MINUTES.length - 1);
  return LOCKOUT_DURATIONS_MINUTES[escalationIndex];
};

const isLockActive = (lockedUntil) => {
  if (!lockedUntil) {
    return false;
  }

  const lockedUntilTimestamp = Date.parse(lockedUntil);
  return Number.isFinite(lockedUntilTimestamp) && lockedUntilTimestamp > Date.now();
};

const parseJson = (value, fallback = null) => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const ensureUploadsDirectory = () => {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
};

const clearUploadsDirectory = () => {
  ensureUploadsDirectory();

  fs.readdirSync(UPLOADS_DIR, { withFileTypes: true }).forEach((entry) => {
    fs.rmSync(path.join(UPLOADS_DIR, entry.name), { recursive: true, force: true });
  });
};

class AuthService {
  getUserRecordById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  getUserRecordByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }

  createConsentRecords(userId, ipAddress, timestamp = new Date().toISOString()) {
    const insertConsent = db.prepare(
      `
        INSERT INTO consent_records (id, user_id, consent_type, granted, timestamp, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    );

    CONSENT_TYPES.forEach((consentType) => {
      insertConsent.run(uuidv4(), userId, consentType, 1, timestamp, ipAddress || null);
    });
  }

  getActiveSuperAdmins(excludedUserId = null) {
    if (excludedUserId) {
      return db
        .prepare(
          "SELECT id, name, email, role, status, created_at, last_login_at FROM users WHERE role = 'superadmin' AND status = 'active' AND id != ? ORDER BY created_at ASC",
        )
        .all(excludedUserId);
    }

    return db
      .prepare(
        "SELECT id, name, email, role, status, created_at, last_login_at FROM users WHERE role = 'superadmin' AND status = 'active' ORDER BY created_at ASC",
      )
      .all();
  }

  getPrimarySuperAdmin(excludedUserId = null) {
    return this.getActiveSuperAdmins(excludedUserId)[0] || null;
  }

  isLastActiveSuperAdmin(userId) {
    const user = this.getUserById(userId);
    if (!user || user.role !== 'superadmin' || user.status !== 'active') {
      return false;
    }

    const result = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'superadmin' AND status = 'active'").get();
    return result.count <= 1;
  }

  async registerUser(name, email, password, options = {}) {
    try {
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existingUser) {
        throw new Error('User already exists');
      }

      if (!PASSWORD_REGEX.test(password)) {
        throw new Error(PASSWORD_ERROR_MSG);
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const userId = uuidv4();
      const workspaceId = uuidv4();
      const now = new Date().toISOString();

      const registerTransaction = db.transaction(() => {
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
        const role = userCount.count === 0 ? 'superadmin' : 'editor';
        const status = userCount.count === 0 ? 'active' : 'pending';

        db.prepare('INSERT INTO users (id, name, email, password_hash, created_at, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          userId,
          name,
          email,
          passwordHash,
          now,
          role,
          status,
        );

        db.prepare(
          `
            INSERT INTO workspaces (id, name, owner_id, created_at, workspace_kind, personal_owner_user_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
        ).run(workspaceId, DEFAULT_PERSONAL_WORKSPACE_NAME, userId, now, WORKSPACE_KINDS.PERSONAL, userId);
        db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(workspaceId, userId, 'admin');
        this.createConsentRecords(userId, options.ipAddress, now);

        return { role, status };
      });

      const { role, status } = registerTransaction();

      logger.info({ userId, role, status }, 'User registered successfully');

      return { id: userId, name, email, role, status, createdAt: now, lastLoginAt: null };
    } catch (error) {
      logger.error({ err: error }, 'Error registering user');
      throw error;
    }
  }

  getLoginAttempt(userId) {
    return db.prepare('SELECT user_id, attempt_count, locked_until FROM login_attempts WHERE user_id = ?').get(userId) || null;
  }

  clearFailedLoginAttempts(userId) {
    db.prepare('DELETE FROM login_attempts WHERE user_id = ?').run(userId);
  }

  recordFailedLoginAttempt(userId) {
    const currentAttempt = this.getLoginAttempt(userId);
    const nextAttemptCount = (currentAttempt?.attempt_count || 0) + 1;
    const lockoutDurationMinutes = getLockoutDurationMinutes(nextAttemptCount);
    const lockedUntil =
      lockoutDurationMinutes > 0 ? new Date(Date.now() + lockoutDurationMinutes * 60 * 1000).toISOString() : currentAttempt?.locked_until || null;

    db.prepare(
      `
        INSERT INTO login_attempts (user_id, attempt_count, locked_until)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          attempt_count = excluded.attempt_count,
          locked_until = excluded.locked_until
      `,
    ).run(userId, nextAttemptCount, lockedUntil);

    return {
      attemptCount: nextAttemptCount,
      lockedUntil,
      lockoutDurationMinutes,
    };
  }

  getActiveLock(userId) {
    const attempt = this.getLoginAttempt(userId);
    if (!attempt || !isLockActive(attempt.locked_until)) {
      return null;
    }

    return {
      attemptCount: attempt.attempt_count,
      lockedUntil: attempt.locked_until,
      lockoutDurationMinutes: getLockoutDurationMinutes(attempt.attempt_count),
    };
  }

  async authenticateUser(email, password) {
    try {
      const user = this.getUserRecordByEmail(email);
      if (!user) {
        throw new Error(INVALID_CREDENTIALS_ERROR);
      }

      const activeLock = this.getActiveLock(user.id);
      if (activeLock) {
        logger.warn({ userId: user.id, lockedUntil: activeLock.lockedUntil }, 'Blocked login attempt for locked account');
        throw new Error(ACCOUNT_LOCKED_ERROR);
      }

      const passwordMatches = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatches) {
        const failedAttempt = this.recordFailedLoginAttempt(user.id);

        if (failedAttempt.lockedUntil && isLockActive(failedAttempt.lockedUntil)) {
          logger.warn(
            { userId: user.id, attemptCount: failedAttempt.attemptCount, lockedUntil: failedAttempt.lockedUntil },
            'Account locked after failed login attempts',
          );
          throw new Error(ACCOUNT_LOCKED_ERROR);
        }

        throw new Error(INVALID_CREDENTIALS_ERROR);
      }

      if (user.status === 'inactive') {
        throw new Error(ACCOUNT_INACTIVE_ERROR);
      }

      if (user.status === 'pending') {
        throw new Error(ACCOUNT_PENDING_ERROR);
      }

      if (user.status === 'rejected') {
        throw new Error(ACCOUNT_REJECTED_ERROR);
      }

      const now = new Date().toISOString();
      this.clearFailedLoginAttempts(user.id);
      db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, user.id);

      const token = jwt.sign({ id: user.id, email: user.email, role: user.role, jti: uuidv4() }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
      });

      const workspace = db.prepare('SELECT workspace_id FROM workspace_members WHERE user_id = ? ORDER BY workspace_id ASC LIMIT 1').get(user.id);
      const workspaceId = workspace ? workspace.workspace_id : null;

      return {
        user: { id: user.id, email: user.email, role: user.role, status: user.status, workspaceId },
        token,
      };
    } catch (error) {
      logger.warn({ err: error.message }, 'Authentication failed');
      throw error;
    }
  }

  async revokeToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return await tokenBlocklist.revokeToken(decoded, token);
    } catch {
      return false;
    }
  }

  async verifyToken(token) {
    let decodedToken;

    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch {
      throw new Error(INVALID_TOKEN_ERROR);
    }

    const isRevoked = await tokenBlocklist.isTokenRevoked(decodedToken, token);
    if (isRevoked) {
      throw new Error(INVALID_TOKEN_ERROR);
    }

    const user = this.getUserById(decodedToken.id);
    if (!user) {
      throw new Error(INVALID_TOKEN_ERROR);
    }

    if (user.status === 'inactive') {
      throw new Error(ACCOUNT_INACTIVE_ERROR);
    }

    if (user.status === 'pending') {
      throw new Error(ACCOUNT_PENDING_ERROR);
    }

    if (user.status === 'rejected') {
      throw new Error(ACCOUNT_REJECTED_ERROR);
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
      last_login_at: user.last_login_at,
      iat: decodedToken.iat,
      exp: decodedToken.exp,
      jti: decodedToken.jti,
    };
  }

  getUserById(id) {
    return db.prepare('SELECT id, name, email, role, status, created_at, last_login_at FROM users WHERE id = ?').get(id);
  }

  getAllUsers() {
    return db.prepare('SELECT id, name, email, role, status, created_at, last_login_at FROM users ORDER BY created_at ASC').all();
  }

  getUsersPaginated(page = 1, limit = 10, filters = {}) {
    if (!Number.isInteger(page) || page < 1) {
      throw new Error('Invalid pagination parameters: page must be a positive integer.');
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_USERS_PAGE_LIMIT) {
      throw new Error(`Invalid pagination parameters: limit must be between 1 and ${MAX_USERS_PAGE_LIMIT}.`);
    }

    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (filters.name) {
      whereClauses.push('name LIKE ?');
      params.push(`%${filters.name}%`);
    }

    if (filters.email) {
      whereClauses.push('email LIKE ?');
      params.push(`%${filters.email}%`);
    }

    if (filters.role && filters.role !== 'All') {
      whereClauses.push('role = ?');
      params.push(filters.role);
    }

    if (filters.status && filters.status !== 'All') {
      whereClauses.push('status = ?');
      params.push(filters.status);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countQuery = `SELECT COUNT(*) as count FROM users ${whereSql}`;
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    const usersQuery = `
      SELECT id, name, email, role, status, created_at, last_login_at
      FROM users
      ${whereSql}
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `;

    const users = db.prepare(usersQuery).all(...params, limit, offset);

    return { users, total, totalPages };
  }

  updateUser(id, updates, actor = null) {
    const user = this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const { role, status } = updates;

    if (role && !USER_ROLES.includes(role)) {
      throw new Error('Invalid role. Must be superadmin, admin, editor, or viewer');
    }
    if (status && !['active', 'inactive'].includes(status)) {
      throw new Error('Invalid status. Must be active or inactive');
    }

    if (actor) {
      if (!isAdminRole(actor.role)) {
        throw new Error('Access denied. Admin privileges required.');
      }

      if (!isSuperAdminRole(actor.role)) {
        if (isAdminRole(user.role)) {
          throw new Error(SUPERADMIN_ACCOUNT_MANAGEMENT_ERROR);
        }

        if (role && isAdminRole(role)) {
          throw new Error(SUPERADMIN_ROLE_REQUIRED_ERROR);
        }
      }
    }

    if (role && user.role === 'superadmin' && role !== 'superadmin' && this.isLastActiveSuperAdmin(id)) {
      throw new Error(LAST_SUPERADMIN_ROLE_CHANGE_ERROR);
    }

    if (status === 'inactive' && user.role === 'superadmin' && this.isLastActiveSuperAdmin(id)) {
      throw new Error(LAST_SUPERADMIN_DEACTIVATION_ERROR);
    }

    if (role) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
      logger.info({ userId: id, newRole: role }, 'User role updated');
    }
    if (status) {
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
      if (status === 'active' && user.status === 'inactive') {
        workspaceService.restorePersonalWorkspaces(id);
      }
      logger.info({ userId: id, newStatus: status }, 'User status updated');
    }

    return this.getUserById(id);
  }

  async updateUserProfile(id, { name, password, currentPassword }) {
    const user = this.getUserRecordById(id);
    if (!user) {
      throw new Error('User not found');
    }

    if (name) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id);
    }

    if (password) {
      if (!currentPassword) {
        throw new Error('Current password is required to set a new password');
      }
      const match = await bcrypt.compare(currentPassword, user.password_hash);
      if (!match) {
        throw new Error(INCORRECT_CURRENT_PASSWORD_ERROR);
      }

      if (!PASSWORD_REGEX.test(password)) {
        throw new Error(PASSWORD_ERROR_MSG);
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
    }

    return this.getUserById(id);
  }

  searchUsers(query) {
    if (!query || query.length < 2) {
      return [];
    }

    const likeQuery = `%${query}%`;
    return db.prepare('SELECT id, name, email FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY name ASC LIMIT 10').all(likeQuery, likeQuery);
  }

  approveUser(id) {
    const user = db.prepare('SELECT id, status FROM users WHERE id = ?').get(id);
    if (!user) {
      throw new Error('User not found');
    }

    if (!APPROVABLE_STATUSES.has(user.status)) {
      throw new Error('Only pending or rejected users can be approved');
    }

    db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(id);
    logger.info({ userId: id }, 'User approved');
    return this.getUserById(id);
  }

  rejectUser(id) {
    const user = db.prepare('SELECT id, status FROM users WHERE id = ?').get(id);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.status !== 'pending') {
      throw new Error('Only pending users can be rejected');
    }

    db.prepare("UPDATE users SET status = 'rejected' WHERE id = ?").run(id);
    logger.info({ userId: id }, 'User rejected');
    return this.getUserById(id);
  }

  getConsentHistory(userId) {
    return db
      .prepare(
        `
          SELECT id, consent_type, granted, timestamp, ip_address
          FROM consent_records
          WHERE user_id = ?
          ORDER BY timestamp DESC, consent_type ASC
        `,
      )
      .all(userId)
      .map((record) => ({
        ...record,
        granted: Boolean(record.granted),
      }));
  }

  exportUserData(userId) {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const workspaces = db
      .prepare(
        `
          SELECT
            w.id,
            w.name,
            w.owner_id,
            w.created_at,
            wm.role,
            (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) as member_count,
            (SELECT COUNT(*) FROM evidence WHERE workspace_id = w.id) as evidence_count,
            (SELECT COUNT(*) FROM artifacts WHERE workspace_id = w.id) as artifact_count,
            (SELECT COUNT(*) FROM jobs WHERE workspace_id = w.id) as job_count
          FROM workspace_members wm
          JOIN workspaces w ON w.id = wm.workspace_id
          WHERE wm.user_id = ?
          ORDER BY w.created_at ASC
        `,
      )
      .all(userId)
      .map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.created_at,
        role: workspace.owner_id === userId ? 'owner' : workspace.role,
        ownedByUser: workspace.owner_id === userId,
        stats: {
          members: workspace.member_count,
          evidence: workspace.evidence_count,
          artifacts: workspace.artifact_count,
          jobs: workspace.job_count,
        },
      }));

    const evidence = db
      .prepare(
        `
          SELECT id, originalName, mimeType, size, status, metadata, createdAt, updatedAt, workspace_id
          FROM evidence
          WHERE user_id = ?
          ORDER BY createdAt ASC
        `,
      )
      .all(userId)
      .map((item) => ({
        id: item.id,
        originalName: item.originalName,
        mimeType: item.mimeType,
        size: item.size,
        status: item.status,
        metadata: parseJson(item.metadata, {}),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        workspaceId: item.workspace_id,
      }));

    const artifacts = db
      .prepare(
        `
          SELECT id, type, version, content, metadata, createdBy, createdAt, previousVersionId, filename, workspace_id, llm_provider, llm_model
          FROM artifacts
          WHERE user_id = ?
          ORDER BY createdAt ASC, version ASC
        `,
      )
      .all(userId)
      .map((artifact) => ({
        id: artifact.id,
        type: artifact.type,
        version: artifact.version,
        content: artifact.content,
        metadata: parseJson(artifact.metadata, {}),
        createdBy: artifact.createdBy,
        createdAt: artifact.createdAt,
        previousVersionId: artifact.previousVersionId,
        filename: artifact.filename,
        workspaceId: artifact.workspace_id,
        llmProvider: artifact.llm_provider,
        llmModel: artifact.llm_model,
      }));

    const jobs = db
      .prepare(
        `
          SELECT id, type, data, status, result, error, createdAt, updatedAt, workspace_id, process_name, progress, progress_message
          FROM jobs
          WHERE user_id = ?
          ORDER BY createdAt ASC
        `,
      )
      .all(userId)
      .map((job) => ({
        id: job.id,
        type: job.type,
        data: parseJson(job.data, {}),
        status: job.status,
        result: parseJson(job.result, job.result || null),
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        workspaceId: job.workspace_id,
        processName: job.process_name,
        progress: job.progress,
        progressMessage: job.progress_message,
      }));

    const notifications = db
      .prepare(
        `
          SELECT id, type, title, is_read, created_at
          FROM notifications
          WHERE user_id = ?
          ORDER BY created_at DESC
        `,
      )
      .all(userId)
      .map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        isRead: Boolean(notification.is_read),
        createdAt: notification.created_at,
      }));

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      },
      workspaces,
      evidence,
      artifacts,
      jobs,
      notifications,
      consentHistory: this.getConsentHistory(userId),
    };
  }

  async deactivateUserAccount(userId, currentPassword) {
    if (!currentPassword) {
      throw new Error(CURRENT_PASSWORD_REQUIRED_DEACTIVATE_ERROR);
    }

    const user = this.getUserRecordById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) {
      throw new Error(INCORRECT_CURRENT_PASSWORD_ERROR);
    }

    if (this.isLastActiveSuperAdmin(userId)) {
      throw new Error(LAST_SUPERADMIN_DEACTIVATION_ERROR);
    }

    const ownedWorkspaceCount = db.prepare('SELECT COUNT(*) as count FROM workspaces WHERE owner_id = ?').get(userId).count;
    const primarySuperAdmin = ownedWorkspaceCount > 0 ? this.getPrimarySuperAdmin(userId) : null;

    if (ownedWorkspaceCount > 0 && !primarySuperAdmin) {
      throw new Error(NO_PRIMARY_SUPERADMIN_ERROR);
    }

    const deactivateTransaction = db.transaction(() => {
      if (ownedWorkspaceCount > 0) {
        workspaceService.transferOwnedWorkspaces(userId, primarySuperAdmin.id);
      }

      db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(userId);
      return this.getUserById(userId);
    });

    const updatedUser = deactivateTransaction();
    logger.info({ userId, transferredWorkspaceOwnerId: primarySuperAdmin?.id || null }, 'User account deactivated');
    return updatedUser;
  }

  async resetInstance(actorId, currentPassword, confirmationText) {
    if (!currentPassword) {
      throw new Error(CURRENT_PASSWORD_REQUIRED_ERROR);
    }

    if (confirmationText !== 'DELETE ALL') {
      throw new Error(RESET_CONFIRMATION_ERROR);
    }

    const actor = this.getUserRecordById(actorId);
    if (!actor || !isSuperAdminRole(actor.role)) {
      throw new Error('Access denied. Superadmin privileges required.');
    }

    const matches = await bcrypt.compare(currentPassword, actor.password_hash);
    if (!matches) {
      throw new Error(INCORRECT_CURRENT_PASSWORD_ERROR);
    }

    const resetTransaction = db.transaction(() => {
      db.prepare('DELETE FROM workspace_members').run();
      db.prepare('DELETE FROM workspace_invitations').run();
      db.prepare('DELETE FROM jobs').run();
      db.prepare('DELETE FROM evidence').run();
      db.prepare('DELETE FROM artifacts').run();
      db.prepare('DELETE FROM notifications').run();
      db.prepare('DELETE FROM consent_records').run();
      db.prepare('DELETE FROM login_attempts').run();
      db.prepare('DELETE FROM app_settings').run();
      db.prepare('DELETE FROM workspaces').run();
      db.prepare('DELETE FROM users').run();
    });

    resetTransaction();
    clearUploadsDirectory();
    logger.info({ actorId }, 'Superadmin reset the application instance');

    return { success: true };
  }
}

const authService = new AuthService();

module.exports = authService;
module.exports.ACCOUNT_INACTIVE_ERROR = ACCOUNT_INACTIVE_ERROR;
module.exports.ACCOUNT_PENDING_ERROR = ACCOUNT_PENDING_ERROR;
module.exports.ACCOUNT_REJECTED_ERROR = ACCOUNT_REJECTED_ERROR;
module.exports.ACCOUNT_LOCKED_ERROR = ACCOUNT_LOCKED_ERROR;
module.exports.CURRENT_PASSWORD_REQUIRED_DEACTIVATE_ERROR = CURRENT_PASSWORD_REQUIRED_DEACTIVATE_ERROR;
module.exports.INCORRECT_CURRENT_PASSWORD_ERROR = INCORRECT_CURRENT_PASSWORD_ERROR;
module.exports.INVALID_CREDENTIALS_ERROR = INVALID_CREDENTIALS_ERROR;
module.exports.INVALID_TOKEN_ERROR = INVALID_TOKEN_ERROR;
module.exports.LAST_SUPERADMIN_DEACTIVATION_ERROR = LAST_SUPERADMIN_DEACTIVATION_ERROR;
module.exports.LAST_SUPERADMIN_ROLE_CHANGE_ERROR = LAST_SUPERADMIN_ROLE_CHANGE_ERROR;
module.exports.LOCKOUT_DURATIONS_MINUTES = LOCKOUT_DURATIONS_MINUTES;
module.exports.LOCKOUT_THRESHOLD = LOCKOUT_THRESHOLD;
module.exports.NO_PRIMARY_SUPERADMIN_ERROR = NO_PRIMARY_SUPERADMIN_ERROR;
module.exports.RESET_CONFIRMATION_ERROR = RESET_CONFIRMATION_ERROR;
module.exports.SUPERADMIN_ACCOUNT_MANAGEMENT_ERROR = SUPERADMIN_ACCOUNT_MANAGEMENT_ERROR;
module.exports.SUPERADMIN_ROLE_REQUIRED_ERROR = SUPERADMIN_ROLE_REQUIRED_ERROR;
module.exports.USER_ROLES = USER_ROLES;
module.exports.MAX_USERS_PAGE_LIMIT = MAX_USERS_PAGE_LIMIT;
