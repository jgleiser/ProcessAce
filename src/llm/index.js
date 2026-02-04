const OpenAIProvider = require('./openaiProvider');
// Future: require('./otherProvider');

const getLlmProvider = () => {
    // Default to OpenAI provider for now
    // In the future, we can switch on process.env.LLM_PROVIDER_TYPE

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
