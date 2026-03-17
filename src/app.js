const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./logging/logger');
const healthRoutes = require('./api/health');
const path = require('path');
const cookieParser = require('cookie-parser');
const authRoutes = require('./api/auth');
const { authenticateToken } = require('./middleware/auth');
const { authLimiter, apiLimiter } = require('./middleware/rateLimit');
const { sendErrorResponse } = require('./utils/errorResponse');

const app = express();

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

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", 'https://unpkg.com', 'https://esm.sh', "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'", 'https://unpkg.com', 'https://esm.sh'],
      },
    },
  }),
);

app.use(express.json());
app.use(cookieParser());

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  req.log = logger.child({ reqId: req.headers['x-request-id'] });
  req.log.info({ req }, 'Incoming request');

  res.on('finish', () => {
    req.log.info({ res }, 'Request completed');
  });

  next();
});

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
