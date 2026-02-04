const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./logging/logger');
const healthRoutes = require('./api/health');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

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

// Routes
app.use('/health', healthRoutes);
app.use('/api/evidence', evidenceRoutes);


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
