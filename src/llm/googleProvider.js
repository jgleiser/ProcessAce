const { GoogleGenAI } = require('@google/genai');
const LlmProvider = require('./provider');
const logger = require('../logging/logger');

class GoogleProvider extends LlmProvider {
  constructor(config = {}) {
    super(config);
    if (!config.apiKey) {
      throw new Error('Google API key is not configured. Please set it in App Settings.');
    }
    // Initialize the client
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.modelName = config.model || 'gemini-2.5-flash-lite';
  }

  async complete(prompt, system, options = {}) {
    try {
      logger.info({ model: this.modelName }, 'Calling Google GenAI API');

      // Build contents with optional system instruction
      const config = {};
      if (system) {
        config.systemInstruction = system;
      }

      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: prompt,
        ...config,
      });

      const text = response.text;

      logger.info(
        {
          event_type: 'llm_call',
          jobId: options.jobId,
          llm_provider: 'google',
          llm_model: this.modelName,
          prompt_type: options.use_case || 'unknown',
          prompt_metadata: {
            prompt_length: prompt.length,
            system_length: system ? system.length : 0,
          },
          response_metadata: {
            usage: response.usageMetadata,
            status: 'success',
            response_length: text.length,
          },
        },
        'Google GenAI API response received',
      );

      return text;
    } catch (err) {
      logger.error(
        {
          event_type: 'llm_call',
          jobId: options.jobId,
          llm_provider: 'google',
          llm_model: this.modelName,
          prompt_type: options.use_case || 'unknown',
          response_metadata: { status: 'error' },
          err,
        },
        'Google GenAI API call failed',
      );
      throw err;
    }
  }

  async listModels() {
    try {
      logger.info('Fetching available Google GenAI models');
      const models = [];
      let nextPageToken = null;

      do {
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
        url.searchParams.set('key', this.config.apiKey);
        url.searchParams.set('pageSize', '100');
        if (nextPageToken) {
          url.searchParams.set('pageToken', nextPageToken);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Failed to fetch models');
        }

        const data = await response.json();

        if (data.models) {
          for (const model of data.models) {
            models.push({
              id: model.name.replace('models/', ''),
              name: model.displayName || model.name.replace('models/', ''),
            });
          }
        }

        nextPageToken = data.nextPageToken;
      } while (nextPageToken);

      logger.info({ count: models.length }, 'Google GenAI models fetched');
      return models;
    } catch (err) {
      logger.error({ err }, 'Failed to list Google GenAI models');
      throw err;
    }
  }
}

module.exports = GoogleProvider;
