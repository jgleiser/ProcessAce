/**
 * Abstract class for LLM Providers.
 */
class LlmProvider {
    constructor(config = {}) {
        this.config = config;
    }

    /**
     * Generates a completion for the given prompt.
     * @param {string} prompt - The user prompt.
     * @param {string} [system] - Optional system instruction.
     * @returns {Promise<string>} - The generated text.
     */
    async complete(prompt, system) {
        throw new Error('Method "complete" must be implemented');
    }

    /**
     * Lists available models for the provider.
     * @returns {Promise<Array<{id: string, name: string}>>} - List of models.
     */
    async listModels() {
        throw new Error('Method "listModels" must be implemented');
    }
}

module.exports = LlmProvider;
