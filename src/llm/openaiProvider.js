const OpenAI = require('openai');
const LlmProvider = require('./provider');
const logger = require('../logging/logger');

class OpenAIProvider extends LlmProvider {
    constructor(config = {}) {
        super(config);
        if (!config.apiKey) {
            throw new Error('OpenAI API key is not configured. Please set it in App Settings.');
        }
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL, // Optional, for compatible endpoints like LocalAI
        });
        this.model = config.model || 'gpt-5-nano-2025-08-07';
    }

    async complete(prompt, system) {
        try {
            logger.info({ model: this.model }, 'Calling OpenAI API');

            const messages = [];
            if (system) {
                messages.push({ role: 'system', content: system });
            }
            messages.push({ role: 'user', content: prompt });

            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: messages,
            });

            const responseText = completion.choices[0].message.content;

            logger.info({
                model: this.model,
                tokens: completion.usage?.total_tokens
            }, 'OpenAI API response received');

            return responseText;
        } catch (err) {
            logger.error({ err, model: this.model }, 'OpenAI API call failed');
            throw err;
        }
    }

    async listModels() {
        try {
            const list = await this.client.models.list();
            return list.data.map(model => ({
                id: model.id,
                name: model.id // OpenAI models usually don't have separate display names
            }));
        } catch (err) {
            logger.error({ err }, 'Failed to list OpenAI models');
            throw err;
        }
    }
}

module.exports = OpenAIProvider;
