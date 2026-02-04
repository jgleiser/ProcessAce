const { v4: uuidv4 } = require('uuid');

class Evidence {
    constructor({
        id = uuidv4(),
        filename,
        originalName,
        mimeType,
        size,
        path,
        status = 'pending', // pending, processing, processed, error
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

// In-memory store
const evidenceStore = new Map();

const saveEvidence = async (evidence) => {
    evidenceStore.set(evidence.id, evidence);
    return evidence;
};

const getEvidence = async (id) => {
    return evidenceStore.get(id);
};

module.exports = {
    Evidence,
    saveEvidence,
    getEvidence
};
