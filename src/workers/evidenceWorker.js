const fs = require('fs').promises;
const logger = require('../logging/logger');
const { getLlmProvider } = require('../llm');
const { saveArtifact, Artifact } = require('../models/artifact');
const { getEvidence } = require('../models/evidence');

const processEvidence = async (job) => {
    const { evidenceId, filename } = job.data;
    logger.info({ jobId: job.id, evidenceId }, 'Starting BPMN generation');

    try {
        // 1. Retrieve Evidence record to get the full path
        const evidence = await getEvidence(evidenceId);
        if (!evidence) {
            throw new Error(`Evidence not found: ${evidenceId}`);
        }

        // 2. Read file content
        const fileContent = await fs.readFile(evidence.path, 'utf8');

        // 3. Prepare Prompt
        const llm = getLlmProvider();
        const systemPrompt = `You are an expert Business Process Management (BPM) analyst. 
Your goal is to convert unstructured process descriptions into valid BPMN 2.0 XML.
- You MUST output ONLY valid XML. 
- Do not include markdown code blocks. 
- Do not include conversational text.
- Standard BPMN 2.0 definitions.`;

        const userPrompt = `Generate a BPMN 2.0 XML diagram for the following process description:
\n\n${fileContent}`;

        // 4. Call LLM
        const xmlResponse = await llm.complete(userPrompt, systemPrompt);

        // 5. Clean / Validate (Basic check)
        let cleanedXml = xmlResponse.trim();
        // Remove markdown blocks if present despite instructions
        if (cleanedXml.startsWith('```xml')) {
            cleanedXml = cleanedXml.replace(/^```xml\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedXml.startsWith('```')) {
            cleanedXml = cleanedXml.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        // 6. Save Artifact
        const artifact = new Artifact({
            type: 'bpmn',
            content: cleanedXml,
            metadata: {
                sourceEvidenceId: evidenceId,
                jobId: job.id,
                generatedByModel: llm.config?.model
            }
        });
        await saveArtifact(artifact);

        logger.info({ jobId: job.id, evidenceId, artifactId: artifact.id }, 'BPMN Artifact generated');

        // Return result including the artifact ID so the UI can fetch it
        return {
            success: true,
            evidenceId,
            artifactId: artifact.id
        };

    } catch (err) {
        logger.error({ jobId: job.id, err }, 'BPMN generation failed');
        throw err;
    }
};

module.exports = {
    processEvidence
};
