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
    }) {
        this.id = id;
        this.type = type; // 'bpmn', 'sipoc', 'raci', 'doc'
        this.version = version;
        this.content = content;
        this.metadata = metadata;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
        this.previousVersionId = previousVersionId;
    }
}

// In-memory store for Phase 1
const artifacts = new Map();

const saveArtifact = async (artifact) => {
    artifacts.set(artifact.id, artifact);
    return artifact;
};

const getArtifact = async (id) => {
    return artifacts.get(id);
};

module.exports = {
    Artifact,
    saveArtifact,
    getArtifact
};
