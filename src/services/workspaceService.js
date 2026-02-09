const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const logger = require('../logging/logger');

class WorkspaceService {
    /**
     * Create a new workspace
     * @param {string} name 
     * @param {string} ownerId 
     */
    async createWorkspace(name, ownerId) {
        const id = uuidv4();
        const now = new Date().toISOString();

        try {
            const stmt = db.prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)');
            stmt.run(id, name, ownerId, now);

            // Add owner as admin
            this.addMember(id, ownerId, 'admin');

            return { id, name, ownerId, createdAt: now };
        } catch (error) {
            logger.error({ err: error }, 'Error creating workspace');
            throw error;
        }
    }

    /**
     * Add member to workspace
     * @param {string} workspaceId 
     * @param {string} userId 
     * @param {string} role 
     */
    addMember(workspaceId, userId, role = 'viewer') {
        const stmt = db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)');
        stmt.run(workspaceId, userId, role);
    }

    /**
     * Get workspaces for a user
     * @param {string} userId 
     */
    getUserWorkspaces(userId) {
        return db.prepare(`
            SELECT w.*, wm.role 
            FROM workspaces w
            JOIN workspace_members wm ON w.id = wm.workspace_id
            WHERE wm.user_id = ?
        `).all(userId);
    }

    /**
     * Get workspace by ID
     * @param {string} id 
     */
    getWorkspace(id) {
        return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    }
}

module.exports = new WorkspaceService();
