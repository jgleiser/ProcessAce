const Anthropic = require('@anthropic-ai/sdk');
const LlmProvider = require('./provider');
const logger = require('../logging/logger');

class AnthropicProvider extends LlmProvider {
    constructor(config = {}) {
        super(config);
        const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not configured');
        }
        this.client = new Anthropic({
            apiKey: apiKey,
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
}

module.exports = AnthropicProvider;
