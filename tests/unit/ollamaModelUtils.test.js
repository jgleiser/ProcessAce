const { describe, it } = require('node:test');
const assert = require('node:assert');

const { normalizeOllamaModelId } = require('../../src/services/ollamaModelUtils');
const { listInstalledModels } = require('../../src/services/ollamaService');

describe('ollamaModelUtils', () => {
  it('should remove the default latest tag from Ollama model ids', () => {
    assert.strictEqual(normalizeOllamaModelId('karanchopda333/whisper:latest'), 'karanchopda333/whisper');
    assert.strictEqual(normalizeOllamaModelId('distil-whisper-large-v3:latest'), 'distil-whisper-large-v3');
  });

  it('should preserve explicit non-default tags', () => {
    assert.strictEqual(normalizeOllamaModelId('llama3.2:3b'), 'llama3.2:3b');
  });
});

describe('listInstalledModels', () => {
  it('should normalize ids returned by Ollama tags', async () => {
    const originalFetch = global.fetch;

    try {
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          models: [
            {
              model: 'karanchopda333/whisper:latest',
              name: 'karanchopda333/whisper:latest',
            },
            {
              model: 'dimavz/whisper-tiny:latest',
              name: 'dimavz/whisper-tiny:latest',
            },
          ],
        }),
      });

      const models = await listInstalledModels('http://localhost:11434/v1');
      assert.deepStrictEqual(
        models.map((model) => model.id),
        ['karanchopda333/whisper', 'dimavz/whisper-tiny'],
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
