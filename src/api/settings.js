const express = require('express');
const ollamaModelCatalog = require('../config/ollamaModelCatalog');
const ollamaTranscriptionModelCatalog = require('../config/ollamaTranscriptionModelCatalog');
const settingsService = require('../services/settingsService');
const { getJob } = require('../models/job');
const { getLlmProvider } = require('../llm');
const { deleteModel, listInstalledModels } = require('../services/ollamaService');
const { modelQueue } = require('../services/queueInstance');
const { auditMiddleware } = require('../middleware/auditMiddleware');
const { AppError, sendErrorResponse } = require('../utils/errorResponse');

const router = express.Router();

/**
 * Middleware to restrict access to admin users only.
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admins only.' });
  }
  next();
};

/**
 * GET /api/settings
 * Get all application settings. API keys are masked. Admin only.
 */
router.get(
  '/',
  requireAdmin,
  auditMiddleware('settings', () => 'app_settings'),
  (req, res) => {
    try {
      const settings = settingsService.getSettings();
      res.json(settings);
    } catch (error) {
      return sendErrorResponse(res, error, req);
    }
  },
);

/**
 * PUT /api/settings
 * Update a single application setting. API keys are encrypted. Admin only.
 */
router.put('/', requireAdmin, (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }

    const updated = settingsService.updateSetting(key, value);
    res.json(updated);
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

/**
 * DELETE /api/settings
 * Delete a specific application setting by key. Admin only.
 */
router.delete('/', requireAdmin, (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'Key is required' });
    }

    settingsService.deleteSetting(key);
    res.json({ success: true, key });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

/**
 * POST /api/settings/verify-provider
 * Verify an LLM provider connection and list available models. Admin only.
 */
router.post('/verify-provider', requireAdmin, async (req, res) => {
  try {
    const { provider, apiKey, baseUrl } = req.body;

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    const config = settingsService.resolveProviderConfig(provider, {
      apiKey,
      baseUrl,
    });
    const llm = getLlmProvider({
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });

    const models = await llm.listModels();

    res.json({ models });
  } catch (error) {
    return sendErrorResponse(
      res,
      new AppError(500, 'Could not connect to the provider. Please verify your API key and settings.', { cause: error }),
      req,
    );
  }
});

router.get('/llm/catalog', requireAdmin, (_req, res) => {
  res.json({ models: ollamaModelCatalog });
});

router.get('/transcription/catalog', requireAdmin, (_req, res) => {
  res.json({ models: ollamaTranscriptionModelCatalog });
});

router.post('/llm/pull', requireAdmin, async (req, res) => {
  try {
    const { modelName, baseUrl } = req.body;
    const model = ollamaModelCatalog.find((entry) => entry.id === modelName);

    if (!model) {
      return res.status(400).json({ error: 'Model not supported or unauthorized.' });
    }

    const job = await modelQueue.add(
      'model_pull',
      { modelName: model.id, baseUrl },
      {
        userId: req.user.id,
      },
    );

    res.status(202).json({ jobId: job.id, status: job.status });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

router.post('/transcription/pull', requireAdmin, async (req, res) => {
  try {
    const { modelName, baseUrl } = req.body;
    const model = ollamaTranscriptionModelCatalog.find((entry) => entry.id === modelName);

    if (!model) {
      return res.status(400).json({ error: 'Model not supported or unauthorized.' });
    }

    const job = await modelQueue.add(
      'model_pull',
      { modelName: model.id, baseUrl },
      {
        userId: req.user.id,
      },
    );

    res.status(202).json({ jobId: job.id, status: job.status });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

router.delete('/llm/model', requireAdmin, async (req, res) => {
  try {
    const { modelName, baseUrl } = req.body;
    const model = ollamaModelCatalog.find((entry) => entry.id === modelName);

    if (!model) {
      return res.status(400).json({ error: 'Model not supported or unauthorized.' });
    }

    await deleteModel(model.id, baseUrl);
    const installedModels = await listInstalledModels(baseUrl);

    res.json({
      success: true,
      modelName: model.id,
      installedModels,
    });
  } catch (error) {
    return sendErrorResponse(
      res,
      new AppError(500, 'Failed to delete the model. Please try again or check the Ollama connection.', { cause: error }),
      req,
    );
  }
});

router.delete('/transcription/model', requireAdmin, async (req, res) => {
  try {
    const { modelName, baseUrl } = req.body;
    const model = ollamaTranscriptionModelCatalog.find((entry) => entry.id === modelName);

    if (!model) {
      return res.status(400).json({ error: 'Model not supported or unauthorized.' });
    }

    await deleteModel(model.id, baseUrl);
    const installedModels = await listInstalledModels(baseUrl);

    res.json({
      success: true,
      modelName: model.id,
      installedModels,
    });
  } catch (error) {
    return sendErrorResponse(
      res,
      new AppError(500, 'Failed to delete the transcription model. Please try again or check the Ollama connection.', { cause: error }),
      req,
    );
  }
});

router.get('/llm/pull/:jobId', requireAdmin, (req, res) => {
  try {
    const job = getJob(req.params.jobId);
    if (!job || job.type !== 'model_pull') {
      return res.status(404).json({ error: 'Model pull job not found' });
    }

    if (job.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      progressMessage: job.progress_message,
      result: job.result,
      error: job.error,
    });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

router.get('/transcription/pull/:jobId', requireAdmin, (req, res) => {
  try {
    const job = getJob(req.params.jobId);
    if (!job || job.type !== 'model_pull') {
      return res.status(404).json({ error: 'Model pull job not found' });
    }

    if (job.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      progressMessage: job.progress_message,
      result: job.result,
      error: job.error,
    });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

module.exports = router;
