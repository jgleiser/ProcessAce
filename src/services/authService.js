const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const logger = require('../logging/logger');

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';
const JWT_EXPIRES_IN = '24h';

class AuthService {
    /**
     * Register a new user
     * @param {string} name 
     * @param {string} email 
     * @param {string} password 
     * @returns {Object} User object (without password)
     */
    async registerUser(name, email, password) {
        try {
            // Check if user exists
            const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
            if (existingUser) {
                throw new Error('User already exists');
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
            const userId = uuidv4();
            const now = new Date().toISOString();

            // Determine role: first user becomes admin, others become viewer
            const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
            const role = userCount.count === 0 ? 'admin' : 'viewer';
            const status = 'active';

            // Insert user with role, status, and name
            const stmt = db.prepare('INSERT INTO users (id, name, email, password_hash, created_at, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
            stmt.run(userId, name, email, passwordHash, now, role, status);

            logger.info({ userId, role, name }, 'User registered successfully');

            // Find or create default workspace for user (Simple 1:1 for now)
            const workspaceId = uuidv4();
            db.prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)').run(workspaceId, 'My Workspace', userId, now);
            db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(workspaceId, userId, 'admin');

            return { id: userId, name, email, role, status, createdAt: now };
        } catch (error) {
            logger.error({ err: error, email }, 'Error registering user');
            throw error;
        }
    }

    /**
     * Authenticate user and return token
     * @param {string} email 
     * @param {string} password 
     * @returns {Object} { user, token }
     */
    async authenticateUser(email, password) {
        try {
            const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
            if (!user) {
                throw new Error('Invalid email or password');
            }

            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) {
                throw new Error('Invalid email or password');
            }

            // Check if user is active
            if (user.status === 'inactive') {
                throw new Error('Account is deactivated');
            }

            // Generate Token (include role for frontend access control)
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            // Get user's default workspace
            const workspace = db.prepare('SELECT workspace_id FROM workspace_members WHERE user_id = ? LIMIT 1').get(user.id);
            const workspaceId = workspace ? workspace.workspace_id : null;

            return {
                user: { id: user.id, email: user.email, role: user.role, status: user.status, workspaceId },
                token
            };

        } catch (error) {
            logger.warn({ err: error.message, email }, 'Authentication failed');
            throw error;
        }
    }

    /**
     * Verify JWT Token
     * @param {string} token 
     * @returns {Object} Decoded token payload
     */
    verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            throw new Error('Invalid token');
        }
    }

    /**
     * Get user by ID
     * @param {string} id 
     */
    getUserById(id) {
        return db.prepare('SELECT id, name, email, role, status, created_at FROM users WHERE id = ?').get(id);
    }

    /**
     * Get all users (admin only)
     * @returns {Array} List of all users
     */
    getAllUsers() {
        return db.prepare('SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at ASC').all();
    }

    /**
     * Update user role and/or status (admin only)
     * @param {string} id - User ID
     * @param {Object} updates - { role?, status? }
     * @returns {Object} Updated user
     */
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
}

module.exports = new AuthService();
