const crypto = require('crypto');
const { parseCorsOrigins } = require('../utils/corsOrigins');

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_BYTES = 32;
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/register']);

const shouldBypassCsrfForTesting = () => process.env.NODE_ENV === 'test' && process.env.ENFORCE_TEST_CSRF !== 'true';

const getCookieOptions = () => ({
  httpOnly: false,
  maxAge: 24 * 60 * 60 * 1000,
  path: '/',
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
});

const normalizeOrigin = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const getAllowedOrigins = (req) => {
  const configuredOrigins = parseCorsOrigins()
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
  const requestHostOrigin = normalizeOrigin(`${req.protocol}://${req.get('host')}`);

  return new Set(requestHostOrigin ? [...configuredOrigins, requestHostOrigin] : configuredOrigins);
};

const resolveRequestOrigin = (req) => normalizeOrigin(req.get('origin')) || normalizeOrigin(req.get('referer'));

const ensureCsrfTokenCookie = (req, res, next) => {
  if (shouldBypassCsrfForTesting()) {
    return next();
  }

  const existingToken = typeof req.cookies?.[CSRF_COOKIE_NAME] === 'string' ? req.cookies[CSRF_COOKIE_NAME] : '';
  const csrfToken = existingToken || crypto.randomBytes(CSRF_TOKEN_BYTES).toString('hex');

  if (!existingToken) {
    res.cookie(CSRF_COOKIE_NAME, csrfToken, getCookieOptions());
  }

  req.csrfToken = csrfToken;
  return next();
};

const enforceCsrfProtection = (req, res, next) => {
  if (shouldBypassCsrfForTesting()) {
    return next();
  }

  if (CSRF_SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (!req.path.startsWith('/api') || CSRF_EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  const requestOrigin = resolveRequestOrigin(req);
  const allowedOrigins = getAllowedOrigins(req);

  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    return res.status(403).json({ error: 'Invalid request origin' });
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  return next();
};

module.exports = {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  enforceCsrfProtection,
  ensureCsrfTokenCookie,
};
