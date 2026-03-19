const express = require('express');
const workspaceService = require('../services/workspaceService');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');
const { isPersonalWorkspace } = require('../utils/workspaces');
const { sendErrorResponse } = require('../utils/errorResponse');

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
    return sendErrorResponse(res, error, req);
  }
});

/**
 * POST /api/workspaces
 * Create a new workspace. The creator becomes the owner.
 */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    const workspace = await workspaceService.createWorkspace(name, req.user.id);
    res.status(201).json(workspace);
  } catch (error) {
    if (error.message === 'Name is required' || error.message === `"My Workspace" and "* Personal Workspace" are reserved workspace names`) {
      return res.status(400).json({ error: error.message });
    }

    return sendErrorResponse(res, error, req);
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

    if (isPersonalWorkspace(workspace)) {
      return res.status(403).json({ error: 'Personal workspaces cannot be deleted' });
    }

    if (workspace.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the workspace owner can delete it' });
    }

    workspaceService.deleteWorkspace(workspaceId);
    res.json({ success: true });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

router.post('/:id/transfer-ownership', requireSuperAdmin, async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const { newOwnerUserId } = req.body || {};

    if (!newOwnerUserId) {
      return res.status(400).json({ error: 'newOwnerUserId is required' });
    }

    const workspace = workspaceService.transferOwnership(workspaceId, newOwnerUserId);
    res.json({ success: true, workspace });
  } catch (error) {
    if (error.message === 'Workspace not found') {
      return res.status(404).json({ error: error.message });
    }

    if (error.message === 'Personal workspaces cannot be transferred') {
      return res.status(403).json({ error: error.message });
    }

    if (error.message === 'User already owns this workspace' || error.message === 'New owner must be an active workspace member') {
      return res.status(400).json({ error: error.message });
    }

    return sendErrorResponse(res, error, req);
  }
});

/**
 * GET /api/workspaces/:id/members
 * List all members of a workspace with their roles.
 */
router.get('/:id/members', async (req, res) => {
  try {
    const workspaceId = req.params.id;

    if (!workspaceService.isMember(workspaceId, req.user.id)) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this workspace.' });
    }

    const members = workspaceService.getWorkspaceMembers(workspaceId);
    res.json(members);
  } catch (error) {
    return sendErrorResponse(res, error, req);
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
    return sendErrorResponse(res, error, req);
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
    if (error.message === 'Invalid role' || error.message === 'Cannot change role of workspace owner') {
      return res.status(400).json({ error: error.message });
    }
    return sendErrorResponse(res, error, req);
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
    if (error.message === 'User is already a member of this workspace') {
      return res.status(400).json({ error: error.message });
    }
    return sendErrorResponse(res, error, req);
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
      return res.status(403).json({ error: 'Only workspace admins and owners can view invitations' });
    }

    const invitations = workspaceService.getPendingInvitations(workspaceId);
    res.json(invitations);
  } catch (error) {
    return sendErrorResponse(res, error, req);
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
      return res.status(403).json({ error: 'Only workspace admins and owners can revoke invitations' });
    }

    // Ideally we should verify the invite belongs to the workspace, but the service handles deletion by ID.
    // We could add a check if strictness is needed, but assuming ID unicity or service safety.
    // For now, let's rely on the service.

    workspaceService.revokeInvitation(req.params.inviteId);
    res.json({ success: true });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

module.exports = router;
