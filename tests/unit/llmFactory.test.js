const { describe, it } = require('node:test');
const assert = require('node:assert');

process.env.LOG_LEVEL = 'silent';

const { getLlmProvider } = require('../../src/llm');
const OpenAIProvider = require('../../src/llm/openaiProvider');

describe('LLM factory', () => {
  it('should route ollama to OpenAIProvider with a dummy key and default base URL', () => {
    const provider = getLlmProvider({ provider: 'ollama' });

    assert.ok(provider instanceof OpenAIProvider);
    assert.strictEqual(provider.config.apiKey, 'ollama-local-placeholder');
    assert.strictEqual(provider.config.baseURL, process.env.OLLAMA_BASE_URL_DEFAULT || 'http://localhost:11434/v1');
  });
});
