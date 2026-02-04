require('dotenv').config();
const app = require('./app');
const logger = require('./logging/logger');

const evidenceRoutes = require('./api/evidence');
const { processEvidence } = require('./workers/evidenceWorker');

const PORT = process.env.PORT || 3000;

// Register worker (Hack: accessing the queue instance exported from the router)
// In a real app, queue would be a singleton or injected service.
if (evidenceRoutes.queue) {
    evidenceRoutes.queue.registerWorker('process_evidence', processEvidence);
}

const server = app.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV }, 'ProcessAce Server started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});
