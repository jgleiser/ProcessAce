const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// Set up test environment BEFORE requiring modules
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.MOCK_LLM = 'true';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

const request = require('supertest');
const app = require('../../src/app');
const { Artifact, saveArtifact } = require('../../src/models/artifact');

describe('Artifacts API Integration Tests', () => {
  let server;
  let agent;
  let docArtifactId;
  let bpmnArtifactId;
  let testUserId;

  const testUser = {
    name: 'Artifacts User',
    email: `artifacts_user_${Date.now()}@test.com`,
    password: 'Password123',
  };

  before(async () => {
    server = app.listen(0);
    agent = request.agent(server);

    // Register — the endpoint returns the user object directly at the body root
    const reg = await agent.post('/api/auth/register').send(testUser).expect(201);
    testUserId = reg.body.id;

    await agent
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);

    // Seed a doc artifact owned by the test user
    const docArtifact = new Artifact({
      type: 'doc',
      content: '# Hello\n\nThis is a **test** document.\n\n| Col A | Col B |\n|---|---|\n| 1 | 2 |',
      createdBy: 'test',
      user_id: testUserId,
      filename: 'test-doc.md',
    });
    await saveArtifact(docArtifact);
    docArtifactId = docArtifact.id;

    // Seed a bpmn artifact (wrong type for DOCX export)
    const bpmnArtifact = new Artifact({
      type: 'bpmn',
      content: '<xml></xml>',
      createdBy: 'test',
      user_id: testUserId,
    });
    await saveArtifact(bpmnArtifact);
    bpmnArtifactId = bpmnArtifact.id;
  });

  after(() => {
    server.close();
  });

  // --- GET /api/artifacts/:id/export/docx ---

  it('should return a DOCX buffer for a valid doc artifact', async () => {
    const res = await agent.get(`/api/artifacts/${docArtifactId}/export/docx`).expect(200);

    assert.ok(
      res.headers['content-type'].includes(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
      'Content-Type should be DOCX MIME type',
    );
    assert.ok(
      res.headers['content-disposition'].includes('attachment'),
      'Content-Disposition should trigger download',
    );
    assert.ok(
      res.headers['content-disposition'].includes('.docx'),
      'Filename should have .docx extension',
    );
    // Verify a non-trivially-sized payload was generated
    const contentLength = parseInt(res.headers['content-length'], 10);
    assert.ok(contentLength > 1000, `Expected a non-empty DOCX (got ${contentLength} bytes)`);
  });

  it('should return 400 when trying to export a non-doc artifact', async () => {
    const res = await agent.get(`/api/artifacts/${bpmnArtifactId}/export/docx`).expect(400);
    assert.ok(res.body.error, 'Should return an error message');
  });

  it('should return 404 for a non-existent artifact', async () => {
    await agent.get('/api/artifacts/non-existent-id/export/docx').expect(404);
  });

  it('should return 401 for unauthenticated requests', async () => {
    await request(server).get(`/api/artifacts/${docArtifactId}/export/docx`).expect(401);
  });
});
