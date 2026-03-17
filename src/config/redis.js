const { Redis } = require('ioredis');
const logger = require('../logging/logger');
const { createRedisOptions } = require('./redisOptions');

const connection = new Redis(createRedisOptions());

connection.on('connect', () => {
  const options = createRedisOptions();
  logger.info({ host: options.host }, 'Connected to Redis');
});

connection.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

module.exports = connection;
module.exports.createRedisOptions = createRedisOptions;
