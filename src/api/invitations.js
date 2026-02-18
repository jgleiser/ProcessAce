const express = require('express');
const workspaceService = require('../services/workspaceService');
const logger = require('../logging/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/invitations
 * Get all pending workspace invitations for the authenticated user.
 */
router.get('/', async (req, res) => {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const invitations = workspaceService.getUserInvitations(req.user.email);
    res.json(invitations);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching user invitations');
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

/**
 * GET /api/invitations/:token
 * Get invitation details by token. Returns 410 if expired.
 */
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const invitation = workspaceService.getInvitation(token);

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found or invalid' });
    }

    if (invitation.expired) {
      return res.status(410).json({ error: 'Invitation expired' });
    }

    res.json(invitation);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching invitation');
    res.status(500).json({ error: 'Failed to fetch invitation' });
  }
});

/**
 * POST /api/invitations/:token/accept
 * Accept a workspace invitation, adding the user as a member.
 */
router.post('/:token/accept', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = workspaceService.acceptInvitation(token, req.user.id);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error accepting invitation');
    if (error.message === 'Invalid invitation' || error.message === 'Invitation expired') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

/**
 * POST /api/invitations/:token/decline
 * Decline a workspace invitation.
 */
router.post('/:token/decline', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = workspaceService.declineInvitation(token);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error declining invitation');
    if (error.message === 'Invalid invitation') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

module.exports = router;
