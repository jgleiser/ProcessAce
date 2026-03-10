const { z } = require('zod');

const VALID_NODE_TYPES = [
  'startEvent',
  'endEvent',
  'task',
  'userTask',
  'serviceTask',
  'exclusiveGateway',
  'parallelGateway',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
];

const BpmnNodeSchema = z.object({
  id: z.string().min(1, 'Node ID cannot be empty'),
  name: z.string(),
  type: z.enum(/** @type {[string, ...string[]]} */ (VALID_NODE_TYPES), {
    errorMap: (_issue, ctx) => ({
      message: `Invalid node type "${ctx.data}". Valid: ${VALID_NODE_TYPES.join(', ')}`,
    }),
  }),
});

const BpmnEdgeSchema = z.object({
  id: z.string().min(1, 'Edge ID cannot be empty'),
  sourceId: z.string().min(1, 'Source ID cannot be empty'),
  targetId: z.string().min(1, 'Target ID cannot be empty'),
});

const BpmnProcessSchema = z
  .object({
    processId: z.string().min(1, 'processId cannot be empty').default('Process_1'),
    processName: z.string().default(''),
    nodes: z.array(BpmnNodeSchema).min(1, 'Must contain at least one node'),
    edges: z.array(BpmnEdgeSchema),
  })
  .strict();

/**
 * @typedef {z.infer<typeof BpmnProcessSchema>} BpmnProcessData
 * @typedef {z.infer<typeof BpmnNodeSchema>} BpmnNodeData
 * @typedef {z.infer<typeof BpmnEdgeSchema>} BpmnEdgeData
 */

module.exports = {
  BpmnProcessSchema,
  BpmnNodeSchema,
  BpmnEdgeSchema,
  VALID_NODE_TYPES,
};
