const Anthropic = require('@anthropic-ai/sdk');
const LlmProvider = require('./provider');
const logger = require('../logging/logger');

class AnthropicProvider extends LlmProvider {
    constructor(config = {}) {
        super(config);
        if (!config.apiKey) {
            throw new Error('Anthropic API key is not configured. Please set it in App Settings.');
        }
        this.client = new Anthropic({
            apiKey: config.apiKey,
        });
        this.model = config.model || 'claude-haiku-4-5-20251001';
    }

    async complete(prompt, system) {
        try {
            logger.info({ model: this.model }, 'Calling Anthropic API');

            const messages = [
                { role: 'user', content: prompt }
            ];

            const params = {
                model: this.model,
                max_tokens: 4096, // Reasonable default for artifacts
                messages: messages,
            };

            if (system) {
                params.system = system;
            }

            const response = await this.client.messages.create(params);

            const text = response.content[0].text;

            logger.info({
                model: this.model,
                usage: response.usage
            }, 'Anthropic API response received');

            return text;
        } catch (err) {
            logger.error({ err, model: this.model }, 'Anthropic API call failed');
            throw err;
        }
    }

    async listModels() {
        try {
            logger.info('Fetching available Anthropic models');
            const models = [];

            // Iterate through all pages of models
            for await (const modelInfo of this.client.models.list()) {
                models.push({
                    id: modelInfo.id,
                    name: modelInfo.display_name || modelInfo.id
                });
            }

            logger.info({ count: models.length }, 'Anthropic models fetched');
            return models;
        } catch (err) {
            logger.error({ err }, 'Failed to list Anthropic models');
            throw err;
        }
    }
}

module.exports = AnthropicProvider;
