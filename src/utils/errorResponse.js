const { v4: uuidv4 } = require('uuid');
const logger = require('../logging/logger');

class AppError extends Error {
  constructor(statusCode, userMessage, options = {}) {
    super(userMessage);
    this.statusCode = statusCode;
    this.userMessage = userMessage;
    this.isOperational = options.isOperational !== false;
    this.cause = options.cause;
  }
}

const generateCorrelationId = (req) => {
  return req?.headers?.['x-request-id'] || uuidv4();
};

const sendErrorResponse = (res, error, req) => {
  const correlationId = generateCorrelationId(req);

  if (error instanceof AppError) {
    logger.error({ correlationId, err: error.cause || error, statusCode: error.statusCode }, error.message);

    return res.status(error.statusCode).json({
      error: error.userMessage,
      correlationId,
    });
  }

  logger.error({ correlationId, err: error }, 'Unhandled error');

  return res.status(500).json({
    error: 'Something went wrong. Please try again or contact support.',
    correlationId,
  });
};

module.exports = { AppError, sendErrorResponse, generateCorrelationId };
