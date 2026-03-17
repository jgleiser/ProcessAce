const catalog = [
  {
    id: 'dimavz/whisper-tiny',
    label: 'Whisper Tiny',
    description: 'Lightweight local transcription model for quick drafts and low-resource systems',
    sizeLabel: '637 MB',
    parameterSize: '39M',
    languageCapabilities: 'Multilingual',
    hardwareRequirements: {
      ram: '4 GB minimum, 8 GB recommended',
      cpu: 'Modern 4-core CPU',
      gpu: 'Optional. Runs well on CPU-only systems',
    },
    recommended: true,
  },
  {
    id: 'karanchopda333/whisper',
    label: 'Whisper',
    description: 'Balanced local Whisper variant for general audio transcription',
    sizeLabel: '1.5 GB',
    languageCapabilities: 'Multilingual',
    hardwareRequirements: {
      ram: '8 GB minimum, 16 GB recommended',
      cpu: 'Modern 4-core CPU or better',
      gpu: 'Optional. 6 GB+ VRAM improves throughput',
    },
    recommended: true,
  },
  {
    id: 'distil-whisper-large-v3',
    label: 'Distil-Whisper Large v3',
    description: 'Higher-accuracy local transcription model with better results on noisier audio',
    sizeLabel: '1.6 GB',
    parameterSize: '756M',
    languageCapabilities: 'Multilingual',
    hardwareRequirements: {
      ram: '16 GB minimum, 24 GB recommended',
      cpu: 'Modern 6-core CPU or better',
      gpu: 'Recommended. 8 GB+ VRAM for smoother inference',
    },
    recommended: false,
  },
];

module.exports = catalog;
