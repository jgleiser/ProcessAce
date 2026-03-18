const { EOL } = require('os');
const express = require('express');
const authService = require('../services/authService');
const notificationService = require('../services/notificationService');
const logger = require('../logging/logger');
const { authenticateToken } = require('../middleware/auth');
const { sendErrorResponse } = require('../utils/errorResponse');
const { isAdminRole } = require('../utils/roles');

const router = express.Router();
const ACCOUNT_CREATED_MESSAGE = 'Account created successfully. You can now sign in.';
const ACCOUNT_PENDING_MESSAGE = 'Your account has been created and is pending administrator approval.';

/**
 * POST /api/auth/register
 * Register a new user account. First user becomes superadmin.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const user = await authService.registerUser(name, email, password, {
      ipAddress: req.ip,
    });

    if (user.status === 'pending') {
      const adminUsers = authService.getAllUsers().filter((adminUser) => isAdminRole(adminUser.role) && adminUser.status === 'active');

      adminUsers.forEach((adminUser) => {
        notificationService.createNotification(
          adminUser.id,
          'registration_request',
          'New registration request',
          `${user.name} (${user.email}) is waiting for administrator approval.`,
          {
            userId: user.id,
            name: user.name,
            email: user.email,
          },
        );
      });
    }

    res.status(201).json({
      user,
      message: user.status === 'pending' ? ACCOUNT_PENDING_MESSAGE : ACCOUNT_CREATED_MESSAGE,
    });
  } catch (error) {
    if (error.message === 'User already exists') {
      return res.status(409).json({ error: 'User already exists' });
    }
    if (error.message.startsWith('Password must be')) {
      return res.status(400).json({ error: error.message });
    }
    return sendErrorResponse(res, error, req);
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and set HTTP-only auth cookie.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const { user, token } = await authService.authenticateUser(email, password);

    // Set HTTP-only cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({ message: 'Login successful', user });
  } catch (error) {
    if (error.message === authService.INVALID_CREDENTIALS_ERROR) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (error.message === authService.ACCOUNT_LOCKED_ERROR) {
      return res.status(423).json({ error: error.message });
    }

    if (
      error.message === authService.ACCOUNT_INACTIVE_ERROR ||
      error.message === authService.ACCOUNT_PENDING_ERROR ||
      error.message === authService.ACCOUNT_REJECTED_ERROR
    ) {
      return res.status(403).json({ error: error.message });
    }

    return sendErrorResponse(res, error, req);
  }
});

/**
 * POST /api/auth/logout
 * Clear auth cookie and end session.
 */
router.post('/logout', async (req, res) => {
  const token = req.cookies['auth_token'];

  if (token) {
    try {
      await authService.revokeToken(token);
    } catch (error) {
      (req.log || logger).warn({ err: error }, 'Failed to revoke auth token during logout');
    }
  }

  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 * Get the current authenticated user's profile.
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = authService.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

router.get('/me/consent', authenticateToken, (req, res) => {
  try {
    res.json({ consentHistory: authService.getConsentHistory(req.user.id) });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

router.get('/me/data-export', authenticateToken, (req, res) => {
  try {
    const exportPayload = authService.exportUserData(req.user.id);
    const exportDate = new Date().toISOString().slice(0, 10);
    const serializedExport = `${JSON.stringify(exportPayload, null, 2)}${EOL}`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="processace-data-export-${exportDate}.json"`);
    res.send(serializedExport);
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }

    return sendErrorResponse(res, error, req);
  }
});

/**
 * PUT /api/auth/me
 * Update the current user's name and/or password.
 */
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const { name, password, currentPassword } = req.body;
    const updatedUser = await authService.updateUserProfile(req.user.id, {
      name,
      password,
      currentPassword,
    });
    res.json(updatedUser);
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }

    if (
      error.message === 'Current password is required to set a new password' ||
      error.message === 'Incorrect current password' ||
      error.message.startsWith('Password must be')
    ) {
      return res.status(400).json({ error: error.message });
    }

    return sendErrorResponse(res, error, req);
  }
});

router.post('/me/deactivate', authenticateToken, async (req, res) => {
  try {
    const { currentPassword } = req.body || {};
    const token = req.cookies['auth_token'];

    await authService.deactivateUserAccount(req.user.id, currentPassword);

    if (token) {
      try {
        await authService.revokeToken(token);
      } catch (error) {
        (req.log || logger).warn({ err: error }, 'Failed to revoke auth token during account deactivation');
      }
    }

    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.json({ message: 'Account deactivated successfully' });
  } catch (error) {
    if (
      error.message === authService.CURRENT_PASSWORD_REQUIRED_DEACTIVATE_ERROR ||
      error.message === authService.INCORRECT_CURRENT_PASSWORD_ERROR ||
      error.message === authService.LAST_SUPERADMIN_DEACTIVATION_ERROR ||
      error.message === authService.NO_PRIMARY_SUPERADMIN_ERROR
    ) {
      return res.status(400).json({ error: error.message });
    }

    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }

    return sendErrorResponse(res, error, req);
  }
});

/**
 * GET /api/auth/users/search
 * Search users by name or email. Query param: q.
 */
router.get('/users/search', authenticateToken, (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }
    const users = authService.searchUsers(q);
    res.json(users);
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

module.exports = router;
