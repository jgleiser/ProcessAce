const express = require('express');
const authService = require('../services/authService');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const logger = require('../logging/logger');

const router = express.Router();

// All routes in this file require authentication + admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/admin/users
 * Get all users (admin only)
 */
router.get('/users', (req, res) => {
    try {
        const users = authService.getAllUsers();

        logger.info({
            event_type: 'admin_users_list',
            actor: req.user.id,
            userCount: users.length
        }, 'Admin retrieved user list');

        res.json(users);
    } catch (error) {
        logger.error({ err: error }, 'Error fetching users');
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * PATCH /api/admin/users/:id
 * Update user role and/or status (admin only)
 */
router.patch('/users/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { role, status } = req.body;

        // Prevent admin from demoting themselves
        if (id === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ error: 'Cannot change your own admin role' });
        }

        // Prevent admin from deactivating themselves
        if (id === req.user.id && status === 'inactive') {
            return res.status(400).json({ error: 'Cannot deactivate your own account' });
        }

        const updatedUser = authService.updateUser(id, { role, status });

        logger.info({
            event_type: 'admin_user_update',
            actor: req.user.id,
            targetUserId: id,
            updates: { role, status }
        }, 'Admin updated user');

        res.json(updatedUser);
    } catch (error) {
        if (error.message === 'User not found') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('Invalid')) {
            return res.status(400).json({ error: error.message });
        }
        logger.error({ err: error }, 'Error updating user');
        res.status(500).json({ error: 'Failed to update user' });
    }
});

module.exports = router;
