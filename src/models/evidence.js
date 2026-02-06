const { v4: uuidv4 } = require('uuid');
const db = require('../services/db');

class Evidence {
    constructor({
        id = uuidv4(),
        filename,
        originalName,
        mimeType,
        size,
        path,
        status = 'pending',
        metadata = {},
        createdAt = new Date(),
        updatedAt = new Date(),
    }) {
        this.id = id;
        this.filename = filename;
        this.originalName = originalName;
        this.mimeType = mimeType;
        this.size = size;
        this.path = path;
        this.status = status;
        this.metadata = metadata;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}

// Prepared Statements
const insertStmt = db.prepare(`
    INSERT INTO evidence (id, filename, originalName, mimeType, size, path, status, metadata, createdAt, updatedAt)
    VALUES (@id, @filename, @originalName, @mimeType, @size, @path, @status, @metadata, @createdAt, @updatedAt)
`);

const updateStmt = db.prepare(`
    UPDATE evidence SET 
        status = @status, 
        metadata = @metadata, 
        updatedAt = @updatedAt 
    WHERE id = @id
`);

const getStmt = db.prepare('SELECT * FROM evidence WHERE id = ?');

const deleteStmt = db.prepare('DELETE FROM evidence WHERE id = ?');

const saveEvidence = async (evidence) => {
    // Check if exists
    const existing = getStmt.get(evidence.id);

    // Serialize objects
    const data = {
        ...evidence,
        metadata: JSON.stringify(evidence.metadata || {}),
        createdAt: evidence.createdAt.toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (existing) {
        updateStmt.run({
            id: data.id,
            status: data.status,
            metadata: data.metadata,
            updatedAt: data.updatedAt
        });
    } else {
        insertStmt.run(data);
    }
    return evidence;
};

const getEvidence = async (id) => {
    const row = getStmt.get(id);
    if (!row) return null;

    // Deserialize
    return new Evidence({
        ...row,
        metadata: JSON.parse(row.metadata),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
    });
};

const deleteEvidence = async (id) => {
    const evidence = await getEvidence(id);
    if (evidence) {
        try {
            await require('fs').promises.unlink(evidence.path);
        } catch (err) {
            // Ignore missing file
        }
        deleteStmt.run(id);
        return true;
    }
    return false;
};

module.exports = {
    Evidence,
    saveEvidence,
    getEvidence,
    deleteEvidence
};
