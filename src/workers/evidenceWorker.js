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
        const systemPrompt = `You are an expert BPMN 2.0 Architect.
Convert the process description into valid BPMN 2.0 XML with a PROFESSIONAL VISUAL LAYOUT.

### 1. NAMESPACE & SYNTAX (STRICT)
You must use EXACTLY these prefixes. Do NOT use "omgdi".
- xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
- xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
- xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
- xmlns:di="http://www.omg.org/spec/DD/20100524/DI"

### 2. ID RULES (CRITICAL - NO DUPLICATES)
- Every ID in the file must be GLOBALLY UNIQUE.
- **SequenceFlow ID**: e.g., "Flow_1"
- **BPMNEdge ID**: MUST be different! Use prefix "Edge_". e.g., "Edge_Flow_1"
- **Shape ID**: Use prefix "Shape_". e.g., "Shape_Task_1"

CORRECT EDGE SYNTAX:
<bpmndi:BPMNEdge id="Edge_Flow_1" bpmnElement="Flow_1">
  <di:waypoint x="100" y="300"/>
  <di:waypoint x="200" y="300"/>
</bpmndi:BPMNEdge>

### 3. VISUAL LAYOUT ALGORITHM
- **Grid System**: 
  - Standard Width: ~180px per step.
  - "Happy Path" (Main Flow): Y = 300 (Center).
  - "Exception/Alternative Path": Y = 120 (Upper) OR Y = 480 (Lower).
  
- **Gateway Branching**:
  - IF Gateway splits:
    - Path A (End/Error): Move UP to Y=120.
    - Path B (Success): Continue STRAIGHT at Y=300.
  
- **Edges (Manhattan Routing)**:
  - Straight: (x1, 300) -> (x2, 300)
  - Branch UP:
    1. (x_gate, 300)
    2. (x_gate, 120)  [Vertical]
    3. (x_target, 120) [Horizontal]

### 4. ELEMENT CALCULATIONS (Center Y=300)
- Task (Height 80): y="260" (300-40)
- Gateway (Height 50): y="275" (300-25)
- Event (Height 36): y="282" (300-18)

### 5. OUTPUT FORMAT
Return *only* the XML string. No markdown code blocks.`;

        const userPrompt = `Generate a BPMN 2.0 XML diagram for the following process description:
\n\n${fileContent}`;

        // 4. Call LLM
        const xmlResponse = await llm.complete(userPrompt, systemPrompt);

        // 5. Clean / Validate
        let cleanedXml = xmlResponse.trim();
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
                generatedByModel: llm.config?.model,
                layoutMethod: 'llm-generated'
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
