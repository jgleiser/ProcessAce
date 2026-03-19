const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const logger = require('../logging/logger');
const notificationService = require('./notificationService');
const {
  DEFAULT_PERSONAL_WORKSPACE_NAME,
  PERSONAL_WORKSPACE_SUFFIX,
  WORKSPACE_KINDS,
  buildTransferredPersonalWorkspaceName,
  isDefaultWorkspaceForUser,
  isPersonalWorkspace,
  isProtectedPersonalWorkspace,
  isReservedWorkspaceName,
  isTransferredPersonalWorkspaceName,
} = require('../utils/workspaces');

class WorkspaceService {
  repairLegacyPersonalWorkspace(workspace) {
    if (!workspace) {
      return workspace;
    }

    let repairedWorkspace = workspace;
    const owner = db.prepare('SELECT id, role, status FROM users WHERE id = ?').get(workspace.owner_id);

    if (workspace.workspace_kind === WORKSPACE_KINDS.PERSONAL) {
      if (!workspace.personal_owner_user_id) {
        db.prepare('UPDATE workspaces SET personal_owner_user_id = ? WHERE id = ?').run(workspace.owner_id, workspace.id);
        repairedWorkspace = {
          ...workspace,
          personal_owner_user_id: workspace.owner_id,
        };
      }

      return repairedWorkspace;
    }

    if (workspace.name === DEFAULT_PERSONAL_WORKSPACE_NAME && owner?.status === 'active') {
      const transferredCandidates = db
        .prepare(
          `
            SELECT
              w.id,
              inactive_user.id as personal_owner_user_id,
              inactive_user.name as personal_owner_name,
              inactive_user.email as personal_owner_email
            FROM workspaces w
            JOIN workspace_members inactive_member
              ON inactive_member.workspace_id = w.id
             AND inactive_member.user_id != w.owner_id
            JOIN users inactive_user
              ON inactive_user.id = inactive_member.user_id
             AND inactive_user.status = 'inactive'
            WHERE w.owner_id = ?
              AND w.name = ?
            GROUP BY w.id
            HAVING COUNT(inactive_member.user_id) = 1
          `,
        )
        .all(workspace.owner_id, DEFAULT_PERSONAL_WORKSPACE_NAME);

      transferredCandidates.forEach((candidate) => {
        db.prepare(
          `
            UPDATE workspaces
            SET name = ?, workspace_kind = ?, personal_owner_user_id = ?
            WHERE id = ?
          `,
        ).run(
          buildTransferredPersonalWorkspaceName({
            name: candidate.personal_owner_name,
            email: candidate.personal_owner_email,
          }),
          WORKSPACE_KINDS.PERSONAL,
          candidate.personal_owner_user_id,
          candidate.id,
        );
      });

      repairedWorkspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspace.id);
      if (repairedWorkspace.workspace_kind === WORKSPACE_KINDS.PERSONAL) {
        return repairedWorkspace;
      }
    }

    const inactiveMembers = db
      .prepare(
        `
          SELECT u.id, u.name, u.email
          FROM workspace_members wm
          JOIN users u ON u.id = wm.user_id
          WHERE wm.workspace_id = ?
            AND wm.user_id != ?
            AND u.status = 'inactive'
          ORDER BY u.created_at ASC
        `,
      )
      .all(workspace.id, workspace.owner_id);

    let nextName = repairedWorkspace.name;
    let nextKind = repairedWorkspace.workspace_kind;
    let nextPersonalOwnerUserId = repairedWorkspace.personal_owner_user_id || null;

    if (repairedWorkspace.name === DEFAULT_PERSONAL_WORKSPACE_NAME && owner?.status === 'active' && inactiveMembers.length === 1) {
      nextKind = WORKSPACE_KINDS.PERSONAL;
      nextPersonalOwnerUserId = inactiveMembers[0].id;
      nextName = buildTransferredPersonalWorkspaceName(inactiveMembers[0]);
    } else if (repairedWorkspace.name === DEFAULT_PERSONAL_WORKSPACE_NAME) {
      const matchingWorkspaceCount = db
        .prepare('SELECT COUNT(*) as count FROM workspaces WHERE owner_id = ? AND name = ?')
        .get(repairedWorkspace.owner_id, DEFAULT_PERSONAL_WORKSPACE_NAME).count;

      if (matchingWorkspaceCount === 1) {
        nextKind = WORKSPACE_KINDS.PERSONAL;
        nextPersonalOwnerUserId = repairedWorkspace.owner_id;
      }
    } else if (isTransferredPersonalWorkspaceName(repairedWorkspace.name) && inactiveMembers.length === 1) {
      nextKind = WORKSPACE_KINDS.PERSONAL;
      nextPersonalOwnerUserId = inactiveMembers[0].id;
    }

