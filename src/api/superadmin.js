const express = require('express');
const authService = require('../services/authService');
const logger = require('../logging/logger');
const { authenticateToken } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');
const { sendErrorResponse } = require('../utils/errorResponse');

const router = express.Router();

router.use(authenticateToken);
router.use(requireSuperAdmin);

router.post('/reset-instance', async (req, res) => {
  try {
    const { currentPassword, confirmationText } = req.body || {};
    const token = req.cookies['auth_token'];

    await authService.resetInstance(req.user.id, currentPassword, confirmationText);

    if (token) {
      try {
        await authService.revokeToken(token);
      } catch (error) {
        (req.log || logger).warn({ err: error }, 'Failed to revoke auth token during instance reset');
      }
    }

    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.json({ message: 'Application data deleted successfully' });
  } catch (error) {
    if (
      error.message === authService.RESET_CONFIRMATION_ERROR ||
      error.message === authService.INCORRECT_CURRENT_PASSWORD_ERROR ||
      error.message === 'Current password is required'
    ) {
      return res.status(400).json({ error: error.message });
    }

    if (error.message === 'Access denied. Superadmin privileges required.') {
      return res.status(403).json({ error: error.message });
    }

    return sendErrorResponse(res, error, req);
  }
});

module.exports = router;
