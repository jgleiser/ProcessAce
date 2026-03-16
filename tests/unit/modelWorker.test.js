const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

process.env.LOG_LEVEL = 'silent';

const { processModelPull } = require('../../src/workers/modelWorker');

describe('modelWorker', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should parse streamed Ollama progress and complete successfully', async () => {
    const encoder = new TextEncoder();
    const progressUpdates = [];

    global.fetch = async () => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"status":"pulling manifest"}\n{"status":"downloading","completed":5'));
          controller.enqueue(encoder.encode('0,"total":100}\n{"status":"success"}\n'));
          controller.close();
        },
      }),
    });

    const result = await processModelPull({
      id: 'job-1',
      data: { modelName: 'phi3:mini' },
      reportProgress: async (percent, message) => {
        progressUpdates.push({ percent, message });
      },
    });

    assert.strictEqual(result.modelName, 'phi3:mini');
    assert.deepStrictEqual(progressUpdates.at(-1), { percent: 100, message: 'success' });
    assert.ok(progressUpdates.some((entry) => entry.percent === 50));
  });
});
