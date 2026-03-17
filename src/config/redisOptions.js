const createRedisOptions = () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  lazyConnect: process.env.NODE_ENV === 'test',
});

module.exports = { createRedisOptions };
