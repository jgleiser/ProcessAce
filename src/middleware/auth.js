const authService = require('../services/authService');
const logger = require('../logging/logger');

/**
 * Middleware to authenticate requests using JWT stored in cookies
 */
const authenticateToken = (req, res, next) => {
  // 1. Check for token in cookies
  const token = req.cookies['auth_token'];

  if (!token) {
    // Optional: Check query param for download links or similar if needed
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    // 2. Verify token
    const decoded = authService.verifyToken(token);

    // 3. Attach user to request
    req.user = decoded; // { id, email, iat, exp }

    next();
  } catch (error) {
    logger.warn({ err: error.message }, 'Invalid token provided');
    return res.status(403).json({ error: 'Invalid token.' });
  }
};

module.exports = { authenticateToken };
