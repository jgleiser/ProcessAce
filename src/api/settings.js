const express = require('express');
const settingsService = require('../services/settingsService');
const logger = require('../logging/logger');

const router = express.Router();

// Middleware to check for Admin role
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
};

// Get all settings (Admin only)
router.get('/', requireAdmin, (req, res) => {
    try {
        const settings = settingsService.getSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Update a setting (Admin only)
router.put('/', requireAdmin, (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key || value === undefined) {
            return res.status(400).json({ error: 'Key and value are required' });
        }

        const updated = settingsService.updateSetting(key, value);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

module.exports = router;
