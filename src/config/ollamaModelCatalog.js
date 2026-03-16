const catalog = [
  {
    id: 'llama3.2',
    label: 'Llama 3.2',
    description: 'Fast general-purpose local model',
    sizeLabel: '3 GB',
    recommended: true,
  },
  {
    id: 'qwen2.5:7b',
    label: 'Qwen 2.5 7B',
    description: 'Strong structured output and JSON generation',
    sizeLabel: '4.5 GB',
    recommended: true,
  },
  {
    id: 'qwen3:4b',
    label: 'Qwen 3 4B',
    description: 'Compact reasoning model with strong multilingual output',
    sizeLabel: '2.6 GB',
    recommended: true,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    description: 'Balanced reasoning and speed',
    sizeLabel: '4 GB',
    recommended: false,
  },
  {
    id: 'phi3:mini',
    label: 'Phi-3 Mini',
    description: 'Smaller model for quick local validation',
    sizeLabel: '2.2 GB',
    recommended: false,
  },
];

module.exports = catalog;
