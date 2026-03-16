const OpenAIProvider = require('./openaiProvider');
const GoogleProvider = require('./googleProvider');
const AnthropicProvider = require('./anthropicProvider');

const getLlmProvider = (options = {}) => {
  // Support mock provider for testing
  if (process.env.MOCK_LLM === 'true') {
    return {
      complete: async (_prompt, _system) => {
        return JSON.stringify({
          processId: 'Process_Mock',
          processName: 'Mock Process',
          nodes: [
            { id: 'StartEvent_1', name: 'Start', type: 'startEvent' },
            { id: 'Task_1', name: 'Mock Task', type: 'task' },
            { id: 'EndEvent_1', name: 'End', type: 'endEvent' },
          ],
          edges: [
            { id: 'Flow_1', sourceId: 'StartEvent_1', targetId: 'Task_1' },
            { id: 'Flow_2', sourceId: 'Task_1', targetId: 'EndEvent_1' },
          ],
        });
      },
    };
  }

  const providerName = (options.provider || 'openai').toLowerCase();

  // Default models if not specified
  const defaults = {
    openai: 'gpt-5-nano-2025-08-07',
    google: 'gemini-3.1-flash-lite-preview',
    anthropic: 'claude-haiku-4-5-20251001',
    ollama: 'llama3.2',
  };

  const model = options.model || defaults[providerName];

  const config = {
    model,
    provider: providerName,
  };

  // Prioritize passed API Key, then fall back to env vars
  if (options.apiKey) {
    config.apiKey = options.apiKey;
  }

  if (options.baseURL) {
    config.baseURL = options.baseURL;
  }

  switch (providerName) {
    case 'google':
    case 'gemini':
      return new GoogleProvider(config);
    case 'anthropic':
    case 'claude':
      return new AnthropicProvider(config);
    case 'ollama':
      config.apiKey = 'ollama-local-placeholder';
      config.baseURL = config.baseURL || process.env.OLLAMA_BASE_URL_DEFAULT || 'http://localhost:11434/v1';
      return new OpenAIProvider(config);
    case 'openai':
    default:
      return new OpenAIProvider(config);
  }
};

module.exports = {
  getLlmProvider,
};
