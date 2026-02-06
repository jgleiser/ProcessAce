const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./logging/logger');
const healthRoutes = require('./api/health');
const path = require('path');

const app = express();

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "https://unpkg.com"],
            "img-src": ["'self'", "data:", "blob:"], // Allow blob: for SVG download
        },
    },
}));
app.use(cors());
app.use(express.json());

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




// Routes
app.use('/health', healthRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/artifacts', artifactsRoutes);


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
