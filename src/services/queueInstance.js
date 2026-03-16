const JobQueue = require('./jobQueue');
const { processEvidence } = require('../workers/evidenceWorker');
const { processModelPull } = require('../workers/modelWorker');
const { transcribeEvidence } = require('../workers/transcriptionWorker');

// Create a single shared instance for the evidence queue
const evidenceQueue = new JobQueue('evidence-queue');
const modelQueue = new JobQueue('model-queue');

// Register handlers
evidenceQueue.registerWorker('process_evidence', processEvidence);
evidenceQueue.registerWorker('transcribe_evidence', transcribeEvidence);
modelQueue.registerWorker('model_pull', processModelPull);

module.exports = {
  evidenceQueue,
  modelQueue,
};
