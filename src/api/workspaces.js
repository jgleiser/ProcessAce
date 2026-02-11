const express = require('express');
const workspaceService = require('../services/workspaceService');
const logger = require('../logging/logger');

const router = express.Router();

// Get user's workspaces
router.get('/', async (req, res) => {
    try {
        const workspaces = workspaceService.getUserWorkspaces(req.user.id);
        res.json(workspaces);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch workspaces' });
    }
});

// Create workspace
router.post('/', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        const workspace = await workspaceService.createWorkspace(name, req.user.id);
        res.status(201).json(workspace);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create workspace' });
    }
});

// Delete workspace
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

// Get workspace members
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

// Remove member
router.delete('/:id/members/:userId', async (req, res) => {
    try {
        // TODO: Check if user is admin of workspace
        workspaceService.removeMember(req.params.id, req.params.userId);
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'Error removing member');
        res.status(500).json({ error: 'Failed to remove member' });
    }
});

// Update member role
router.put('/:id/members/:userId', async (req, res) => {
    try {
        const workspaceId = req.params.id;
        const targetUserId = req.params.userId;
        const { role } = req.body;
        const currentUserId = req.user.id;

        // Verify ownership (only owner can change roles for now)
        const workspace = workspaceService.getWorkspace(workspaceId);
        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        if (workspace.owner_id !== currentUserId) {
            return res.status(403).json({ error: 'Only the workspace owner can manage roles' });
        }

        // Prevent changing own role via this endpoint (though service blocks owner change)
        if (targetUserId === currentUserId) {
            return res.status(400).json({ error: 'Cannot change your own role' });
        }

        workspaceService.updateMemberRole(workspaceId, targetUserId, role);
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'Error updating member role');
        if (error.message === 'Invalid role' || error.message === 'Cannot change role of workspace owner') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to update member role' });
    }
});

// Invite user
router.post('/:id/invite', async (req, res) => {
    try {
        const { email, role } = req.body;
        // TODO: Check if user is admin of workspace
        const result = workspaceService.inviteUser(req.params.id, req.user.id, email, role);
        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Error inviting user');
        if (error.message === 'User is already a member of this workspace') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to invite user' });
    }
});

// Get pending invitations
router.get('/:id/invitations', async (req, res) => {
    try {
        // TODO: Check if user is admin of workspace
        const invitations = workspaceService.getPendingInvitations(req.params.id);
        res.json(invitations);
    } catch (error) {
        logger.error({ err: error }, 'Error fetching invitations');
        res.status(500).json({ error: 'Failed to fetch invitations' });
    }
});

// Revoke invitation
router.delete('/:id/invitations/:inviteId', async (req, res) => {
    try {
        // TODO: Check if user is admin of workspace
        workspaceService.revokeInvitation(req.params.inviteId);
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'Error revoking invitation');
        res.status(500).json({ error: 'Failed to revoke invitation' });
    }
});

module.exports = router;
