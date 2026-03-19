const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const logger = require('../logging/logger');
const { ipKeyGenerator } = rateLimit;

const AUTH_RATE_LIMITED_PATHS = new Set(['/api/auth/login', '/api/auth/register']);
const AUTH_RATE_LIMIT_MAX = 20;
const GENERAL_API_RATE_LIMIT_MAX = 1000;

const isTestEnvironment = () => process.env.NODE_ENV === 'test';

const normalizeRequestPath = (req) => req.originalUrl.split('?')[0];

const isExcludedFromGlobalApiRateLimit = (req) => AUTH_RATE_LIMITED_PATHS.has(normalizeRequestPath(req));

const normalizeAuthIdentifier = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
};

const getClientIpKey = (req) => `ip:${ipKeyGenerator(req.ip)}`;

const getAuthRateLimitKey = (req) => {
  const email = normalizeAuthIdentifier(req.body?.email);
  const ipKey = getClientIpKey(req);

  if (!email) {
    return ipKey;
  }

  return `auth:${email}:${ipKey}`;
};

const getAuthenticatedSessionKey = (token) => `session:${crypto.createHash('sha256').update(token).digest('hex')}`;

const getApiRateLimitKey = (req) => {
  const authToken = req.cookies?.auth_token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return getAuthenticatedSessionKey(authToken.trim());
  }

  return getClientIpKey(req);
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
  max: AUTH_RATE_LIMIT_MAX,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  keyGenerator: getAuthRateLimitKey,
});

const resetAuthRateLimit = async (req) => authLimiter.resetKey(getAuthRateLimitKey(req));

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: GENERAL_API_RATE_LIMIT_MAX,
  message: 'Too many requests. Please try again later.',
  skip: (req) => isTestEnvironment() || isExcludedFromGlobalApiRateLimit(req),
  keyGenerator: getApiRateLimitKey,
});

module.exports = {
  AUTH_RATE_LIMIT_MAX,
  authLimiter,
  apiLimiter,
  createRateLimiter,
  GENERAL_API_RATE_LIMIT_MAX,
  getAuthRateLimitKey,
  getApiRateLimitKey,
  isExcludedFromGlobalApiRateLimit,
  normalizeRequestPath,
  resetAuthRateLimit,
};
