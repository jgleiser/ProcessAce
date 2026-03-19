const authService = require('../services/authService');
const logger = require('../logging/logger');

/**
 * Middleware to authenticate requests using JWT stored in cookies
 */
const authenticateToken = async (req, res, next) => {
  const token = req.cookies['auth_token'];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    req.user = await authService.verifyToken(token);
    next();
  } catch (error) {
    if (
      error.message === authService.ACCOUNT_INACTIVE_ERROR ||
      error.message === authService.ACCOUNT_PENDING_ERROR ||
      error.message === authService.ACCOUNT_REJECTED_ERROR
    ) {
      return res.status(403).json({ error: error.message });
    }

    (req.log || logger).warn({ correlationId: req.correlationId, reason: error.message }, 'Invalid token provided');
    return res.status(403).json({ error: 'Invalid token.' });
  }
};

module.exports = { authenticateToken };
