const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const logger = require('../logging/logger');
const tokenBlocklist = require('./tokenBlocklist');

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
const APPROVABLE_STATUSES = new Set(['pending', 'rejected']);
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATIONS_MINUTES = [15, 30, 60];

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

class AuthService {
  async registerUser(name, email, password) {
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
      const now = new Date().toISOString();
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
      const role = userCount.count === 0 ? 'admin' : 'editor';
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

      logger.info({ userId, role, status }, 'User registered successfully');

      const workspaceId = uuidv4();
      db.prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)').run(workspaceId, 'My Workspace', userId, now);
      db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(workspaceId, userId, 'admin');

      return { id: userId, name, email, role, status, createdAt: now };
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
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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

      this.clearFailedLoginAttempts(user.id);

      const token = jwt.sign({ id: user.id, email: user.email, role: user.role, jti: uuidv4() }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
      });

      const workspace = db.prepare('SELECT workspace_id FROM workspace_members WHERE user_id = ? LIMIT 1').get(user.id);
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
      iat: decodedToken.iat,
      exp: decodedToken.exp,
      jti: decodedToken.jti,
    };
  }

  getUserById(id) {
    return db.prepare('SELECT id, name, email, role, status, created_at FROM users WHERE id = ?').get(id);
  }

  getAllUsers() {
    return db.prepare('SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at ASC').all();
  }

  getUsersPaginated(page = 1, limit = 10, filters = {}) {
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

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countQuery = `SELECT COUNT(*) as count FROM users ${whereSql}`;
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    const usersQuery = `
      SELECT id, name, email, role, status, created_at
      FROM users
      ${whereSql}
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `;

    const users = db.prepare(usersQuery).all(...params, limit, offset);

    return { users, total, totalPages };
  }

  updateUser(id, updates) {
    const user = this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const { role, status } = updates;

    if (role && !['admin', 'editor', 'viewer'].includes(role)) {
      throw new Error('Invalid role. Must be admin, editor, or viewer');
    }
    if (status && !['active', 'inactive'].includes(status)) {
      throw new Error('Invalid status. Must be active or inactive');
    }

    if (role) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
      logger.info({ userId: id, newRole: role }, 'User role updated');
    }
    if (status) {
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
      logger.info({ userId: id, newStatus: status }, 'User status updated');
    }

    return this.getUserById(id);
  }

  async updateUserProfile(id, { name, password, currentPassword }) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
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
        throw new Error('Incorrect current password');
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
}

const authService = new AuthService();

module.exports = authService;
module.exports.ACCOUNT_INACTIVE_ERROR = ACCOUNT_INACTIVE_ERROR;
module.exports.ACCOUNT_PENDING_ERROR = ACCOUNT_PENDING_ERROR;
module.exports.ACCOUNT_REJECTED_ERROR = ACCOUNT_REJECTED_ERROR;
module.exports.ACCOUNT_LOCKED_ERROR = ACCOUNT_LOCKED_ERROR;
module.exports.INVALID_CREDENTIALS_ERROR = INVALID_CREDENTIALS_ERROR;
module.exports.INVALID_TOKEN_ERROR = INVALID_TOKEN_ERROR;
module.exports.LOCKOUT_DURATIONS_MINUTES = LOCKOUT_DURATIONS_MINUTES;
module.exports.LOCKOUT_THRESHOLD = LOCKOUT_THRESHOLD;
