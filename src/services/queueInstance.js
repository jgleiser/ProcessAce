const JobQueue = require('./jobQueue');

// Create a single shared instance for the evidence queue
const evidenceQueue = new JobQueue('evidence-queue');

module.exports = {
  evidenceQueue,
};
