const { v4: uuidv4 } = require('uuid');

class Artifact {
    constructor({
        id = uuidv4(),
        type,
        version = 1,
        content,
        metadata = {},
        createdBy = 'system',
        createdAt = new Date(),
        previousVersionId = null,
        filename = null, // New field
    }) {
        this.id = id;
        this.type = type; // 'bpmn', 'sipoc', 'raci', 'doc'
        this.version = version;
        this.content = content;
        this.metadata = metadata;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
        this.previousVersionId = previousVersionId;
        this.filename = filename;
    }
}

const FileStore = require('../services/fileStore');

// Persistence
const store = new FileStore('artifacts.json');
const artifacts = store.load();

const saveArtifact = async (artifact) => {
    artifacts.set(artifact.id, artifact);
    store.save(artifacts);
    return artifact;
};

const getArtifact = async (id) => {
    return artifacts.get(id);
};

const deleteArtifact = async (id) => {
    const deleted = artifacts.delete(id);
    if (deleted) store.save(artifacts);
    return deleted;
};

module.exports = {
    Artifact,
    saveArtifact,
    getArtifact,
    deleteArtifact
};
