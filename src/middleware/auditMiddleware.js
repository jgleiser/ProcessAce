const logger = require('../logging/logger');

const auditMiddleware = (resourceType, resourceIdResolver) => {
  return (req, res, next) => {
    let resourceId;

    try {
      resourceId = typeof resourceIdResolver === 'function' ? resourceIdResolver(req, res) : resourceIdResolver;
    } catch (error) {
      return next(error);
    }

    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 400 || !req.user?.id) {
        return;
      }

      (req.log || logger).info(
        {
          event_type: 'data_access',
          actor: req.user.id,
          resource_type: resourceType,
          resource_id: resourceId,
          correlation_id: req.correlationId,
        },
        'Sensitive resource accessed',
      );
    });

    next();
  };
};

module.exports = { auditMiddleware };
