const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const path = require('node:path');

// Set up test environment BEFORE requiring modules
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.MOCK_LLM = 'true';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

const request = require('supertest');
const app = require('../../src/app');
const { Evidence, saveEvidence, getEvidence } = require('../../src/models/evidence');
const { getJob } = require('../../src/models/job');

describe('Evidence process-text regressions', () => {
  let server;
  let agent;
  let userId;

  const testUser = {
    name: 'Evidence Process User',
    email: `evidence_process_${Date.now()}@test.com`,
    password: 'Password123',
  };

  before(async () => {
    server = app.listen(0);
    agent = request.agent(server);

    const registerResponse = await agent.post('/api/auth/register').send(testUser).expect(201);
    userId = registerResponse.body.user.id;

    await agent.post('/api/auth/login').send({ email: testUser.email, password: testUser.password }).expect(200);
  });

  after(() => {
    server.close();
  });

  it('keeps the original evidence file pointer when transcript processing starts', async () => {
    const evidence = new Evidence({
      filename: 'audio-input.mp4',
      originalName: 'audio-input.mp4',
      mimeType: 'video/mp4',
      size: 123,
      path: path.join('uploads', 'audio-input.mp4'),
      user_id: userId,
    });
    await saveEvidence(evidence);

    const response = await agent.post(`/api/evidence/${evidence.id}/process-text`).send({ text: 'Texto corregido del proceso.' }).expect(202);

    const persistedEvidence = await getEvidence(evidence.id);
    assert.ok(persistedEvidence, 'Evidence should still exist');
    assert.strictEqual(persistedEvidence.path, evidence.path);
    assert.strictEqual(persistedEvidence.filename, evidence.filename);

    const queuedJob = getJob(response.body.jobId);
    assert.ok(queuedJob, 'Process job should be queued');
    assert.strictEqual(queuedJob.data.transcriptText, 'Texto corregido del proceso.');
  });

  it('serves the normalized transcription audio variant when it exists', async () => {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const originalPath = path.join(uploadsDir, `original-${uniqueSuffix}.mp4`);
    const convertedPath = path.join(uploadsDir, `converted-${uniqueSuffix}.mp3`);

    await fs.writeFile(originalPath, 'orig-audio', 'utf8');
    await fs.writeFile(convertedPath, 'normalized-audio', 'utf8');

    const evidence = new Evidence({
      filename: path.basename(originalPath),
      originalName: 'meeting.mp4',
      mimeType: 'video/mp4',
      size: 10,
      path: originalPath,
      metadata: {
        transcription: {
          convertedAudioPath: convertedPath,
          convertedAudioFilename: 'meeting-normalized.mp3',
          convertedAudioMimeType: 'audio/mpeg',
        },
      },
      user_id: userId,
    });
    await saveEvidence(evidence);

    try {
      const response = await agent.get(`/api/evidence/${evidence.id}/file?variant=transcription`).expect(200);
      assert.ok(response.headers['content-type'].includes('audio/mpeg'));
      assert.ok(response.headers['content-disposition'].includes('meeting-normalized.mp3'));
      const payload = Buffer.isBuffer(response.body) ? response.body.toString('utf8') : response.text;
      assert.strictEqual(payload, 'normalized-audio');
    } finally {
      await fs.unlink(originalPath).catch(() => {});
      await fs.unlink(convertedPath).catch(() => {});
    }
  });
});
