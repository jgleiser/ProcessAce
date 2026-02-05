const express = require('express');
const router = express.Router();
// We need access to the same queue instance.
// In a real app this would be imported from a shared module/singleton.
// For now, we'll try to get it from the evidence route (hacky) or
// better: create the queue instance in a shared file (but it is currently created in evidence.js).
// Let's refactor slightly to export the queue instance from a shared place?
// Or, efficiently, since JobQueue is just an abstraction, we can re-instantiate it IF it was backed by Redis.
// BUT since it is in-memory for Phase 1/2, verify implementation details.
// src/services/jobQueue.js creates a `new Map()`. So new instance = empty map.
// WE MUST SHARE THE INSTANCE.

// FIX: We need to move the queue instantiation to a shared module.
// We will fix this by creating src/services/queueInstance.js 
// But first, let's write this router assuming we can import `queue`.

const { evidenceQueue } = require('../services/queueInstance');

const { deleteEvidence } = require('../models/evidence');
const { deleteArtifact } = require('../models/artifact');

router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const job = await evidenceQueue.get(id);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
        id: job.id,
        type: job.type,
        status: job.status,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        processName: job.data ? job.data.processName : null
    });
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const job = await evidenceQueue.get(id);

    if (job) {
        // Cascade delete
        if (job.data && job.data.evidenceId) {
            await deleteEvidence(job.data.evidenceId);
        }
        if (job.result) {
            // Delete singular artifact (backward compat)
            if (job.result.artifactId) {
                await deleteArtifact(job.result.artifactId);
            }
            // Delete multiple artifacts (Phase 7)
            if (job.result.artifacts && Array.isArray(job.result.artifacts)) {
                for (const artifact of job.result.artifacts) {
                    await deleteArtifact(artifact.id);
                }
            }
        }
        await evidenceQueue.delete(id);
    }

    // Always return success to allow frontend to clean up local storage even if job was already gone (404)
    res.status(200).json({ success: true });
});

module.exports = router;