    if (
      nextName !== repairedWorkspace.name ||
      nextKind !== repairedWorkspace.workspace_kind ||
      nextPersonalOwnerUserId !== repairedWorkspace.personal_owner_user_id
    ) {
      db.prepare(
        `
          UPDATE workspaces
          SET name = ?, workspace_kind = ?, personal_owner_user_id = ?
          WHERE id = ?
        `,
      ).run(nextName, nextKind, nextPersonalOwnerUserId, repairedWorkspace.id);

      repairedWorkspace = {
        ...repairedWorkspace,
        name: nextName,
        workspace_kind: nextKind,
        personal_owner_user_id: nextPersonalOwnerUserId,
      };
    }

    return repairedWorkspace;
  }

  decorateWorkspaceForUser(workspace, userId) {
    if (!workspace) {
      return workspace;
    }

    return {
      ...workspace,
      is_default_workspace: isDefaultWorkspaceForUser(workspace, userId),
      is_protected_personal_workspace: isProtectedPersonalWorkspace(workspace),
    };
  }

  /**
   * Create a new workspace
   * @param {string} name
   * @param {string} ownerId
   */
  async createWorkspace(name, ownerId) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    if (!normalizedName) {
      throw new Error('Name is required');
    }

    if (isReservedWorkspaceName(normalizedName)) {
      throw new Error(`"${DEFAULT_PERSONAL_WORKSPACE_NAME}" and "* ${PERSONAL_WORKSPACE_SUFFIX}" are reserved workspace names`);
    }

    try {
      const stmt = db.prepare(
        `
          INSERT INTO workspaces (id, name, owner_id, created_at, workspace_kind, personal_owner_user_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      );
      stmt.run(id, normalizedName, ownerId, now, WORKSPACE_KINDS.NAMED, null);

      // Add owner as admin
      this.addMember(id, ownerId, 'admin');

      return {
        id,
        name: normalizedName,
        owner_id: ownerId,
        created_at: now,
        workspace_kind: WORKSPACE_KINDS.NAMED,
        personal_owner_user_id: null,
        is_default_workspace: false,
        is_protected_personal_workspace: false,
      };
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

  ensureMemberRole(workspaceId, userId, role = 'admin') {
    db.prepare(
      `
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (?, ?, ?)
        ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role
      `,
    ).run(workspaceId, userId, role);
  }

  /**
   * Get workspaces for a user
   * @param {string} userId
   */
  getUserWorkspaces(userId) {
    const workspaces = db
      .prepare(
        `
            SELECT
            w.*,
            wm.role,
            (SELECT COUNT(*) FROM jobs WHERE workspace_id = w.id) as job_count,
            (SELECT COUNT(*) FROM evidence WHERE workspace_id = w.id) as evidence_count,
            (SELECT COUNT(*) FROM artifacts WHERE workspace_id = w.id) as artifact_count,
            (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) as member_count
            FROM workspaces w
            JOIN workspace_members wm ON w.id = wm.workspace_id
            WHERE wm.user_id = ?
            ORDER BY
            CASE
              WHEN w.workspace_kind = '${WORKSPACE_KINDS.PERSONAL}' AND w.owner_id = ? AND w.personal_owner_user_id = ? THEN 0
              WHEN w.owner_id = ? THEN 1
              ELSE 2
            END,
            w.created_at ASC
        `,
      )
      .all(userId, userId, userId, userId);

    return workspaces
      .map((workspace) => this.decorateWorkspaceForUser(this.repairLegacyPersonalWorkspace(workspace), userId))
      .sort((leftWorkspace, rightWorkspace) => {
        const getSortWeight = (workspace) => {
          if (workspace.is_default_workspace) {
            return 0;
          }

          if (workspace.owner_id === userId) {
            return 1;
          }

          return 2;
        };

        return getSortWeight(leftWorkspace) - getSortWeight(rightWorkspace) || leftWorkspace.created_at.localeCompare(rightWorkspace.created_at);
      });
  }

  /**
   * Get workspace by ID
   * @param {string} id
   */
  getWorkspace(id) {
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    return this.repairLegacyPersonalWorkspace(workspace);
  }

  /**
   * Get workspace members
   * @param {string} workspaceId
   */
  getWorkspaceMembers(workspaceId) {
    return db
      .prepare(
        `
            SELECT u.id, u.email, u.name, u.status,
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
    const stmt = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?');
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

    const stmt = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?');
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

    const stmt = db.prepare('UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?');
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
      const recipientUser = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email);
      if (!recipientUser) {
        throw new Error('User must be registered to be invited');
      }

      // Check if user is already a member
      const existingMember = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, recipientUser.id);

      if (existingMember) {
        throw new Error('User is already a member of this workspace');
      }

      // Check if invite already exists, update it if so
      const existingInvite = db
        .prepare('SELECT id FROM workspace_invitations WHERE workspace_id = ? AND recipient_email = ?')
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
      db.prepare("UPDATE workspace_invitations SET status = 'accepted' WHERE id = ?").run(invite.id);
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
    const workspace = this.getWorkspace(workspaceId);
    if (workspace && isPersonalWorkspace(workspace)) {
      throw new Error('Personal workspaces cannot be deleted');
    }

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

  transferOwnedWorkspaces(fromUserId, toUserId) {
    const transferTransaction = db.transaction(() => {
      const owner = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(fromUserId);
      const ownedWorkspaces = db.prepare('SELECT * FROM workspaces WHERE owner_id = ? ORDER BY created_at ASC').all(fromUserId);

      ownedWorkspaces.forEach((rawWorkspace) => {
        const workspace = this.repairLegacyPersonalWorkspace(rawWorkspace);

        if (workspace.workspace_kind === WORKSPACE_KINDS.PERSONAL) {
          db.prepare(
            `
              UPDATE workspaces
              SET owner_id = ?, workspace_kind = ?, personal_owner_user_id = ?, name = ?
              WHERE id = ?
            `,
          ).run(
            toUserId,
            WORKSPACE_KINDS.PERSONAL,
            workspace.personal_owner_user_id || fromUserId,
            buildTransferredPersonalWorkspaceName(owner),
            workspace.id,
          );
        } else {
          db.prepare('UPDATE workspaces SET owner_id = ?, workspace_kind = ? WHERE id = ?').run(toUserId, WORKSPACE_KINDS.NAMED, workspace.id);
        }

        this.ensureMemberRole(workspace.id, toUserId, 'admin');
      });

      return ownedWorkspaces.length;
    });

    return transferTransaction();
  }

  restorePersonalWorkspaces(userId) {
    const restoreTransaction = db.transaction(() => {
      const legacyTransferredWorkspaces = db
        .prepare(
          `
            SELECT w.*
            FROM workspaces w
            JOIN workspace_members wm ON wm.workspace_id = w.id
            WHERE wm.user_id = ?
          `,
        )
        .all(userId);

      legacyTransferredWorkspaces.forEach((workspace) => {
        this.repairLegacyPersonalWorkspace(workspace);
      });

      const personalWorkspaces = db
        .prepare(
          `
            SELECT id
            FROM workspaces
            WHERE workspace_kind = ?
              AND personal_owner_user_id = ?
            ORDER BY created_at ASC
          `,
        )
        .all(WORKSPACE_KINDS.PERSONAL, userId);

      personalWorkspaces.forEach(({ id }) => {
        db.prepare(
          `
            UPDATE workspaces
            SET owner_id = ?, name = ?, workspace_kind = ?, personal_owner_user_id = ?
            WHERE id = ?
          `,
        ).run(userId, DEFAULT_PERSONAL_WORKSPACE_NAME, WORKSPACE_KINDS.PERSONAL, userId, id);
        this.ensureMemberRole(id, userId, 'admin');
      });

      return personalWorkspaces.length;
    });

    return restoreTransaction();
  }

  transferOwnership(workspaceId, newOwnerUserId) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    if (isPersonalWorkspace(workspace)) {
      throw new Error('Personal workspaces cannot be transferred');
    }

    if (workspace.owner_id === newOwnerUserId) {
      throw new Error('User already owns this workspace');
    }

    const newOwner = db
      .prepare(
        `
          SELECT u.id, u.status
          FROM workspace_members wm
          JOIN users u ON u.id = wm.user_id
          WHERE wm.workspace_id = ? AND wm.user_id = ?
        `,
      )
      .get(workspaceId, newOwnerUserId);

    if (!newOwner || newOwner.status !== 'active') {
      throw new Error('New owner must be an active workspace member');
    }

    const transferTransaction = db.transaction(() => {
      db.prepare('UPDATE workspaces SET owner_id = ? WHERE id = ?').run(newOwnerUserId, workspaceId);
      this.ensureMemberRole(workspaceId, newOwnerUserId, 'admin');
      this.ensureMemberRole(workspaceId, workspace.owner_id, 'admin');
    });

    transferTransaction();
    return this.getWorkspace(workspaceId);
  }
}

const workspaceService = new WorkspaceService();

module.exports = workspaceService;
module.exports.WORKSPACE_KINDS = WORKSPACE_KINDS;
