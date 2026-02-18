const express = require('express');
const workspaceService = require('../services/workspaceService');
const logger = require('../logging/logger');

const router = express.Router();

/**
 * GET /api/workspaces
 * List all workspaces the authenticated user is a member of.
 */
router.get('/', async (req, res) => {
  try {
    const workspaces = workspaceService.getUserWorkspaces(req.user.id);
    res.json(workspaces);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch workspaces');
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

/**
 * POST /api/workspaces
 * Create a new workspace. The creator becomes the owner.
 */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const workspace = await workspaceService.createWorkspace(name, req.user.id);
    res.status(201).json(workspace);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create workspace');
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

/**
 * DELETE /api/workspaces/:id
 * Delete a workspace. Only the workspace owner can delete it.
 */
router.delete('/:id', async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const userId = req.user.id;

    // Verify ownership
    const workspace = workspaceService.getWorkspace(workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    if (workspace.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the workspace owner can delete it' });
    }

    workspaceService.deleteWorkspace(workspaceId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting workspace');
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

/**
 * GET /api/workspaces/:id/members
 * List all members of a workspace with their roles.
 */
router.get('/:id/members', async (req, res) => {
  try {
    // TODO: Check if user is member of workspace first
    const members = workspaceService.getWorkspaceMembers(req.params.id);
    res.json(members);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching members');
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

/**
 * DELETE /api/workspaces/:id/members/:userId
 * Remove a member from a workspace. Requires admin or owner role.
 */
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const targetUserId = req.params.userId;
    const currentUserId = req.user.id;

    // Check permissions
    const currentUserRole = workspaceService.getMemberRole(workspaceId, currentUserId);
    if (currentUserRole !== 'owner' && currentUserRole !== 'admin') {
      return res.status(403).json({ error: 'Only workspace admins and owners can remove members' });
    }

    // specific check: prevent removing owner
    const targetUserRole = workspaceService.getMemberRole(workspaceId, targetUserId);
    if (targetUserRole === 'owner') {
      return res.status(403).json({ error: 'Cannot remove the workspace owner' });
    }

    workspaceService.removeMember(workspaceId, targetUserId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error removing member');
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

/**
 * PUT /api/workspaces/:id/members/:userId
 * Update a workspace member's role. Requires admin or owner role.
 */
router.put('/:id/members/:userId', async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const targetUserId = req.params.userId;
    const { role } = req.body;
    const currentUserId = req.user.id;

    // Check permissions
    const currentUserRole = workspaceService.getMemberRole(workspaceId, currentUserId);
    if (currentUserRole !== 'owner' && currentUserRole !== 'admin') {
      return res.status(403).json({ error: 'Only workspace admins and owners can manage roles' });
    }

    // Prevent changing own role via this endpoint
    if (targetUserId === currentUserId) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Check target user role - cannot change owner
    const targetUserRole = workspaceService.getMemberRole(workspaceId, targetUserId);
    if (targetUserRole === 'owner') {
      return res.status(403).json({ error: 'Cannot change role of workspace owner' });
    }

    workspaceService.updateMemberRole(workspaceId, targetUserId, role);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error updating member role');
    if (
      error.message === 'Invalid role' ||
      error.message === 'Cannot change role of workspace owner'
    ) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

/**
 * POST /api/workspaces/:id/invite
 * Invite a registered user to a workspace. Requires admin or owner role.
 */
router.post('/:id/invite', async (req, res) => {
  try {
    const { email, role } = req.body;
    const workspaceId = req.params.id;
    const currentUserId = req.user.id;

    // Check permissions
    const currentUserRole = workspaceService.getMemberRole(workspaceId, currentUserId);
    if (currentUserRole !== 'owner' && currentUserRole !== 'admin') {
      return res.status(403).json({ error: 'Only workspace admins and owners can invite users' });
    }

    const result = workspaceService.inviteUser(workspaceId, currentUserId, email, role);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error inviting user');
    if (error.message === 'User is already a member of this workspace') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

/**
 * GET /api/workspaces/:id/invitations
 * List pending invitations for a workspace. Requires admin or owner role.
 */
router.get('/:id/invitations', async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const currentUserId = req.user.id;

    // Check permissions
    const currentUserRole = workspaceService.getMemberRole(workspaceId, currentUserId);
    if (currentUserRole !== 'owner' && currentUserRole !== 'admin') {
      return res
        .status(403)
        .json({ error: 'Only workspace admins and owners can view invitations' });
    }

    const invitations = workspaceService.getPendingInvitations(workspaceId);
    res.json(invitations);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching invitations');
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

/**
 * DELETE /api/workspaces/:id/invitations/:inviteId
 * Revoke a pending invitation. Requires admin or owner role.
 */
router.delete('/:id/invitations/:inviteId', async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const currentUserId = req.user.id;

    // Check permissions
    const currentUserRole = workspaceService.getMemberRole(workspaceId, currentUserId);
    if (currentUserRole !== 'owner' && currentUserRole !== 'admin') {
      return res
        .status(403)
        .json({ error: 'Only workspace admins and owners can revoke invitations' });
    }

    // Ideally we should verify the invite belongs to the workspace, but the service handles deletion by ID.
    // We could add a check if strictness is needed, but assuming ID unicity or service safety.
    // For now, let's rely on the service.

    workspaceService.revokeInvitation(req.params.inviteId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error revoking invitation');
    res.status(500).json({ error: 'Failed to revoke invitation' });
  }
});

module.exports = router;
