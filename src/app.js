const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const logger = require('./logging/logger');
const healthRoutes = require('./api/health');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const authRoutes = require('./api/auth');
const { authenticateToken } = require('./middleware/auth');
const { authLimiter, apiLimiter } = require('./middleware/rateLimit');
const { sendErrorResponse } = require('./utils/errorResponse');

const app = express();
const publicDir = path.join(__dirname, 'public');

const attachCspNonce = (_req, res, next) => {
  res.locals.cspNonce = crypto.randomUUID().replace(/-/g, '');
  next();
};

const serveHtmlWithNonce = async (req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    return next();
  }

  const requestedPath = req.path === '/' ? 'index.html' : req.path.replace(/^\/+/, '');
  if (!requestedPath.endsWith('.html')) {
    return next();
  }

  const absolutePath = path.resolve(publicDir, requestedPath);
  const indexPath = path.join(publicDir, 'index.html');
  if (!absolutePath.startsWith(`${publicDir}${path.sep}`) && absolutePath !== indexPath) {
    return next();
  }

  try {
    const html = await fs.promises.readFile(absolutePath, 'utf8');
    res.type('html');
    return res.send(html.replaceAll('__CSP_NONCE__', res.locals.cspNonce));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return next();
    }
    return next(error);
  }
};

// CORS Configuration
const parseCorsOrigins = () => {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;

  if (envOrigins) {
    const parsedOrigins = envOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (parsedOrigins.length > 0) {
      return parsedOrigins;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ALLOWED_ORIGINS must be set in production and contain at least one allowed origin.');
  }

  return ['http://localhost:3000', 'http://processace.local:3000'];
};

app.use(
  cors({
    origin: parseCorsOrigins(),
    credentials: true,
  }),
);

app.use(attachCspNonce);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': [(_req, res) => `'nonce-${res.locals.cspNonce}'`, "'self'", 'https://unpkg.com', 'https://esm.sh'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'", 'https://unpkg.com', 'https://esm.sh'],
      },
    },
  }),
);

app.use(express.json());
app.use(cookieParser());

// Request logging middleware
app.use((req, res, next) => {
  req.log = logger.child({ reqId: req.headers['x-request-id'] });
  req.log.info({ req }, 'Incoming request');

  res.on('finish', () => {
    req.log.info({ res }, 'Request completed');
  });

  next();
});

// Serve frontend
app.use(serveHtmlWithNonce);
app.use(express.static(publicDir));

const evidenceRoutes = require('./api/evidence');
const jobsRoutes = require('./api/jobs');
const artifactsRoutes = require('./api/artifacts');
const workspacesRoutes = require('./api/workspaces');
const adminRoutes = require('./api/admin');

// Routes
app.use('/health', healthRoutes);

// Auth routes with rate limiting
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// General API rate limit
app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);

// Protected Routes
app.use('/api/evidence', authenticateToken, evidenceRoutes);
app.use('/api/jobs', authenticateToken, jobsRoutes);
app.use('/api/artifacts', authenticateToken, artifactsRoutes);
app.use('/api/workspaces', authenticateToken, workspacesRoutes);
app.use('/api/settings', authenticateToken, require('./api/settings'));
app.use('/api/invitations', require('./api/invitations')); // Public (for token check) + Protected (for accept)
app.use('/api/notifications', authenticateToken, require('./api/notifications'));
app.use('/api/admin', adminRoutes); // Admin routes handle their own auth + admin check

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler — do NOT expose internal error messages to clients
app.use((err, req, res, _next) => {
  sendErrorResponse(res, err, req);
});

module.exports = app;
