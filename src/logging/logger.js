const pino = require('pino');

const REDACTION_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.cookies.*',
  'headers.cookie',
  'headers.authorization',
  'cookie',
  'authorization',
  'email',
  'recipient_email',
  'password',
  'currentPassword',
  'apiKey',
  'token',
  'auth_token',
  '*.email',
  '*.recipient_email',
  '*.password',
  '*.currentPassword',
  '*.apiKey',
  '*.token',
  '*.auth_token',
  '*.*.email',
  '*.*.recipient_email',
  '*.*.password',
  '*.*.currentPassword',
  '*.*.apiKey',
  '*.*.token',
  '*.*.auth_token',
];

const buildLoggerOptions = (env = process.env) => {
  const isDev = env.NODE_ENV === 'development';

  return {
    level: env.LOG_LEVEL || 'info',
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
    base: {
      pid: process.pid,
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    redact: {
      paths: REDACTION_PATHS,
      censor: '[REDACTED]',
    },
  };
};

const createLogger = (overrides = {}, destination) => {
  return pino(
    {
      ...buildLoggerOptions(),
      ...overrides,
    },
    destination,
  );
};

const logger = createLogger();

module.exports = logger;
module.exports.buildLoggerOptions = buildLoggerOptions;
module.exports.createLogger = createLogger;
module.exports.REDACTION_PATHS = REDACTION_PATHS;
