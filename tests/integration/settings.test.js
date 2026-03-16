const { after, before, describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.LOG_LEVEL = 'silent';

const app = require('../../src/app');
const db = require('../../src/services/db');
const { Job, saveJob } = require('../../src/models/job');
const OpenAIProvider = require('../../src/llm/openaiProvider');

describe('Settings API Integration Tests', () => {
  let server;
  let adminAgent;
  let editorAgent;
  let adminEmail;
  let editorEmail;
  let originalListModels;
  let originalFetch;

  const login = async (agent, email) => {
    await agent.post('/api/auth/login').send({ email, password: 'Password123!' }).expect(200);
  };

  before(async () => {
    server = app.listen(0);
    adminAgent = request.agent(server);
    editorAgent = request.agent(server);
    adminEmail = `admin_${Date.now()}@example.com`;
    editorEmail = `editor_${Date.now()}@example.com`;

    await adminAgent.post('/api/auth/register').send({ email: adminEmail, password: 'Password123!', name: 'Admin User' }).expect(201);
    await editorAgent.post('/api/auth/register').send({ email: editorEmail, password: 'Password123!', name: 'Editor User' }).expect(201);

    const adminUser = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
    const editorUser = db.prepare('SELECT id FROM users WHERE email = ?').get(editorEmail);
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(adminUser.id);
    db.prepare("UPDATE users SET role = 'editor' WHERE id = ?").run(editorUser.id);

    await login(adminAgent, adminEmail);
    await login(editorAgent, editorEmail);
  });

  after(() => {
    global.fetch = originalFetch;
    OpenAIProvider.prototype.listModels = originalListModels;
    server.close();

    const users = [adminEmail, editorEmail].map((email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email)).filter(Boolean);

    for (const user of users) {
      const workspaces = db.prepare('SELECT id FROM workspaces WHERE owner_id = ?').all(user.id);
      const deleteMembersStmt = db.prepare('DELETE FROM workspace_members WHERE workspace_id = ?');
      const deleteWorkspaceStmt = db.prepare('DELETE FROM workspaces WHERE id = ?');

      for (const workspace of workspaces) {
        deleteMembersStmt.run(workspace.id);
        deleteWorkspaceStmt.run(workspace.id);
      }

      db.prepare('DELETE FROM jobs WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM notifications WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM workspace_invitations WHERE inviter_id = ?').run(user.id);
      db.prepare('DELETE FROM workspace_members WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    }
  });

  it('should verify Ollama without a real API key', async () => {
    originalListModels = OpenAIProvider.prototype.listModels;
    OpenAIProvider.prototype.listModels = async () => [{ id: 'llama3.2', name: 'llama3.2' }];

    const res = await adminAgent.post('/api/settings/verify-provider').send({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1' }).expect(200);

    assert.deepStrictEqual(res.body.models, [{ id: 'llama3.2', name: 'llama3.2' }]);
  });

  it('should restrict the Ollama model catalog to admins', async () => {
    await request(server).get('/api/settings/llm/catalog').expect(401);
    await editorAgent.get('/api/settings/llm/catalog').expect(403);

    const res = await adminAgent.get('/api/settings/llm/catalog').expect(200);
    assert.ok(Array.isArray(res.body.models));
    assert.ok(res.body.models.length > 0);
  });

  it('should enqueue a supported model pull for admins only', async () => {
    originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('{"status":"success"}\n'));
          controller.close();
        },
      }),
    });

    await editorAgent.post('/api/settings/llm/pull').send({ modelName: 'phi3:mini' }).expect(403);

    const res = await adminAgent.post('/api/settings/llm/pull').send({ modelName: 'phi3:mini' }).expect(202);
    assert.ok(res.body.jobId);
  });

  it('should return model pull status only to the initiating admin and hide model pull jobs from dashboard jobs', async () => {
    const adminUser = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);

    const modelPullJob = new Job({
      type: 'model_pull',
      user_id: adminUser.id,
      progress: 45,
      progress_message: 'downloading layers',
      result: null,
      error: null,
      data: { modelName: 'phi3:mini' },
    });
    saveJob(modelPullJob);

    const statusRes = await adminAgent.get(`/api/settings/llm/pull/${modelPullJob.id}`).expect(200);
    assert.strictEqual(statusRes.body.progress, 45);
    assert.strictEqual(statusRes.body.progressMessage, 'downloading layers');

    await editorAgent.get(`/api/settings/llm/pull/${modelPullJob.id}`).expect(403);

    const jobsRes = await adminAgent.get('/api/jobs').expect(200);
    assert.ok(!jobsRes.body.some((job) => job.id === modelPullJob.id));
  });
});
