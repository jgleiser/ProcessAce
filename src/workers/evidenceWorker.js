const fs = require('fs').promises;
const logger = require('../logging/logger');
const { getLlmProvider } = require('../llm');
const { saveArtifact, Artifact } = require('../models/artifact');
const { getEvidence } = require('../models/evidence');
const settingsService = require('../services/settingsService');
const { buildBpmnWithLayout, validateProcessGraph } = require('../utils/bpmnBuilder');
const { ZodError } = require('zod');

// Appended to every system prompt so artifacts match the source language
const LANGUAGE_INSTRUCTION =
  '\n\n### LANGUAGE RULE (MANDATORY)\n' +
  'Detect the language of the input process description. ' +
  'ALL text content you generate (labels, descriptions, role names, headings, etc.) ' +
  'MUST be written in that same language. ' +
  'Do NOT translate to English unless the source is already in English.';

const processEvidence = async (job) => {
  const { evidenceId, filename, processName, provider, model } = job.data;
  logger.info({ jobId: job.id, evidenceId, provider, model }, 'Starting BPMN generation');

  // Naming Logic
  let baseName = processName || filename.replace(/\.[^/.]+$/, '');

  // Normalize: remove accents, lowercase, replace non-alphanum with _, dedupe _
  const normalizedName = baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, ''); // trim underscores

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
      baseURL: llmConfig.baseUrl,
    });

    const bpmnPrompt = `You are an expert business process analyst.
Analyze the provided evidence and generate a process flow as a structured JSON graph.
You MUST output ONLY valid JSON matching the following schema. Do NOT include markdown formatting, XML, or any wrapper text.

### JSON SCHEMA
{
  "processId": "Process_1",
  "processName": "Descriptive Process Name",
  "nodes": [
    {
      "id": "String (Unique, e.g., 'StartEvent_1', 'Task_2', 'Gateway_1')",
      "name": "String (Human-readable label)",
      "type": "startEvent | task | userTask | serviceTask | exclusiveGateway | parallelGateway | endEvent"
    }
  ],
  "edges": [
    {
      "id": "String (Unique, e.g., 'Flow_1')",
      "sourceId": "String (ID of source node)",
      "targetId": "String (ID of target node)"
    }
  ]
}

### RULES
1. The graph MUST start with exactly one startEvent and end with at least one endEvent.
2. Every node must be connected via edges — no orphan nodes.
3. Every edge must reference existing node IDs in sourceId and targetId.
4. All IDs must be globally unique across nodes and edges.
5. Use exclusiveGateway for decision points and parallelGateway for parallel execution.
6. Return ONLY the JSON object. No extra text.${LANGUAGE_INSTRUCTION}`;

    const sipocPrompt = `You are a Six Sigma Process Expert.
Generate a structured SIPOC table (Suppliers, Inputs, Process, Outputs, Customers) for the given process description.
Output Format: JSON Array with keys: "supplier", "input", "process_step", "output", "customer".
Example:
[
  { "supplier": "Sales", "input": "Order Form", "process_step": "Validate Order", "output": "Validated Order", "customer": "Warehouse" }
]
Return ONLY Valid JSON.${LANGUAGE_INSTRUCTION}`;

    const raciPrompt = `You are a Project Management Pro.
Generate a RACI Matrix (Responsible, Accountable, Consulted, Informed) for the activities in the process.
Output Format: JSON Array with keys: "activity", "responsible", "accountable", "consulted", "informed".
Example:
[
  { "activity": "Validate Order", "responsible": "Sales Rep", "accountable": "Sales Manager", "consulted": "IT", "informed": "Customer" }
]
Return ONLY Valid JSON.${LANGUAGE_INSTRUCTION}`;

    const docPrompt = `You are a Technical Writer.
Create a Professional Narrative Process Document in Markdown format.
Include:
- **Process Overview**: Goal and Scope.
- **Key Roles**: Who is involved.
- **Step-by-Step Procedure**: Detailed flow.
- **Exceptions**: How to handle errors.
- **Business Rules**: Critical constraints.
Return ONLY Markdown content.${LANGUAGE_INSTRUCTION}`;
    // Determine provider name for traceability
    const providerName = (provider || llmConfig.provider || 'openai').toLowerCase();
    const modelName = llm.config?.model || model || llmConfig.model;

    // Helper to generate and save non-BPMN artifacts (SIPOC, RACI, doc)
    const generateAndSave = async (type, systemPrompt, prompt, extension, suffix) => {
      const response = await llm.complete(prompt, systemPrompt, {
        use_case: `${type}_generation`,
        jobId: job.id,
      });
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
          extension,
        },
        user_id: job.user_id,
        workspace_id: job.workspace_id,
        llm_provider: providerName,
        llm_model: modelName,
      });
      await saveArtifact(artifact);
      logger.info(
        {
          event_type: 'artifact_generated',
          artifact_id: artifact.id,
          artifact_type: type,
          jobId: job.id,
        },
        `Generated ${type} artifact`,
      );
      return artifact;
    };

    // Dedicated BPMN generation with self-healing retry loop
    const generateBpmn = async () => {
      const MAX_RETRIES = 3;
      let attempt = 0;
      let currentUserPrompt = `Analyze this process and generate the JSON process graph:\n\n${fileContent}`;

      // define the schema so the SDK enforces it
      const bpmnJsonSchema = {
        type: 'OBJECT',
        properties: {
          processId: { type: 'STRING' },
          processName: { type: 'STRING' },
          nodes: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING' },
                name: { type: 'STRING' },
                type: { type: 'STRING' },
              },
              required: ['id', 'name', 'type'],
            },
          },
          edges: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING' },
                sourceId: { type: 'STRING' },
                targetId: { type: 'STRING' },
              },
              required: ['id', 'sourceId', 'targetId'],
            },
          },
        },
        required: ['processId', 'processName', 'nodes', 'edges'],
      };

      while (attempt < MAX_RETRIES) {
        attempt++;
        logger.info(
          { jobId: job.id, attempt, maxRetries: MAX_RETRIES },
          `BPMN generation attempt ${attempt}/${MAX_RETRIES}`,
        );

        const rawResponse = await llm.complete(currentUserPrompt, bpmnPrompt, {
          use_case: 'bpmn_generation',
          jobId: job.id,
          responseFormat: 'json',
          schema: bpmnJsonSchema,
        });

        // Phase 1: JSON syntax check
        let rawJson;
        try {
          rawJson = JSON.parse(rawResponse.trim());
        } catch {
          logger.warn(
            {
              event_type: 'bpmn_self_heal',
              jobId: job.id,
              attempt,
              error_type: 'json_syntax',
              response_preview: rawResponse.substring(0, 500),
            },
            'LLM returned invalid JSON syntax. Triggering self-healing...',
          );

          if (attempt === MAX_RETRIES) {
            throw new Error(`Failed to get valid JSON after ${MAX_RETRIES} attempts.`);
          }

          currentUserPrompt +=
            '\n\nSystem Error: Your previous response was not valid JSON. ' +
            'Ensure there are no trailing commas or missing quotes. ' +
            'Output ONLY valid JSON matching the schema.';
          continue;
        }

        // Phase 2: Zod schema validation + cross-reference checks
        try {
          const safeData = validateProcessGraph(rawJson);

          // Phase 3: Deterministic XML + auto-layout
          const validBpmnXml = await buildBpmnWithLayout(safeData);

          const artifactFilename = `${normalizedName}_diagram.bpmn`;
          const artifact = new Artifact({
            type: 'bpmn',
            content: validBpmnXml,
            filename: artifactFilename,
            metadata: {
              sourceEvidenceId: evidenceId,
              jobId: job.id,
              extension: 'bpmn',
              generationMethod: 'json_to_xml',
              healingAttempts: attempt,
            },
            user_id: job.user_id,
            workspace_id: job.workspace_id,
            llm_provider: providerName,
            llm_model: modelName,
          });
          await saveArtifact(artifact);
          logger.info(
            {
              event_type: 'artifact_generated',
              artifact_id: artifact.id,
              artifact_type: 'bpmn',
              jobId: job.id,
              generation_method: 'json_to_xml',
              attempts: attempt,
            },
            'Generated BPMN artifact via deterministic JSON-to-XML pipeline',
          );
          return artifact;
        } catch (validationError) {
          // Extract structured error messages for the LLM
          let errorFeedback;

          if (validationError instanceof ZodError) {
            const issues = validationError.issues
              .map((issue) => `Path '${issue.path.join('.')}' - ${issue.message}`)
              .join('\n');
            errorFeedback =
              'Your previous JSON output failed schema validation:\n' +
              issues +
              '\n\nPlease correct these specific fields and return the updated JSON.';
          } else {
            errorFeedback =
              `Your previous JSON had a structural error: ${validationError.message}\n` +
              'Please fix this and return the corrected JSON.';
          }

          logger.warn(
            {
              event_type: 'bpmn_self_heal',
              jobId: job.id,
              attempt,
              error_type: validationError instanceof ZodError ? 'schema' : 'reference',
              error_message: validationError.message,
            },
            'BPMN schema violation. Triggering self-healing...',
          );

          if (attempt === MAX_RETRIES) {
            throw new Error(
              `Failed to generate valid BPMN after ${MAX_RETRIES} attempts. ` +
                `Last error: ${validationError.message}`,
            );
          }

          currentUserPrompt += `\n\nSystem Error: ${errorFeedback}`;
        }
      }
    };

    // 4. Generate All Artifacts in Parallel
    const [bpmnArtifact, sipocArtifact, raciArtifact, docArtifact] = await Promise.all([
      generateBpmn(),
      generateAndSave(
        'sipoc',
        sipocPrompt,
        `Generate SIPOC JSON:\n\n${fileContent}`,
        'json',
        'sipoc',
      ),
      generateAndSave('raci', raciPrompt, `Generate RACI JSON:\n\n${fileContent}`, 'json', 'raci'),
      generateAndSave(
        'doc',
        docPrompt,
        `Generate Process Documentation:\n\n${fileContent}`,
        'md',
        'document',
      ),
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
        { type: 'doc', id: docArtifact.id, format: 'md' },
      ],
    };
  } catch (err) {
    logger.error({ jobId: job.id, err }, 'Artifact generation failed');
    throw err;
  }
};

module.exports = {
  processEvidence,
};
