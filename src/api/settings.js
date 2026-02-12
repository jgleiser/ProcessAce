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

// Delete a setting (Admin only)
router.delete('/', requireAdmin, (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'Key is required' });
    }

    settingsService.deleteSetting(key);
    res.json({ success: true, key });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

// Verify Provider and List Models (Admin only)
router.post('/verify-provider', requireAdmin, async (req, res) => {
  try {
    const { provider, apiKey, baseUrl } = req.body;

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    // 1. Determine configuration
    const config = {
      provider,
      // If apiKey is provided, use it. Otherwise, try to fetch from stored settings.
      apiKey: apiKey || settingsService.getEncryptedSetting(`${provider}.apiKey`),
      baseURL: baseUrl,
    };

    // 2. Instantiate Provider
    // We need to require the factory here to avoid circular dependency issues if any,
    // or just use the factory.
    // For now, let's allow the factory to inject the specific key.
    const { getLlmProvider } = require('../llm/index');

    // Factory logic in llm/index.js needs update to accept specific config
    // For now, assuming we update index.js next.
    const llm = getLlmProvider(config);

    // 3. List Models
    const models = await llm.listModels();

    res.json({ models });
  } catch (error) {
    logger.error({ err: error, provider: req.body.provider }, 'Failed to verify provider');
    res.status(500).json({ error: error.message || 'Failed to verify provider and fetch models' });
  }
});

module.exports = router;
