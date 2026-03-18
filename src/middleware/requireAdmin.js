const logger = require('../logging/logger');

/**
 * Middleware to check if the authenticated user has admin role
 * Must be used AFTER authenticateToken middleware
 */
const requireAdmin = (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      logger.warn(
        { userId: req.user?.id, attemptedRoute: req.originalUrl, correlation_id: req.correlationId },
        'Non-admin user attempted to access admin route',
      );
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    next();
  } catch (error) {
    logger.error({ err: error }, 'Error in requireAdmin middleware');
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { requireAdmin };
