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
const { getJobsByUserId, getJobsByUserAndWorkspace, getJob, saveJob } = require('../models/job');

// List all jobs for current user (optionally filtered by workspace)
router.get('/', async (req, res) => {
    try {
        const { workspaceId } = req.query;

        // If workspaceId is provided, filter by it; otherwise get all user's jobs
        const jobs = workspaceId
            ? getJobsByUserAndWorkspace(req.user.id, workspaceId)
            : getJobsByUserId(req.user.id);

        res.json(jobs.map(job => ({
            id: job.id,
            type: job.type,
            status: job.status,
            result: job.result,
            error: job.error,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            filename: job.data?.originalName || job.data?.filename || null,
            processName: job.process_name || job.data?.processName || null // Prefer column, fallback to data
        })));
    } catch (err) {
        req.log.error({ err }, 'Failed to list jobs');
        res.status(500).json({ error: 'Failed to list jobs' });
    }
});

router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const job = await evidenceQueue.get(id);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    // Authorization Check
    if (job.user_id && job.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
        id: job.id,
        type: job.type,
        status: job.status,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        processName: job.process_name || (job.data ? job.data.processName : null)
    });
});

// Update Job (e.g. processName)
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { processName } = req.body;

    try {
        const job = getJob(id); // Use model directly for synchronous DB access or use queue.get(id) if preferred (queue.get calls getJob)

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Authorization Check
        if (job.user_id && job.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Update fields
        if (processName !== undefined) {
            job.process_name = processName;
            // Also update data.processName for consistency if it exists there
            if (job.data) {
                job.data.processName = processName;
            }
        }

        saveJob(job);

        res.json({
            id: job.id,
            processName: job.process_name,
            updatedAt: job.updatedAt
        });

    } catch (err) {
        req.log.error({ err }, 'Failed to update job');
        res.status(500).json({ error: 'Failed to update job' });
    }
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const job = await evidenceQueue.get(id);

    if (job) {
        // Authorization Check
        if (job.user_id && job.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

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
