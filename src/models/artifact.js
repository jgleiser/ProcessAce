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
    }
}

// Prepared Statements
const insertStmt = db.prepare(`
    INSERT INTO artifacts (id, type, version, content, metadata, createdBy, createdAt, previousVersionId, filename)
    VALUES (@id, @type, @version, @content, @metadata, @createdBy, @createdAt, @previousVersionId, @filename)
`);

const getStmt = db.prepare('SELECT * FROM artifacts WHERE id = ?');
const deleteStmt = db.prepare('DELETE FROM artifacts WHERE id = ?');

const saveArtifact = async (artifact) => {
    const data = {
        ...artifact,
        metadata: JSON.stringify(artifact.metadata || {}),
        createdAt: artifact.createdAt.toISOString()
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
        createdAt: new Date(row.createdAt)
    });
};

const deleteArtifact = async (id) => {
    const result = deleteStmt.run(id);
    return result.changes > 0;
};

const updateStmt = db.prepare(`
    UPDATE artifacts 
    SET content = @content, 
        version = version + 1,
        createdAt = @createdAt
    WHERE id = @id
`);

const updateArtifact = async (id, content) => {
    const info = updateStmt.run({
        id,
        content,
        createdAt: new Date().toISOString()
    });
    return info.changes > 0;
};

module.exports = {
    Artifact,
    saveArtifact,
    getArtifact,
    deleteArtifact,
    updateArtifact
};
