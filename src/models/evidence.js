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

const FileStore = require('../services/fileStore');

// Persistence
const store = new FileStore('evidence.json');
const evidenceStore = store.load();

const saveEvidence = async (evidence) => {
    evidenceStore.set(evidence.id, evidence);
    store.save(evidenceStore);
    return evidence;
};

const getEvidence = async (id) => {
    return evidenceStore.get(id);
};

const deleteEvidence = async (id) => {
    const evidence = evidenceStore.get(id);
    if (evidence) {
        try {
            await require('fs').promises.unlink(evidence.path);
        } catch (err) {
            // Ignore if file missing or already deleted
        }
        evidenceStore.delete(id);
        store.save(evidenceStore);
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
