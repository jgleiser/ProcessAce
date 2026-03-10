const { create } = require('xmlbuilder2');

const VALID_NODE_TYPES = new Set([
  'startEvent',
  'endEvent',
  'task',
  'userTask',
  'serviceTask',
  'exclusiveGateway',
  'parallelGateway',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
]);

/**
 * Validates the structural integrity of a process graph from the LLM.
 * Throws descriptive errors when the graph is malformed.
 *
 * @param {object} data - Parsed JSON process graph.
 * @returns {object} The validated data (pass-through).
 */
function validateProcessGraph(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Process graph must be a non-null object.');
  }

  if (typeof data.processId !== 'string' || data.processId.trim() === '') {
    throw new Error('Process graph must have a non-empty string "processId".');
  }

  if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
    throw new Error('Process graph must have a non-empty "nodes" array.');
  }

  if (!Array.isArray(data.edges)) {
    throw new Error('Process graph must have an "edges" array.');
  }

  const nodeIds = new Set();
  for (const node of data.nodes) {
    if (typeof node.id !== 'string' || node.id.trim() === '') {
      throw new Error(`Node must have a non-empty string "id". Found: ${JSON.stringify(node)}`);
    }
    if (typeof node.type !== 'string' || !VALID_NODE_TYPES.has(node.type)) {
      throw new Error(
        `Node "${node.id}" has invalid type "${node.type}". ` +
          `Valid types: ${[...VALID_NODE_TYPES].join(', ')}`,
      );
    }
    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate node ID: "${node.id}".`);
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set();
  for (const edge of data.edges) {
    if (typeof edge.id !== 'string' || edge.id.trim() === '') {
      throw new Error(`Edge must have a non-empty string "id". Found: ${JSON.stringify(edge)}`);
    }
    if (edgeIds.has(edge.id)) {
      throw new Error(`Duplicate edge ID: "${edge.id}".`);
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.sourceId)) {
      throw new Error(`Edge "${edge.id}" references non-existent source node "${edge.sourceId}".`);
    }
    if (!nodeIds.has(edge.targetId)) {
      throw new Error(`Edge "${edge.id}" references non-existent target node "${edge.targetId}".`);
    }
  }

  return data;
}

/**
 * Deterministically builds a BPMN 2.0 XML string (without DI) from a validated
 * process graph. The output is passed through bpmn-auto-layout separately to
 * add diagram coordinates.
 *
 * @param {object} processData - Validated process graph.
 * @returns {string} BPMN 2.0 XML string without diagram information.
 */
function buildBpmnXml(processData) {
  const doc = create({ version: '1.0', encoding: 'UTF-8' });

  const definitions = doc.ele('bpmn:definitions', {
    'xmlns:bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL',
    'xmlns:bpmndi': 'http://www.omg.org/spec/BPMN/20100524/DI',
    'xmlns:dc': 'http://www.omg.org/spec/DD/20100524/DC',
    'xmlns:di': 'http://www.omg.org/spec/DD/20100524/DI',
    id: 'Definitions_1',
    targetNamespace: 'http://bpmn.io/schema/bpmn',
  });

  const process = definitions.ele('bpmn:process', {
    id: processData.processId,
    name: processData.processName || '',
    isExecutable: 'true',
  });

  // Build a lookup for incoming/outgoing references per node
  const incomingByNode = new Map();
  const outgoingByNode = new Map();
  for (const edge of processData.edges) {
    if (!outgoingByNode.has(edge.sourceId)) outgoingByNode.set(edge.sourceId, []);
    outgoingByNode.get(edge.sourceId).push(edge.id);

    if (!incomingByNode.has(edge.targetId)) incomingByNode.set(edge.targetId, []);
    incomingByNode.get(edge.targetId).push(edge.id);
  }

  // Inject nodes with incoming/outgoing references (required by BPMN spec)
  for (const node of processData.nodes) {
    const el = process.ele(`bpmn:${node.type}`, {
      id: node.id,
      name: node.name || '',
    });

    const incoming = incomingByNode.get(node.id) || [];
    for (const flowId of incoming) {
      el.ele('bpmn:incoming').txt(flowId).up();
    }

    const outgoing = outgoingByNode.get(node.id) || [];
    for (const flowId of outgoing) {
      el.ele('bpmn:outgoing').txt(flowId).up();
    }

    el.up();
  }

  // Inject sequence flows
  for (const edge of processData.edges) {
    process
      .ele('bpmn:sequenceFlow', {
        id: edge.id,
        sourceRef: edge.sourceId,
        targetRef: edge.targetId,
      })
      .up();
  }

  return doc.end({ prettyPrint: true });
}

/**
 * Full pipeline: validate → build XML → auto-layout with DI coordinates.
 * Returns syntactically valid, laid-out BPMN 2.0 XML.
 *
 * @param {object} processData - Raw parsed JSON from the LLM.
 * @returns {Promise<string>} Laid-out BPMN XML string.
 */
async function buildBpmnWithLayout(processData) {
  validateProcessGraph(processData);
  const rawXml = buildBpmnXml(processData);

  // bpmn-auto-layout is ESM-only, so we use dynamic import
  const { layoutProcess } = await import('bpmn-auto-layout');
  const layoutXml = await layoutProcess(rawXml);

  return layoutXml;
}

module.exports = {
  validateProcessGraph,
  buildBpmnXml,
  buildBpmnWithLayout,
  VALID_NODE_TYPES,
};
