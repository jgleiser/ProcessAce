const OpenAIProvider = require('./openaiProvider');
// Future: require('./otherProvider');

const getLlmProvider = () => {
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

    // Default to OpenAI provider for now
    const config = {
        apiKey: process.env.LLM_API_KEY,
        baseURL: process.env.LLM_PROVIDER_URL,
        model: process.env.LLM_MODEL,
    };

    return new OpenAIProvider(config);
};

module.exports = {
    getLlmProvider,
};
