const authService = require('../services/authService');
const logger = require('../logging/logger');

/**
 * Middleware to check if the authenticated user has admin role
 * Must be used AFTER authenticateToken middleware
 */
const requireAdmin = (req, res, next) => {
    try {
        // Get fresh user data from DB (role may have changed since JWT was issued)
        const user = authService.getUserById(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.role !== 'admin') {
            logger.warn({ userId: req.user.id, attemptedRoute: req.originalUrl }, 'Non-admin user attempted to access admin route');
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }

        // Attach fresh user data to request
        req.user = { ...req.user, ...user };
        next();
    } catch (error) {
        logger.error({ err: error }, 'Error in requireAdmin middleware');
        return res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = { requireAdmin };
