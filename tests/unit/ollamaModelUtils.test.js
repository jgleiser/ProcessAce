const { describe, it } = require('node:test');
const assert = require('node:assert');

const { normalizeOllamaModelId } = require('../../src/services/ollamaModelUtils');
const { listInstalledModels, unloadModel } = require('../../src/services/ollamaService');

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

describe('unloadModel', () => {
  it('should call Ollama generate with keep_alive zero', async () => {
    const originalFetch = global.fetch;
    let capturedRequest = null;

    try {
      global.fetch = async (url, options) => {
        capturedRequest = {
          url,
          options,
        };

        return {
          ok: true,
        };
      };

      await unloadModel('qwen3.5:9b', 'http://localhost:11434/v1');

      assert.ok(capturedRequest.url.endsWith('/api/generate'));
      assert.strictEqual(capturedRequest.options.method, 'POST');

      const body = JSON.parse(capturedRequest.options.body);
      assert.deepStrictEqual(body, {
        model: 'qwen3.5:9b',
        keep_alive: 0,
        stream: false,
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
