const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
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
