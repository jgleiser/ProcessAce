const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const logger = require('../logging/logger');
const { ipKeyGenerator } = rateLimit;

const AUTH_RATE_LIMITED_PATHS = new Set(['/api/auth/login', '/api/auth/register']);
const GENERAL_API_RATE_LIMIT_MAX = 1000;

const isTestEnvironment = () => process.env.NODE_ENV === 'test';

const normalizeRequestPath = (req) => req.originalUrl.split('?')[0];

const isExcludedFromGlobalApiRateLimit = (req) => AUTH_RATE_LIMITED_PATHS.has(normalizeRequestPath(req));

const getAuthenticatedSessionKey = (token) => `session:${crypto.createHash('sha256').update(token).digest('hex')}`;

const getApiRateLimitKey = (req) => {
  const authToken = req.cookies?.auth_token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return getAuthenticatedSessionKey(authToken.trim());
  }

  return `ip:${ipKeyGenerator(req.ip)}`;
};

const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  max = 100,
  message = 'Too many requests. Please try again later.',
  skip = () => isTestEnvironment(),
  keyGenerator,
} = {}) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    ...(keyGenerator ? { keyGenerator } : {}),
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
  max: GENERAL_API_RATE_LIMIT_MAX,
  message: 'Too many requests. Please try again later.',
  skip: (req) => isTestEnvironment() || isExcludedFromGlobalApiRateLimit(req),
  keyGenerator: getApiRateLimitKey,
});

module.exports = {
  authLimiter,
  apiLimiter,
  createRateLimiter,
  GENERAL_API_RATE_LIMIT_MAX,
  getApiRateLimitKey,
  isExcludedFromGlobalApiRateLimit,
  normalizeRequestPath,
};
