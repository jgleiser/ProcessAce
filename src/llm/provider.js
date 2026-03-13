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
  async complete(_prompt, _system) {
    throw new Error('Method "complete" must be implemented');
  }

  /**
   * Lists available models for the provider.
   * @returns {Promise<Array<{id: string, name: string}>>} - List of models.
   */
  async listModels() {
    throw new Error('Method "listModels" must be implemented');
  }

  /**
   * Transcribes an audio file into text.
   * @param {string} filePath - The path to the audio file.
   * @param {string} [language] - Optional ISO language code (e.g., 'es').
   * @returns {Promise<string>} - The transcribed text.
   */
  async transcribe(_filePath, _language = null) {
    throw new Error(`Method "transcribe" is not supported by ${this.constructor.name}`);
  }
}

module.exports = LlmProvider;
