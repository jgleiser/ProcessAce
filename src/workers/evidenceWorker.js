const fs = require('fs').promises;
const logger = require('../logging/logger');
const { getLlmProvider } = require('../llm');
const { saveArtifact, Artifact } = require('../models/artifact');
const { getEvidence } = require('../models/evidence');
const settingsService = require('../services/settingsService');


const processEvidence = async (job) => {
    const { evidenceId, filename, processName, provider, model } = job.data;
    logger.info({ jobId: job.id, evidenceId, provider, model }, 'Starting BPMN generation');

    // Naming Logic
    let baseName = processName || filename.replace(/\.[^/.]+$/, "");

    // Normalize: remove accents, lowercase, replace non-alphanum with _, dedupe _
    const normalizedName = baseName
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, ""); // trim underscores

    logger.info({ jobId: job.id, normalizedName }, 'Using normalized process name');

    try {
        // 1. Retrieve Evidence record to get the full path
        const evidence = await getEvidence(evidenceId);
        if (!evidence) {
            throw new Error(`Evidence not found: ${evidenceId}`);
        }

        // 2. Read file content
        const fileContent = await fs.readFile(evidence.path, 'utf8');

        // 3. Get LLM config from settings (apiKey is stored encrypted in DB)
        const llmConfig = settingsService.getLLMConfig();
        const llm = getLlmProvider({
            provider: provider || llmConfig.provider,
            model: model || llmConfig.model,
            apiKey: llmConfig.apiKey,
            baseURL: llmConfig.baseUrl
        });

        const bpmnPrompt = `You are an expert BPMN 2.0 Architect.
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

        const sipocPrompt = `You are a Six Sigma Process Expert.
Generate a structured SIPOC table (Suppliers, Inputs, Process, Outputs, Customers) for the given process description.
Output Format: JSON Array with keys: "supplier", "input", "process_step", "output", "customer".
Example:
[
  { "supplier": "Sales", "input": "Order Form", "process_step": "Validate Order", "output": "Validated Order", "customer": "Warehouse" }
]
Return ONLY Valid JSON.`;

        const raciPrompt = `You are a Project Management Pro.
Generate a RACI Matrix (Responsible, Accountable, Consulted, Informed) for the activities in the process.
Output Format: JSON Array with keys: "activity", "responsible", "accountable", "consulted", "informed".
Example:
[
  { "activity": "Validate Order", "responsible": "Sales Rep", "accountable": "Sales Manager", "consulted": "IT", "informed": "Customer" }
]
Return ONLY Valid JSON.`;

        const docPrompt = `You are a Technical Writer.
Create a Professional Narrative Process Document in Markdown format.
Include:
- **Process Overview**: Goal and Scope.
- **Key Roles**: Who is involved.
- **Step-by-Step Procedure**: Detailed flow.
- **Exceptions**: How to handle errors.
- **Business Rules**: Critical constraints.
Return ONLY Markdown content.`;

        const userPrompt = `Analyze the following process description:\n\n${fileContent}`;

        // Helper to generate and save
        const generateAndSave = async (type, systemPrompt, prompt, extension, suffix) => {
            const response = await llm.complete(prompt, systemPrompt);
            let content = response.trim();
            // Basic Cleanup
            if (content.startsWith('```')) {
                content = content.replace(/^```[a-z]*\s*/, '').replace(/\s*```$/, '');
            }

            const artifactFilename = `${normalizedName}_${suffix}.${extension}`;

            const artifact = new Artifact({
                type,
                content,
                filename: artifactFilename,
                metadata: {
                    sourceEvidenceId: evidenceId,
                    jobId: job.id,
                    generatedByModel: llm.config?.model,
                    extension
                },
                user_id: job.user_id,
                workspace_id: job.workspace_id
            });
            await saveArtifact(artifact);
            return artifact;
        };

        // 4. Generate All Artifacts in Parallel
        const [bpmnArtifact, sipocArtifact, raciArtifact, docArtifact] = await Promise.all([
            generateAndSave('bpmn', bpmnPrompt, `Generate BPMN XML:\n\n${fileContent}`, 'bpmn', 'diagram'),
            generateAndSave('sipoc', sipocPrompt, `Generate SIPOC JSON:\n\n${fileContent}`, 'json', 'sipoc'),
            generateAndSave('raci', raciPrompt, `Generate RACI JSON:\n\n${fileContent}`, 'json', 'raci'),
            generateAndSave('doc', docPrompt, `Generate Process Documentation:\n\n${fileContent}`, 'md', 'document')
        ]);

        logger.info({ jobId: job.id, evidenceId }, 'All artifacts generated successfully');

        // Return all artifacts
        return {
            success: true,
            evidenceId,
            artifactId: bpmnArtifact.id, // Keep for backward compat
            artifacts: [
                { type: 'bpmn', id: bpmnArtifact.id, format: 'xml' },
                { type: 'sipoc', id: sipocArtifact.id, format: 'json' },
                { type: 'raci', id: raciArtifact.id, format: 'json' },
                { type: 'doc', id: docArtifact.id, format: 'md' }
            ]
        };

    } catch (err) {
        logger.error({ jobId: job.id, err }, 'Artifact generation failed');
        throw err;
    }
};

module.exports = {
    processEvidence
};
