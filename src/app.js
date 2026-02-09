const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./logging/logger');
const healthRoutes = require('./api/health');
const path = require('path');
const cookieParser = require('cookie-parser');
const authRoutes = require('./api/auth');
const { authenticateToken } = require('./middleware/auth');

const app = express();

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "https://unpkg.com", "'unsafe-inline'"],
            "img-src": ["'self'", "data:", "blob:"], // Allow blob: for SVG download
        },
    },
}));
app.use(cors());
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
app.use('/api/auth', authRoutes);

// Protected Routes
app.use('/api/evidence', authenticateToken, evidenceRoutes);
app.use('/api/jobs', authenticateToken, jobsRoutes);
app.use('/api/artifacts', authenticateToken, artifactsRoutes);
app.use('/api/workspaces', authenticateToken, workspacesRoutes);
app.use('/api/settings', authenticateToken, require('./api/settings'));
app.use('/api/admin', adminRoutes); // Admin routes handle their own auth + admin check


// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error({ err }, 'Unhandled exception');
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

module.exports = app;
