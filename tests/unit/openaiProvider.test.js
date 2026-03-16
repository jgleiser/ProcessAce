const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
// Silence logger for tests
process.env.LOG_LEVEL = 'silent';
const OpenAIProvider = require('../../src/llm/openaiProvider');

describe('OpenAIProvider Transcription', () => {
  const dummyPath = path.join(__dirname, 'dummy.mp3');

  before(() => {
    fs.writeFileSync(dummyPath, 'fake audio content');
  });

  after(() => {
    if (fs.existsSync(dummyPath)) {
      fs.unlinkSync(dummyPath);
    }
  });
  it('should handle gpt-4o-transcribe-diarize with specialized params', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-4o-transcribe-diarize' });

    let capturedParams = null;
    provider.client = {
      audio: {
        transcriptions: {
          create: async (params) => {
            capturedParams = params;
            return {
              segments: [
                { speaker: 'Speaker 1', text: 'Hello' },
                { speaker: 'Speaker 2', text: 'Hi there' },
              ],
            };
          },
        },
      },
    };

    const result = await provider.transcribe(dummyPath);

    assert.strictEqual(capturedParams.model, 'gpt-4o-transcribe-diarize');
    assert.strictEqual(capturedParams.response_format, 'diarized_json');
    assert.strictEqual(capturedParams.chunking_strategy, 'auto');
    assert.strictEqual(result, 'Speaker 1: Hello\nSpeaker 2: Hi there');
  });

  it('should handle standard models with default params', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-4o-transcribe' });

    let capturedParams = null;
    provider.client = {
      audio: {
        transcriptions: {
          create: async (params) => {
            capturedParams = params;
            return { text: 'Hello world' };
          },
        },
      },
    };

    const result = await provider.transcribe(dummyPath);

    assert.strictEqual(capturedParams.model, 'gpt-4o-transcribe');
    assert.strictEqual(capturedParams.response_format, undefined);
    assert.strictEqual(result, 'Hello world');
  });
});

describe('OpenAIProvider Ollama validation', () => {
  it('should allow Ollama local hosts without a real API key', () => {
    const provider = new OpenAIProvider({
      provider: 'ollama',
      baseURL: 'http://localhost:11434/v1',
      model: 'llama3.2',
    });

    assert.strictEqual(provider.config.baseURL, 'http://localhost:11434/v1');
    assert.strictEqual(provider.config.apiKey, undefined);
  });

  it('should reject non-local Ollama URLs', () => {
    assert.throws(
      () =>
        new OpenAIProvider({
          provider: 'ollama',
          baseURL: 'http://169.254.169.254/v1',
        }),
      /Invalid Ollama base URL/,
    );
  });

  it('should reject credential-bearing Ollama URLs', () => {
    assert.throws(
      () =>
        new OpenAIProvider({
          provider: 'ollama',
          baseURL: 'http://user:pass@localhost:11434/v1',
        }),
      /Embedded credentials are not allowed/,
    );
  });
});
