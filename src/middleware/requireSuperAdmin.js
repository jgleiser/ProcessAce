const logger = require('../logging/logger');
const { isSuperAdminRole } = require('../utils/roles');

const requireSuperAdmin = (req, res, next) => {
  try {
    if (!req.user || !isSuperAdminRole(req.user.role)) {
      logger.warn(
        { userId: req.user?.id, attemptedRoute: req.originalUrl, correlation_id: req.correlationId },
        'Non-superadmin user attempted to access a superadmin route',
      );
      return res.status(403).json({ error: 'Access denied. Superadmin privileges required.' });
    }

    next();
  } catch (error) {
    logger.error({ err: error }, 'Error in requireSuperAdmin middleware');
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { requireSuperAdmin };
