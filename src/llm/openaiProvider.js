const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { toFile } = require('openai');
const LlmProvider = require('./provider');
const logger = require('../logging/logger');
const { normalizeOllamaModelId } = require('../services/ollamaModelUtils');

const OLLAMA_ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'host.docker.internal']);

const normalizeBaseURL = (value) => {
  if (!value) {
    return undefined;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? undefined : trimmed;
};

const getConfiguredOllamaHosts = () => {
  const configuredHosts = new Set(OLLAMA_ALLOWED_HOSTS);
  const configuredUrls = [process.env.OLLAMA_BASE_URL_DEFAULT, process.env.OLLAMA_PULL_HOST];

  configuredUrls.forEach((value) => {
    const normalizedValue = normalizeBaseURL(value);
    if (!normalizedValue) {
      return;
    }

    try {
      const parsed = new URL(normalizedValue);
      if (parsed.protocol === 'http:' && !parsed.username && !parsed.password) {
        configuredHosts.add(parsed.hostname);
      }
    } catch {
      logger.warn({ value: normalizedValue }, 'Ignoring invalid configured Ollama host');
    }
  });

  return configuredHosts;
};

const validateOllamaBaseURL = (baseURL) => {
  let parsed;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new Error('Invalid Ollama base URL.');
  }

  if (parsed.protocol !== 'http:') {
    throw new Error('Invalid Ollama base URL. Only http:// local URLs are allowed.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Invalid Ollama base URL. Embedded credentials are not allowed.');
  }

  if (!getConfiguredOllamaHosts().has(parsed.hostname)) {
    throw new Error('Invalid Ollama base URL. Only approved local hosts are allowed.');
  }

  return parsed.toString().replace(/\/$/, '');
};

class OpenAIProvider extends LlmProvider {
  constructor(config = {}) {
    super(config);
    const providerName = (config.provider || 'openai').toLowerCase();
    this.providerName = providerName;
    const normalizedBaseURL = normalizeBaseURL(config.baseURL);

    if (providerName === 'ollama') {
      config.baseURL = validateOllamaBaseURL(normalizedBaseURL || process.env.OLLAMA_BASE_URL_DEFAULT || 'http://localhost:11434/v1');
    } else {
      config.baseURL = normalizedBaseURL;
    }

    if (!config.apiKey && providerName !== 'ollama') {
      throw new Error('OpenAI API key is not configured. Please set it in App Settings.');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey || 'ollama-local-placeholder',
      baseURL: config.baseURL, // Optional, for compatible endpoints like LocalAI
    });
    this.model = config.model || 'gpt-5-nano-2025-08-07';
  }

  async complete(prompt, system, options = {}) {
    try {
      logger.info({ model: this.model }, 'Calling OpenAI API');

      const messages = [];
      if (system) {
        messages.push({ role: 'system', content: system });
      }
      messages.push({ role: 'user', content: prompt });

      const requestParams = {
        model: this.model,
        messages: messages,
      };

      // Enforce structured JSON output when requested
      if (options.responseFormat === 'json') {
        requestParams.response_format = { type: 'json_object' };
      }

      const completion = await this.client.chat.completions.create(requestParams);

      const responseText = completion.choices[0].message.content;

      logger.info(
        {
          event_type: 'llm_call',
          jobId: options.jobId,
          llm_provider: 'openai',
          llm_model: this.model,
          prompt_type: options.use_case || 'unknown',
          prompt_metadata: {
            prompt_length: prompt.length,
            system_length: system ? system.length : 0,
          },
          response_metadata: {
            tokens: completion.usage?.total_tokens,
            status: 'success',
            response_length: responseText.length,
          },
        },
        'OpenAI API response received',
      );

      return responseText;
    } catch (err) {
      logger.error(
        {
          event_type: 'llm_call',
          jobId: options.jobId,
          llm_provider: 'openai',
          llm_model: this.model,
          prompt_type: options.use_case || 'unknown',
          response_metadata: { status: 'error' },
          err,
        },
        'OpenAI API call failed',
      );
      throw err;
    }
  }

  async transcribe(filePath, language = null) {
    try {
      logger.info({ model: this.model, filePath }, 'Calling OpenAI Transcription API');

      const fileName = path.basename(filePath);
      const ext = path.extname(fileName).toLowerCase();

      const mimeTypes = {
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.wav': 'audio/wav',
        '.mp4': 'audio/mp4',
        '.webm': 'audio/webm',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
        '.mpeg': 'audio/mpeg',
        '.mpga': 'audio/mpeg',
        '.oga': 'audio/ogg',
      };

      const fileType = mimeTypes[ext] || 'audio/mp4';

      const params = {
        file: await toFile(fs.createReadStream(filePath), fileName, { type: fileType }),
        model: this.model,
      };

      if (language) {
        params.language = language;
      }

      // Handle specialized parameters based on model
      if (this.model === 'gpt-4o-transcribe-diarize') {
        params.response_format = 'diarized_json';
        params.chunking_strategy = 'auto'; // Required for inputs > 30s
      }

      const response = await this.client.audio.transcriptions.create(params);

      // Handle diarized output if requested
      let textResult = '';
      if (this.model === 'gpt-4o-transcribe-diarize' && response.segments) {
        textResult = response.segments.map((s) => `${s.speaker}: ${s.text}`).join('\n');
      } else {
        textResult = response.text;
      }

      logger.info(
        {
          event_type: 'llm_call',
          llm_provider: 'openai',
          llm_model: this.model,
          prompt_type: 'transcription',
          response_metadata: {
            status: 'success',
            response_length: textResult.length,
          },
        },
        'OpenAI Transcription response received',
      );

      return textResult;
    } catch (err) {
      logger.error(
        {
          event_type: 'llm_call',
          llm_provider: 'openai',
          llm_model: this.model,
          prompt_type: 'transcription',
          response_metadata: { status: 'error' },
          err,
        },
        'OpenAI Transcription API call failed',
      );
      throw err;
    }
  }

  async listModels() {
    try {
      const list = await this.client.models.list();
      return list.data.map((model) => ({
        id: this.providerName === 'ollama' ? normalizeOllamaModelId(model.id) : model.id,
        name: this.providerName === 'ollama' ? normalizeOllamaModelId(model.id) : model.id,
      }));
    } catch (err) {
      logger.error({ err }, 'Failed to list OpenAI models');
      throw err;
    }
  }
}

module.exports = OpenAIProvider;
module.exports.validateOllamaBaseURL = validateOllamaBaseURL;
