const logger = require('../logging/logger');
const { getLlmProvider } = require('../llm');

const processEvidence = async (job) => {
    const { evidenceId, filename } = job.data;

    logger.info({ jobId: job.id, evidenceId }, 'Starting evidence processing');

    try {
        const llm = getLlmProvider();
        const prompt = `I am processing a file named "${filename}". Please verify you are working by replying with "Confirmed, I see ${filename}".`;

        // Simulate some work time still (optional, mainly to see the status change)
        // await new Promise(resolve => setTimeout(resolve, 1000));

        const response = await llm.complete(prompt, 'You are a helpful assistant for ProcessAce.');

        logger.info({ jobId: job.id, evidenceId, llmResponse: response }, 'Evidence processing completed');

        return { success: true, evidenceId, llmResponse: response };
    } catch (err) {
        logger.error({ jobId: job.id, err }, 'Processing failed');
        throw err;
    }
};

module.exports = {
    processEvidence
};
