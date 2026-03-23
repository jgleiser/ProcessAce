const { after, before, describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.MOCK_LLM = 'true';
process.env.MAX_UPLOAD_SIZE_MB = '1';
process.env.UPLOADS_DIR = 'tmp/test-uploads-evidence-security';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
process.env.LOG_LEVEL = 'silent';

const app = require('../../src/app');
const db = require('../../src/services/db');
const { Evidence, saveEvidence } = require('../../src/models/evidence');
const { evidenceQueue } = require('../../src/services/queueInstance');

describe('Evidence security integration tests', () => {
  let server;
  let agent;
  let userId;
  let originalQueueAdd;
  let safeEvidenceId;

  const uploadsDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR);
  const safeEvidenceFilename = 'phase2-evidence-security.txt';
  const safeEvidencePath = path.join(process.env.UPLOADS_DIR, safeEvidenceFilename);

  const user = {
    name: 'Evidence User',
    email: `evidence_user_${Date.now()}@example.com`,
    password: 'Password123!',
  };

  before(async () => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, safeEvidenceFilename), 'hello evidence', 'utf8');

    originalQueueAdd = evidenceQueue.add;
    evidenceQueue.add = async () => ({ id: 'stub-job-id' });

    server = app.listen(0);
    agent = request.agent(server);

    await agent.post('/api/auth/register').send(user).expect(201);
    await agent.post('/api/auth/login').send({ email: user.email, password: user.password }).expect(200);

    userId = db.prepare('SELECT id FROM users WHERE email = ?').get(user.email).id;

    const safeEvidence = new Evidence({
      filename: safeEvidenceFilename,
      originalName: 'phase2"\r\nreport.txt',
      mimeType: 'text/plain',
      size: 14,
      path: safeEvidencePath,
      user_id: userId,
    });

    await saveEvidence(safeEvidence);
    safeEvidenceId = safeEvidence.id;
  });

  after(() => {
    evidenceQueue.add = originalQueueAdd;
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    server.close();
  });

  it('rejects unsupported upload types with 415', async () => {
    const res = await agent.post('/api/evidence/upload').attach('file', Buffer.from('not allowed'), 'malware.exe').expect(415);

    assert.match(res.body.error, /Unsupported media type/);
    assert.ok(res.body.correlationId);
  });

  it('rejects oversized uploads with 413', async () => {
    const res = await agent
      .post('/api/evidence/upload')
      .attach('file', Buffer.alloc(1024 * 1024 + 1, 'a'), 'large.txt')
      .expect(413);

    assert.strictEqual(res.body.error, 'File too large. Maximum upload size is 1MB.');
    assert.ok(res.body.correlationId);
  });

  it('stores uploaded files under the configured uploads directory', async () => {
    const uploadRes = await agent
      .post('/api/evidence/upload')
      .attach('file', Buffer.from('configured path test', 'utf8'), 'configured-path-test.txt')
      .expect(202);

    const savedEvidence = db.prepare('SELECT path FROM evidence WHERE id = ?').get(uploadRes.body.evidenceId);
    const resolvedEvidencePath = path.resolve(savedEvidence.path);

    assert.ok(resolvedEvidencePath.startsWith(`${uploadsDir}${path.sep}`));
    assert.strictEqual(fs.existsSync(resolvedEvidencePath), true);
  });

  it('rejects evidence file paths that escape the uploads root', async () => {
    const escapedEvidence = new Evidence({
      filename: 'package.json',
      originalName: 'package.json',
      mimeType: 'application/json',
      size: 0,
      path: path.resolve(process.cwd(), 'package.json'),
      user_id: userId,
    });

    await saveEvidence(escapedEvidence);

    await agent.get(`/api/evidence/${escapedEvidence.id}/file`).expect(403);
  });

  it('sanitizes evidence download filenames in the Content-Disposition header', async () => {
    const res = await agent.get(`/api/evidence/${safeEvidenceId}/file`).expect(200);

    assert.strictEqual(res.headers['content-disposition'], 'inline; filename="phase2report.txt"');
  });
});
