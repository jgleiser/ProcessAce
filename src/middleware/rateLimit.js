const rateLimit = require('express-rate-limit');
const logger = require('../logging/logger');

const AUTH_RATE_LIMITED_PATHS = new Set(['/api/auth/login', '/api/auth/register']);

const isTestEnvironment = () => process.env.NODE_ENV === 'test';

const normalizeRequestPath = (req) => req.originalUrl.split('?')[0];

const isExcludedFromGlobalApiRateLimit = (req) => AUTH_RATE_LIMITED_PATHS.has(normalizeRequestPath(req));

const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  max = 100,
  message = 'Too many requests. Please try again later.',
  skip = () => isTestEnvironment(),
} = {}) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    handler: (req, res, _next, options) => {
      const resetTime = req.rateLimit?.resetTime;
      if (resetTime) {
        const retryAfterSeconds = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
        res.setHeader('Retry-After', retryAfterSeconds);
      }

      logger.warn({ event_type: 'rate_limit_exceeded', ip: req.ip, endpoint: normalizeRequestPath(req) }, 'Rate limit exceeded');
      return res.status(options.statusCode).json({ error: message });
    },
  });

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
});

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests. Please try again later.',
  skip: (req) => isTestEnvironment() || isExcludedFromGlobalApiRateLimit(req),
});

module.exports = {
  authLimiter,
  apiLimiter,
  createRateLimiter,
  isExcludedFromGlobalApiRateLimit,
  normalizeRequestPath,
};
