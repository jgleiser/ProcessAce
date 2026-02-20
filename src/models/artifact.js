const { v4: uuidv4 } = require('uuid');
const db = require('../services/db');

class Artifact {
  constructor({
    id = uuidv4(),
    type, // 'bpmn', 'sipoc', 'raci', 'doc'
    version = 1,
    content,
    metadata = {},
    createdBy = 'system',
    createdAt = new Date(),
    previousVersionId = null,
    filename = null,
    user_id = null,
    workspace_id = null,
    llm_provider = null,
    llm_model = null,
  }) {
    this.id = id;
    this.type = type;
    this.version = version;
    this.content = content;
    this.metadata = metadata;
    this.createdBy = createdBy;
    this.createdAt = createdAt;
    this.previousVersionId = previousVersionId;
    this.filename = filename;
    this.user_id = user_id;
    this.workspace_id = workspace_id;
    this.llm_provider = llm_provider;
    this.llm_model = llm_model;
  }
}

// Prepared Statements
const insertStmt = db.prepare(`
    INSERT INTO artifacts (id, type, version, content, metadata, createdBy, createdAt, previousVersionId, filename, user_id, workspace_id, llm_provider, llm_model)
    VALUES (@id, @type, @version, @content, @metadata, @createdBy, @createdAt, @previousVersionId, @filename, @user_id, @workspace_id, @llm_provider, @llm_model)
`);

const getStmt = db.prepare('SELECT * FROM artifacts WHERE id = ? ORDER BY version DESC LIMIT 1');
const deleteStmt = db.prepare('DELETE FROM artifacts WHERE id = ?');

const getHistoryStmt = db.prepare(
  'SELECT version, createdAt, createdBy FROM artifacts WHERE id = ? ORDER BY version DESC',
);
const getVersionStmt = db.prepare('SELECT * FROM artifacts WHERE id = ? AND version = ?');

const saveArtifact = async (artifact) => {
  const data = {
    ...artifact,
    metadata: JSON.stringify(artifact.metadata || {}),
    createdAt: artifact.createdAt.toISOString(),
  };
  insertStmt.run(data);
  return artifact;
};

const getArtifact = async (id) => {
  const row = getStmt.get(id);
  if (!row) return null;

  return new Artifact({
    ...row,
    metadata: JSON.parse(row.metadata),
    createdAt: new Date(row.createdAt),
  });
};

const getArtifactVersionHistory = async (id) => {
  const rows = getHistoryStmt.all(id);
  return rows.map((row) => ({
    version: row.version,
    createdAt: new Date(row.createdAt),
    createdBy: row.createdBy,
  }));
};

const getArtifactVersion = async (id, version) => {
  const row = getVersionStmt.get(id, version);
  if (!row) return null;

  return new Artifact({
    ...row,
    metadata: JSON.parse(row.metadata),
    createdAt: new Date(row.createdAt),
  });
};

const deleteArtifact = async (id) => {
  const result = deleteStmt.run(id);
  return result.changes > 0;
};

const updateArtifact = async (id, content) => {
  const current = await getArtifact(id);
  if (!current) return false;

  const newVersion = current.version + 1;
  const now = new Date();

  const data = {
    id: current.id,
    type: current.type,
    version: newVersion,
    content,
    metadata: JSON.stringify(current.metadata || {}),
    createdBy: current.createdBy,
    createdAt: now.toISOString(),
    previousVersionId: current.id,
    filename: current.filename,
    user_id: current.user_id,
    workspace_id: current.workspace_id,
    llm_provider: current.llm_provider,
    llm_model: current.llm_model,
  };

  insertStmt.run(data);
  return true;
};

module.exports = {
  Artifact,
  saveArtifact,
  getArtifact,
  deleteArtifact,
  updateArtifact,
  getArtifactVersionHistory,
  getArtifactVersion,
};
