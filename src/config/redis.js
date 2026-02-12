const { Redis } = require('ioredis');
const logger = require('../logging/logger');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const connection = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null, // Required by BullMQ
});

connection.on('connect', () => {
  logger.info({ host: REDIS_HOST }, 'Connected to Redis');
});

connection.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

module.exports = connection;
