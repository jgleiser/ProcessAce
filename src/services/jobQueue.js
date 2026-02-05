const logger = require('../logging/logger');
const { v4: uuidv4 } = require('uuid');
const FileStore = require('./fileStore');

/**
 * reliable job queue abstraction.
 * In Phase 1, this is an in-memory stub with File persistence.
 * In the future, this will wrap Bull/BullMQ.
 */
class JobQueue {
    constructor(name) {
        this.name = name;
        this.store = new FileStore(`jobs-${name}.json`);
        this.jobs = this.store.load();
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
        this.store.save(this.jobs);
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
        this.store.save(this.jobs);
        logger.info({ job_id: jobId, queue: this.name, status }, 'Job status updated');

        return job;
    }

    async delete(jobId) {
        const deleted = this.jobs.delete(jobId);
        if (deleted) {
            this.store.save(this.jobs);
            logger.info({ job_id: jobId, queue: this.name }, 'Job deleted');
        }
        return deleted;
    }

    registerWorker(type, handler) {
        logger.info({ queue: this.name, job_type: type }, 'Worker registered');

        // In a real Redis queue, we would set up a process handler here.
        // For in-memory, we'll hook into the `add` method or poll.
        // simpler for now: just override `add` to trigger handler next tick.

        const originalAdd = this.add.bind(this);
        this.add = async (jobType, data) => {
            const job = await originalAdd(jobType, data);

            if (jobType === type) {
                // Run async without awaiting to not block the API response
                setImmediate(async () => {
                    try {
                        await this.updateStatus(job.id, 'processing');
                        const result = await handler(job);
                        await this.updateStatus(job.id, 'completed', result);
                    } catch (err) {
                        logger.error({ err, job_id: job.id }, 'Job processing failed');
                        await this.updateStatus(job.id, 'failed', null, err.message);
                    }
                });
            }
            return job;
        };
    }
}

// Singleton or factory could go here. For now, exporting the class.
module.exports = JobQueue;
