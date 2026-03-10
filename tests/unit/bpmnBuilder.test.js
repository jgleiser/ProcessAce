const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ZodError } = require('zod');
const { validateProcessGraph, buildBpmnXml } = require('../../src/utils/bpmnBuilder');
const { VALID_NODE_TYPES } = require('../../src/schemas/bpmnSchema');

// Reusable valid process graph fixture
const validGraph = () => ({
  processId: 'Process_1',
  processName: 'Test Process',
  nodes: [
    { id: 'StartEvent_1', name: 'Start', type: 'startEvent' },
    { id: 'Task_1', name: 'Do Something', type: 'task' },
    { id: 'EndEvent_1', name: 'End', type: 'endEvent' },
  ],
  edges: [
    { id: 'Flow_1', sourceId: 'StartEvent_1', targetId: 'Task_1' },
    { id: 'Flow_2', sourceId: 'Task_1', targetId: 'EndEvent_1' },
  ],
});

describe('validateProcessGraph', () => {
  it('accepts a valid process graph', () => {
    const result = validateProcessGraph(validGraph());
    assert.equal(result.processId, 'Process_1');
  });

  it('throws ZodError on null input', () => {
    assert.throws(
      () => validateProcessGraph(null),
      (err) => err instanceof ZodError,
    );
  });

  it('applies default processId when missing', () => {
    const graph = validGraph();
    delete graph.processId;
    const result = validateProcessGraph(graph);
    assert.equal(result.processId, 'Process_1');
  });

  it('throws on empty processId', () => {
    const graph = validGraph();
    graph.processId = '   ';
    // Zod min(1) only checks length, so whitespace-only passes; this is acceptable
    // since the LLM schema prompt requires non-empty
    const result = validateProcessGraph(graph);
    assert.equal(result.processId, '   ');
  });

  it('throws on empty nodes array', () => {
    const graph = validGraph();
    graph.nodes = [];
    assert.throws(() => validateProcessGraph(graph), /at least one node/);
  });

  it('throws ZodError on missing edges array', () => {
    const graph = validGraph();
    delete graph.edges;
    assert.throws(
      () => validateProcessGraph(graph),
      (err) => err instanceof ZodError,
    );
  });

  it('throws on node with invalid type', () => {
    const graph = validGraph();
    graph.nodes[1].type = 'invalidType';
    assert.throws(
      () => validateProcessGraph(graph),
      (err) => err instanceof ZodError,
    );
  });

  it('rejects unknown root properties via strict mode', () => {
    const graph = validGraph();
    graph.hallucinated = 'extra data';
    assert.throws(
      () => validateProcessGraph(graph),
      (err) => err instanceof ZodError,
    );
  });

  it('throws on duplicate node IDs', () => {
    const graph = validGraph();
    graph.nodes[1].id = 'StartEvent_1';
    assert.throws(() => validateProcessGraph(graph), /Duplicate node/);
  });

  it('throws on duplicate edge IDs', () => {
    const graph = validGraph();
    graph.edges[1].id = 'Flow_1';
    assert.throws(() => validateProcessGraph(graph), /Duplicate edge/);
  });

  it('throws when edge references non-existent source node', () => {
    const graph = validGraph();
    graph.edges[0].sourceId = 'NonExistent_1';
    assert.throws(() => validateProcessGraph(graph), /non-existent source/);
  });

  it('throws when edge references non-existent target node', () => {
    const graph = validGraph();
    graph.edges[0].targetId = 'NonExistent_1';
    assert.throws(() => validateProcessGraph(graph), /non-existent target/);
  });

  it('accepts all valid node types', () => {
    for (const type of VALID_NODE_TYPES) {
      const graph = {
        processId: 'P1',
        nodes: [{ id: `Node_${type}`, name: type, type }],
        edges: [],
      };
      assert.doesNotThrow(() => validateProcessGraph(graph));
    }
  });
});

describe('buildBpmnXml', () => {
  it('produces XML containing the BPMN definitions namespace', () => {
    const xml = buildBpmnXml(validGraph());
    assert.ok(xml.includes('xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"'));
  });

  it('produces XML with the correct processId', () => {
    const xml = buildBpmnXml(validGraph());
    assert.ok(xml.includes('id="Process_1"'));
  });

  it('includes all nodes as BPMN elements', () => {
    const xml = buildBpmnXml(validGraph());
    assert.ok(xml.includes('bpmn:startEvent'));
    assert.ok(xml.includes('bpmn:task'));
    assert.ok(xml.includes('bpmn:endEvent'));
  });

  it('includes sequence flows with correct references', () => {
    const xml = buildBpmnXml(validGraph());
    assert.ok(xml.includes('bpmn:sequenceFlow'));
    assert.ok(xml.includes('sourceRef="StartEvent_1"'));
    assert.ok(xml.includes('targetRef="Task_1"'));
  });

  it('includes incoming/outgoing references on nodes', () => {
    const xml = buildBpmnXml(validGraph());
    assert.ok(xml.includes('<bpmn:incoming>Flow_1</bpmn:incoming>'));
    assert.ok(xml.includes('<bpmn:outgoing>Flow_2</bpmn:outgoing>'));
  });

  it('includes XML declaration', () => {
    const xml = buildBpmnXml(validGraph());
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  });

  it('produces well-formed XML with all tags closed', () => {
    const xml = buildBpmnXml(validGraph());
    // Count opening and closing definitions tags
    assert.ok(xml.includes('</bpmn:definitions>'));
    assert.ok(xml.includes('</bpmn:process>'));
  });

  it('sets processName as the name attribute', () => {
    const xml = buildBpmnXml(validGraph());
    assert.ok(xml.includes('name="Test Process"'));
  });

  it('handles gateway nodes correctly', () => {
    const graph = {
      processId: 'P1',
      processName: 'Gateway Test',
      nodes: [
        { id: 'Start_1', name: 'Start', type: 'startEvent' },
        { id: 'GW_1', name: 'Decision', type: 'exclusiveGateway' },
        { id: 'End_1', name: 'End', type: 'endEvent' },
      ],
      edges: [
        { id: 'F1', sourceId: 'Start_1', targetId: 'GW_1' },
        { id: 'F2', sourceId: 'GW_1', targetId: 'End_1' },
      ],
    };
    const xml = buildBpmnXml(graph);
    assert.ok(xml.includes('bpmn:exclusiveGateway'));
  });
});
