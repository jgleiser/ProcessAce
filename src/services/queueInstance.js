const JobQueue = require('./jobQueue');
const { processEvidence } = require('../workers/evidenceWorker');
const { transcribeEvidence } = require('../workers/transcriptionWorker');

// Create a single shared instance for the evidence queue
const evidenceQueue = new JobQueue('evidence-queue');

// Register handlers
evidenceQueue.registerWorker('process_evidence', processEvidence);
evidenceQueue.registerWorker('transcribe_evidence', transcribeEvidence);

module.exports = {
  evidenceQueue,
};
