const logger = require('../logging/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * reliable job queue abstraction.
 * In Phase 1, this is an in-memory stub.
 * In the future, this will wrap Bull/BullMQ.
 */
class JobQueue {
    constructor(name) {
        this.name = name;
        this.jobs = new Map(); // In-memory store
    }

    async add(type, data) {
        const jobId = uuidv4();
        const job = {
            id: jobId,
            type,
            data,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        this.jobs.set(jobId, job);
        logger.info({ job_id: jobId, queue: this.name, job_type: type }, 'Job queued');

        // Simulate processing for dev (optional, or left for workers)
        // this.process(jobId); 

        return job;
    }

    async get(jobId) {
        return this.jobs.get(jobId) || null;
    }

    async updateStatus(jobId, status, result = null, error = null) {
        const job = this.jobs.get(jobId);
        if (!job) return null;

        job.status = status;
        job.result = result;
        job.error = error;
        job.updatedAt = new Date();

        this.jobs.set(jobId, job);
        logger.info({ job_id: jobId, queue: this.name, status }, 'Job status updated');

        return job;
    }
}

// Singleton or factory could go here. For now, exporting the class.
module.exports = JobQueue;
