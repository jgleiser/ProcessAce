const settingsService = require('./settingsService');
const { validateOllamaBaseURL } = require('../llm/openaiProvider');
const { normalizeOllamaModelId } = require('./ollamaModelUtils');

const resolveOllamaBaseUrl = (baseUrlOverride) => {
  const config = settingsService.resolveProviderConfig('ollama', {
    baseUrl: baseUrlOverride,
  });

  return validateOllamaBaseURL(config.baseUrl);
};

const buildOllamaApiUrl = (baseUrl, endpointPath) => {
  const parsed = new URL(resolveOllamaBaseUrl(baseUrl));
  const normalizedEndpoint = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const basePath = parsed.pathname.endsWith('/v1') ? parsed.pathname.slice(0, -3) : parsed.pathname;

  parsed.pathname = `${basePath.replace(/\/$/, '')}${normalizedEndpoint}`;
  parsed.search = '';
  parsed.hash = '';

  return parsed.toString();
};

const listInstalledModels = async (baseUrl) => {
  const response = await fetch(buildOllamaApiUrl(baseUrl, '/api/tags'));

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Ollama models: ${errorText || response.statusText}`);
  }

  const payload = await response.json();
  const models = Array.isArray(payload.models) ? payload.models : [];

  return models.map((model) => ({
    id: normalizeOllamaModelId(model.model || model.name),
    name: normalizeOllamaModelId(model.name || model.model),
    size: model.size || null,
    modifiedAt: model.modified_at || null,
  }));
};

const deleteModel = async (modelName, baseUrl) => {
  const response = await fetch(buildOllamaApiUrl(baseUrl, '/api/delete'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete Ollama model: ${errorText || response.statusText}`);
  }
};

module.exports = {
  buildOllamaApiUrl,
  deleteModel,
  listInstalledModels,
  resolveOllamaBaseUrl,
};
