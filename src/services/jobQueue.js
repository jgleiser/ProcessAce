const { Queue, Worker } = require('bullmq');
const connection = require('../config/redis');
const logger = require('../logging/logger');
const { v4: uuidv4 } = require('uuid');
const { Job, saveJob, getJob, deleteJob } = require('../models/job');
const { getEvidence, saveEvidence } = require('../models/evidence');

class JobQueue {
  constructor(name) {
    this.name = name;
    this.queue = new Queue(name, { connection });
    this.workers = [];
  }

  async add(type, data, metadata = {}) {
    const jobId = uuidv4();

    // Derive Process Name if not provided
    let processName = data.processName;
    if (!processName && data.originalName) {
      processName = data.originalName.replace(/\.[^/.]+$/, ''); // strip extension
    }

    // 1. Persist to SQLite (Source of Truth for API)
    const jobRecord = new Job({
      id: jobId,
      type,
      data: { ...data, processName }, // Ensure data has processName
      user_id: metadata.userId,
      workspace_id: metadata.workspaceId,
      process_name: processName, // Persist to column
    });
    saveJob(jobRecord);

    // 2. Add to BullMQ
    await this.queue.add(
      type,
      { ...data, jobId },
      {
        jobId: jobId, // Use same ID
        removeOnComplete: 100, // Keep last 100 in Redis
        removeOnFail: 200,
      },
    );

    logger.info({ jobId, queue: this.name }, 'Job added to queue');
    return jobRecord;
  }

  async get(jobId) {
    return getJob(jobId);
  }

  async delete(jobId) {
    // Remove from SQLite
    const deleted = deleteJob(jobId);
    // Try remove from BullMQ (best effort)
    try {
      const bullJob = await this.queue.getJob(jobId);
      if (bullJob) await bullJob.remove();
    } catch (err) {
      logger.warn({ err, jobId }, 'Failed to remove job from Redis');
    }
    return deleted;
  }

  registerWorker(type, handler) {
    logger.info({ queue: this.name, type }, 'Registering worker');

    const worker = new Worker(
      this.name,
      async (bullJob) => {
        const { jobId } = bullJob.data;

        // Sync status start
        let jobRecord = getJob(jobId);
        if (jobRecord) {
          jobRecord.status = 'processing';
          saveJob(jobRecord);
        }

        try {
          // Execute Handler
          // Construct a job-like object compatible with old handler signature
          const jobContext = {
            id: jobId,
            data: bullJob.data,
            user_id: jobRecord?.user_id,
            workspace_id: jobRecord?.workspace_id,
          };
          const result = await handler(jobContext);

          // Sync success
          jobRecord = getJob(jobId);
          if (jobRecord) {
            jobRecord.status = 'completed';
            jobRecord.result = result;
            saveJob(jobRecord);

            // Sync Evidence Status
            if (jobRecord.data?.evidenceId) {
              const evidence = await getEvidence(jobRecord.data.evidenceId);
              if (evidence) {
                evidence.status = 'completed';
                await saveEvidence(evidence);
              }
            }
          }
          return result;
        } catch (err) {
          // Sync failure
          jobRecord = getJob(jobId);
          if (jobRecord) {
            jobRecord.status = 'failed';
            jobRecord.error = err.message;
            saveJob(jobRecord);

            // Sync Evidence Status
            if (jobRecord.data?.evidenceId) {
              const evidence = await getEvidence(jobRecord.data.evidenceId);
              if (evidence) {
                evidence.status = 'failed';
                await saveEvidence(evidence);
              }
            }
          }
          throw err;
        }
      },
      { connection },
    );

    this.workers.push(worker);

    worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err }, 'Worker failed');
    });
  }
}

module.exports = JobQueue;
