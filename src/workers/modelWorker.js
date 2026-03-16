const logger = require('../logging/logger');
const { buildOllamaApiUrl, resolveOllamaBaseUrl } = require('../services/ollamaService');

const readOllamaEvents = async (stream, onEvent) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      await onEvent(JSON.parse(trimmed));
    }
  }

  const tail = buffer.trim();
  if (tail) {
    await onEvent(JSON.parse(tail));
  }
};

const processModelPull = async (job) => {
  const { modelName, baseUrl } = job.data;
  const resolvedBaseUrl = resolveOllamaBaseUrl(baseUrl);
  const pullUrl = buildOllamaApiUrl(resolvedBaseUrl, '/api/pull');

  logger.info({ jobId: job.id, modelName, ollamaBaseUrl: resolvedBaseUrl }, 'Starting Ollama model pull');
  await job.reportProgress(0, 'initializing');
  let lastProgress = 0;

  const response = await fetch(pullUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to pull model: ${errorText || response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Failed to pull model: no response body received from Ollama');
  }

  await readOllamaEvents(response.body, async (event) => {
    const statusMessage = event.status || null;
    if (event.total && event.completed) {
      const percent = Math.round((event.completed / event.total) * 100);
      lastProgress = percent;
      await job.reportProgress(percent, statusMessage);
      return;
    }

    if (statusMessage) {
      await job.reportProgress(statusMessage === 'success' ? 100 : lastProgress, statusMessage);
    }
  });

  await job.reportProgress(100, 'success');

  return {
    modelName,
    source: 'ollama',
    pulledAt: new Date().toISOString(),
  };
};

module.exports = {
  processModelPull,
};
