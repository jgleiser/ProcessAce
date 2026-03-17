const express = require('express');
const authService = require('../services/authService');
const { authenticateToken } = require('../middleware/auth');
const { sendErrorResponse } = require('../utils/errorResponse');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user account. First user becomes admin.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const user = await authService.registerUser(name, email, password);
    res.status(201).json(user);
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
    if (error.message === 'Invalid email or password') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (error.message === 'Account is deactivated') {
      return res.status(403).json({ error: error.message });
    }

    return sendErrorResponse(res, error, req);
  }
});

/**
 * POST /api/auth/logout
 * Clear auth cookie and end session.
 */
router.post('/logout', (req, res) => {
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
