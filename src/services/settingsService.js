const crypto = require('crypto');
const db = require('./db');
const logger = require('../logging/logger');

// Retrieve encryption key from environment variable
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16; // AES block size

class SettingsService {
  constructor() {
    this.defaultSettings = {
      'llm.provider': 'openai',
      'llm.model': 'gpt-5-nano-2025-08-07',
      'ollama.baseUrl': process.env.OLLAMA_BASE_URL_DEFAULT || 'http://localhost:11434/v1',
      'transcription.provider': 'openai',
      'transcription.model': 'whisper-1',
      'transcription.maxFileSizeMB': '25',
    };

    if (!ENCRYPTION_KEY) {
      logger.warn('ENCRYPTION_KEY is not set. API keys will not be encrypted securely.');
    }
  }

  getConfiguredOllamaBaseUrl() {
    return this.normalizeValue(process.env.OLLAMA_BASE_URL_DEFAULT);
  }

  encrypt(text) {
    if (!ENCRYPTION_KEY) return text;
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
      let encrypted = cipher.update(text);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
      logger.error({ err: error }, 'Encryption failed');
      throw error;
    }
  }

  decrypt(text) {
    if (!ENCRYPTION_KEY) return text;
    try {
      const textParts = text.split(':');
      if (textParts.length !== 2) return text; // Not encrypted with this scheme

      const iv = Buffer.from(textParts.shift(), 'hex');
      const encryptedText = Buffer.from(textParts.join(':'), 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    } catch (error) {
      logger.error({ err: error }, 'Decryption failed');
      return text; // Return original if decryption fails (fallback)
    }
  }

  /**
   * Get all application settings
   * @returns {Object} Key-value pairs of settings
   */
  getSettings() {
    try {
      const rows = db.prepare('SELECT key, value FROM app_settings').all();
      const settings = { ...this.defaultSettings };
      rows.forEach((row) => {
        let value = row.value;
        // Mask sensitive keys
        if (row.key.endsWith('.apiKey')) {
          value = value ? '********' : '';
        }
        settings[row.key] = value;
      });

      const configuredOllamaBaseUrl = this.getConfiguredOllamaBaseUrl();
      if (configuredOllamaBaseUrl) {
        settings['ollama.baseUrl'] = configuredOllamaBaseUrl;
      }

      return settings;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get settings');
      return this.defaultSettings;
    }
  }

  /**
   * Get a specific setting value (decrypted if applicable)
   * Internal use only
   * @param {string} key
   */
  getEncryptedSetting(key) {
    try {
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
      if (!row) return null;

      if (key.endsWith('.apiKey')) {
        return this.decrypt(row.value);
      }
      return row.value;
    } catch (error) {
      logger.error({ err: error, key }, 'Failed to get encrypted setting');
      return null;
    }
  }

  hasSetting(key) {
    try {
      const row = db.prepare('SELECT 1 FROM app_settings WHERE key = ?').get(key);
      return Boolean(row);
    } catch (error) {
      logger.error({ err: error, key }, 'Failed to check setting presence');
      return false;
    }
  }

  normalizeValue(value) {
    if (value === undefined || value === null) {
      return null;
    }

    const text = String(value).trim();
    return text === '' ? null : text;
  }

  getProviderApiKey(provider) {
    if (provider === 'ollama') {
      return null;
    }

    return this.getEncryptedSetting(`${provider}.apiKey`);
  }

  getProviderBaseUrl(provider) {
    if (provider === 'ollama') {
      return (
        this.getConfiguredOllamaBaseUrl() || this.normalizeValue(this.getEncryptedSetting('ollama.baseUrl')) || this.defaultSettings['ollama.baseUrl']
      );
    }

    if (provider === 'openai') {
      if (this.hasSetting('openai.baseUrl')) {
        return this.normalizeValue(this.getEncryptedSetting('openai.baseUrl'));
      }

      return this.normalizeValue(this.getEncryptedSetting('llm.baseUrl'));
    }

    return null;
  }

  /**
   * Update a specific setting
   * @param {string} key
   * @param {string} value
   */
  updateSetting(key, value) {
    try {
      let valueToStore = String(value);

      // Encrypt sensitive keys
      if (key.endsWith('.apiKey')) {
        // If value is masked, do NOT update (user didn't change it)
        if (value === '********') {
          return { key, value }; // No-op
        }
        valueToStore = this.encrypt(valueToStore);
      }

      const stmt = db.prepare(`
                INSERT INTO app_settings (key, value) 
                VALUES (?, ?) 
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `);
      stmt.run(key, valueToStore);

      // Log with masked value if sensitive
      const logValue = key.endsWith('.apiKey') ? '********' : value;
      logger.info({ key, value: logValue }, 'Setting updated');

      return { key, value: logValue };
    } catch (error) {
      logger.error({ err: error, key }, 'Failed to update setting');
      throw error;
    }
  }

  /**
   * Delete a specific setting
   * @param {string} key
   */
  deleteSetting(key) {
    try {
      const stmt = db.prepare('DELETE FROM app_settings WHERE key = ?');
      stmt.run(key);
      logger.info({ key }, 'Setting deleted');
    } catch (error) {
      logger.error({ err: error, key }, 'Failed to delete setting');
      throw error;
    }
  }

  /**
   * Get LLM Configuration
   * @returns {Object} { provider, model, apiKey, baseUrl }
   */
  getLLMConfig() {
    const settings = this.getSettings();
    const provider = settings['llm.provider'];
    const model = settings['llm.model'];
    const apiKey = this.getProviderApiKey(provider);
    const baseUrl = this.getProviderBaseUrl(provider);

    return {
      provider,
      model,
      apiKey,
      baseUrl,
    };
  }

  resolveProviderConfig(provider, overrides = {}) {
    const normalizedProvider = this.normalizeValue(provider || this.getSettings()['llm.provider'] || 'openai') || 'openai';
    const normalizedBaseUrl = this.normalizeValue(overrides.baseUrl);
    const normalizedApiKey = this.normalizeValue(overrides.apiKey);

    return {
      provider: normalizedProvider,
      model: this.normalizeValue(overrides.model) || this.getSettings()['llm.model'],
      apiKey: normalizedApiKey || this.getProviderApiKey(normalizedProvider),
      baseUrl: normalizedBaseUrl || this.getProviderBaseUrl(normalizedProvider),
    };
  }

  /**
   * Get Transcription Configuration
   * @returns {Object} { provider, model, apiKey, maxFileSizeMB }
   */
  getTranscriptionConfig() {
    const settings = this.getSettings();
    const provider = settings['transcription.provider'];
    const model = settings['transcription.model'];
    const maxFileSizeMB = parseInt(settings['transcription.maxFileSizeMB'], 10) || 25;

    // Transcription uses the same API key logic based on the provider
    const apiKeyKey = `${provider}.apiKey`;
    const apiKey = this.getEncryptedSetting(apiKeyKey);

    return {
      provider,
      model,
      apiKey,
      maxFileSizeMB,
    };
  }
}

module.exports = new SettingsService();
