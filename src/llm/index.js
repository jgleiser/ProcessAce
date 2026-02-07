const OpenAIProvider = require('./openaiProvider');
const GoogleProvider = require('./googleProvider');
const AnthropicProvider = require('./anthropicProvider');

const getLlmProvider = (options = {}) => {
    // Support mock provider for testing
    if (process.env.MOCK_LLM === 'true') {
        return {
            complete: async (prompt, system) => {
                return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_Mock">
  <bpmn:process id="Process_Mock" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"/>
    <bpmn:task id="Task_1" name="Mock Task"/>
    <bpmn:endEvent id="EndEvent_1"/>
  </bpmn:process>
</bpmn:definitions>`;
            }
        }
    }

    const providerName = (options.provider || 'openai').toLowerCase();

    // Default models if not specified
    const defaults = {
        openai: 'gpt-5-nano-2025-08-07',
        google: 'gemini-2.5-flash-lite',
        anthropic: 'claude-haiku-4-5-20251001'
    };

    const model = options.model || defaults[providerName];

    const config = {
        model,
        // Allow passing specific API keys if needed in future, otherwise providers use process.env
    };

    switch (providerName) {
        case 'google':
        case 'gemini':
            return new GoogleProvider(config);
        case 'anthropic':
        case 'claude':
            return new AnthropicProvider(config);
        case 'openai':
        default:
            // For OpenAI, we still support custom base URL from env for local models
            config.apiKey = process.env.OPENAI_API_KEY;
            config.baseURL = process.env.LLM_PROVIDER_URL;
            return new OpenAIProvider(config);
    }
};

module.exports = {
    getLlmProvider,
};
