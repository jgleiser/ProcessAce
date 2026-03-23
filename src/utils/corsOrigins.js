const DEFAULT_DEV_ORIGINS = ['http://localhost:3000', 'http://processace.local:3000'];

const parseCorsOrigins = (env = process.env) => {
  const envOrigins = env.CORS_ALLOWED_ORIGINS;

  if (envOrigins) {
    const parsedOrigins = envOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (parsedOrigins.length > 0) {
      return parsedOrigins;
    }
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('CORS_ALLOWED_ORIGINS must be set in production and contain at least one allowed origin.');
  }

  return DEFAULT_DEV_ORIGINS;
};

module.exports = {
  parseCorsOrigins,
};
