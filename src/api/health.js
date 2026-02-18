const express = require('express');
const router = express.Router();
const { version } = require('../../package.json');

/**
 * GET /api/health
 * Returns application health status, version, and uptime.
 */
router.get('/', (req, res) => {
  res.json({
    status: 'UP',
    version,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;
