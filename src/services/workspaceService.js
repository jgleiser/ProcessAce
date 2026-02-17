const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const logger = require('../logging/logger');
const notificationService = require('./notificationService');

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
      const stmt = db.prepare(
        'INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)',
      );
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
    const stmt = db.prepare(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)',
    );
    stmt.run(workspaceId, userId, role);
  }

  /**
   * Get workspaces for a user
   * @param {string} userId
   */
  getUserWorkspaces(userId) {
    return db
      .prepare(
        `
            SELECT w.*, wm.role,
            (SELECT COUNT(*) FROM jobs WHERE workspace_id = w.id) as job_count,
            (SELECT COUNT(*) FROM evidence WHERE workspace_id = w.id) as evidence_count,
            (SELECT COUNT(*) FROM artifacts WHERE workspace_id = w.id) as artifact_count,
            (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) as member_count
            FROM workspaces w
            JOIN workspace_members wm ON w.id = wm.workspace_id
            WHERE wm.user_id = ?
        `,
      )
      .all(userId);
  }

  /**
   * Get workspace by ID
   * @param {string} id
   */
  getWorkspace(id) {
    return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  }

  /**
   * Get workspace members
   * @param {string} workspaceId
   */
  getWorkspaceMembers(workspaceId) {
    return db
      .prepare(
        `
            SELECT u.id, u.email, u.name, 
            CASE WHEN w.owner_id = u.id THEN 'owner' ELSE wm.role END as role
            FROM workspace_members wm
            JOIN users u ON wm.user_id = u.id
            JOIN workspaces w ON wm.workspace_id = w.id
            WHERE wm.workspace_id = ?
        `,
      )
      .all(workspaceId);
  }

  /**
   * Remove member from workspace
   * @param {string} workspaceId
   * @param {string} userId
   */
  removeMember(workspaceId, userId) {
    // Prevent removing the last admin? Logic not strictly enforced here but good for UI.
    // Prevent removing self if it leaves no admins?
    // For now, simple removal.
    const stmt = db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?');
    stmt.run(workspaceId, userId);
  }

  /**
   * Check if user is a member of workspace
   * @param {string} workspaceId
   * @param {string} userId
   */
  isMember(workspaceId, userId) {
    const stmt = db.prepare(
      'SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    );
    return !!stmt.get(workspaceId, userId);
  }

  /**
   * Get member role
   * @param {string} workspaceId
   * @param {string} userId
   */
  getMemberRole(workspaceId, userId) {
    // Check if owner
    const workspace = this.getWorkspace(workspaceId);
    if (workspace && workspace.owner_id === userId) return 'owner';

    const stmt = db.prepare(
      'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    );
    const member = stmt.get(workspaceId, userId);
    return member ? member.role : null;
  }

  /**
   * Update member role
   * @param {string} workspaceId
   * @param {string} userId
   * @param {string} newRole
   */
  updateMemberRole(workspaceId, userId, newRole) {
    if (!['admin', 'editor', 'viewer'].includes(newRole)) {
      throw new Error('Invalid role');
    }

    // Prevent changing owner's role (although they are not in workspace_members usually,
    // the query wouldn't find them if they are handled separately, but let's be safe)
    const workspace = this.getWorkspace(workspaceId);
    if (workspace.owner_id === userId) {
      throw new Error('Cannot change role of workspace owner');
    }

    const stmt = db.prepare(
      'UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?',
    );
    const info = stmt.run(newRole, workspaceId, userId);

    if (info.changes === 0) {
      // Check if user is actually a member
      if (!this.isMember(workspaceId, userId)) {
        throw new Error('User is not a member of this workspace');
      }
    }

    return { success: true };
  }

  /**
   * Create an invitation
   * @param {string} workspaceId
   * @param {string} inviterId
   * @param {string} email
   * @param {string} role
   */
  inviteUser(workspaceId, inviterId, email, role = 'viewer') {
    const token = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Fixed syntax error
    try {
      // 1. Check if user exists (ENFORCED)
      const recipientUser = db
        .prepare('SELECT id, email, name FROM users WHERE email = ?')
        .get(email);
      if (!recipientUser) {
        throw new Error('User must be registered to be invited');
      }

      // Check if user is already a member
      const existingMember = db
        .prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
        .get(workspaceId, recipientUser.id);

      if (existingMember) {
        throw new Error('User is already a member of this workspace');
      }

      // Check if invite already exists, update it if so
      const existingInvite = db
        .prepare(
          'SELECT id FROM workspace_invitations WHERE workspace_id = ? AND recipient_email = ?',
        )
        .get(workspaceId, email);

      if (existingInvite) {
        db.prepare(
          `
                    UPDATE workspace_invitations 
                    SET token = ?, inviter_id = ?, role = ?, expires_at = ?, created_at = ?, status = 'pending'
                    WHERE id = ?
                `,
        ).run(token, inviterId, role, expiresAt, now.toISOString(), existingInvite.id);
      } else {
        const id = uuidv4();
        db.prepare(
          `
                    INSERT INTO workspace_invitations (id, workspace_id, inviter_id, recipient_email, role, token, created_at, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
        ).run(id, workspaceId, inviterId, email, role, token, now.toISOString(), expiresAt);
      }

      // Create In-App Notification
      // Remove any existing notifications for this workspace to prevent stale tokens
      notificationService.removeWorkspaceInvitations(recipientUser.id, workspaceId);

      const workspace = this.getWorkspace(workspaceId);
      const inviter = db.prepare('SELECT name, email FROM users WHERE id = ?').get(inviterId);
      const inviterName = inviter ? inviter.name || inviter.email : 'Someone';

      notificationService.createNotification(
        recipientUser.id,
        'workspace_invite',
        'New Workspace Invitation',
        `${inviterName} invited you to join ${workspace.name}`,
        {
          token,
          workspaceId,
          workspaceName: workspace.name,
          inviterName,
        },
      );

      return { token, email, expiresAt, status: existingInvite ? 'updated' : 'created' };
    } catch (error) {
      logger.error({ err: error }, 'Error creating invitation');
      throw error;
    }
  }

  /**
   * Get pending invitations for a workspace
   * @param {string} workspaceId
   */
  getPendingInvitations(workspaceId) {
    return db
      .prepare(
        `
            SELECT wi.*, u.email as inviter_email 
            FROM workspace_invitations wi
            LEFT JOIN users u ON wi.inviter_id = u.id
            WHERE wi.workspace_id = ? AND wi.status = 'pending'
        `,
      )
      .all(workspaceId);
  }

  /**
   * Get pending invitations for a user by email
   * @param {string} email
   */
  getUserInvitations(email) {
    return db
      .prepare(
        `
            SELECT wi.*, w.name as workspace_name, u.name as inviter_name
            FROM workspace_invitations wi
            JOIN workspaces w ON wi.workspace_id = w.id
            LEFT JOIN users u ON wi.inviter_id = u.id
            WHERE wi.recipient_email = ? AND wi.status = 'pending'
        `,
      )
      .all(email);
  }

  /**
   * Revoke an invitation
   * @param {string} date
   */
  revokeInvitation(id) {
    db.prepare('DELETE FROM workspace_invitations WHERE id = ?').run(id);
  }

  /**
   * Get invitation by token
   * @param {string} token
   */
  getInvitation(token) {
    const invite = db
      .prepare(
        `
            SELECT wi.*, w.name as workspace_name, u.name as inviter_name
            FROM workspace_invitations wi
            JOIN workspaces w ON wi.workspace_id = w.id
            LEFT JOIN users u ON wi.inviter_id = u.id
            WHERE wi.token = ? AND wi.status = 'pending'
        `,
      )
      .get(token);

    if (!invite) return null;

    if (new Date(invite.expires_at) < new Date()) {
      return { ...invite, expired: true };
    }

    return invite;
  }

  /**
   * Accept an invitation
   * @param {string} token
   * @param {string} userId
   */
  acceptInvitation(token, userId) {
    const invite = this.getInvitation(token);
    if (!invite) throw new Error('Invalid invitation');
    if (invite.expired) throw new Error('Invitation expired');

    const dbTx = db.transaction(() => {
      // Add member
      this.addMember(invite.workspace_id, userId, invite.role);

      // Mark invite as accepted
      db.prepare("UPDATE workspace_invitations SET status = 'accepted' WHERE id = ?").run(
        invite.id,
      );
    });

    dbTx();
    return { workspaceId: invite.workspace_id };
  }

  /**
   * Decline an invitation
   * @param {string} token
   */
  declineInvitation(token) {
    const invite = this.getInvitation(token);
    if (!invite) throw new Error('Invalid invitation');

    db.prepare("UPDATE workspace_invitations SET status = 'declined' WHERE id = ?").run(invite.id);
    return { id: invite.id, status: 'declined' };
  }

  /**
   * Delete a workspace and all related data
   * @param {string} workspaceId
   */
  deleteWorkspace(workspaceId) {
    const dbTx = db.transaction(() => {
      // Delete related data first
      db.prepare('DELETE FROM workspace_members WHERE workspace_id = ?').run(workspaceId);
      db.prepare('DELETE FROM workspace_invitations WHERE workspace_id = ?').run(workspaceId);
      db.prepare('DELETE FROM jobs WHERE workspace_id = ?').run(workspaceId);
      db.prepare('DELETE FROM evidence WHERE workspace_id = ?').run(workspaceId);
      db.prepare('DELETE FROM artifacts WHERE workspace_id = ?').run(workspaceId);

      // Delete workspace
      db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
    });
    dbTx();
  }
}

module.exports = new WorkspaceService();
