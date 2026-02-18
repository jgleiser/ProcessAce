const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// Set up test environment BEFORE requiring modules
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
// Use a valid 32-byte (64 hex char) encryption key for testing
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

const settingsService = require('../../src/services/settingsService');
const db = require('../../src/services/db');

describe('SettingsService', () => {
  // Clean up settings between runs
  after(() => {
    try {
      db.prepare('DELETE FROM app_settings').run();
    } catch {
      /* ignore */
    }
  });

  // --- Encryption / Decryption ---
  describe('encrypt + decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const original = 'sk-test-api-key-12345';
      const encrypted = settingsService.encrypt(original);

      // Encrypted should look like hex:hex
      assert.ok(encrypted.includes(':'), 'Encrypted value should contain iv:data separator');
      assert.notStrictEqual(encrypted, original, 'Encrypted should differ from original');

      const decrypted = settingsService.decrypt(encrypted);
      assert.strictEqual(decrypted, original, 'Decrypted should match original');
    });

    it('should return original text for non-encrypted format', () => {
      const plainText = 'not-encrypted';
      const result = settingsService.decrypt(plainText);
      assert.strictEqual(result, plainText);
    });
  });

  // --- getSettings ---
  describe('getSettings', () => {
    it('should return default settings when DB is empty', () => {
      const settings = settingsService.getSettings();
      assert.ok(settings['llm.provider'], 'Should have default provider');
      assert.ok(settings['llm.model'], 'Should have default model');
    });
  });

  // --- updateSetting ---
  describe('updateSetting', () => {
    it('should update a regular setting', () => {
      const result = settingsService.updateSetting('llm.provider', 'google');
      assert.strictEqual(result.key, 'llm.provider');
      assert.strictEqual(result.value, 'google');

      // Verify in DB
      const settings = settingsService.getSettings();
      assert.strictEqual(settings['llm.provider'], 'google');
    });

    it('should encrypt API key settings', () => {
      settingsService.updateSetting('openai.apiKey', 'sk-test-secret-key');

      // Verify the value is masked in getSettings
      const settings = settingsService.getSettings();
      assert.strictEqual(settings['openai.apiKey'], '********');
    });

    it('should return decrypted API key via getEncryptedSetting', () => {
      settingsService.updateSetting('openai.apiKey', 'sk-my-secret');
      const decrypted = settingsService.getEncryptedSetting('openai.apiKey');
      assert.strictEqual(decrypted, 'sk-my-secret');
    });

    it('should skip update when API key is masked value', () => {
      settingsService.updateSetting('google.apiKey', 'real-key-123');
      // Simulate frontend sending back the masked value
      settingsService.updateSetting('google.apiKey', '********');
      // Value should remain the original
      const decrypted = settingsService.getEncryptedSetting('google.apiKey');
      assert.strictEqual(decrypted, 'real-key-123');
    });
  });

  // --- getEncryptedSetting ---
  describe('getEncryptedSetting', () => {
    it('should return null for non-existent setting', () => {
      const result = settingsService.getEncryptedSetting('nonexistent.key');
      assert.strictEqual(result, null);
    });

    it('should return plain value for non-apiKey settings', () => {
      settingsService.updateSetting('some.setting', 'plain-value');
      const result = settingsService.getEncryptedSetting('some.setting');
      assert.strictEqual(result, 'plain-value');
    });
  });

  // --- deleteSetting ---
  describe('deleteSetting', () => {
    it('should delete a setting', () => {
      settingsService.updateSetting('temp.key', 'temp-value');
      settingsService.deleteSetting('temp.key');
      const result = settingsService.getEncryptedSetting('temp.key');
      assert.strictEqual(result, null);
    });
  });

  // --- getLLMConfig ---
  describe('getLLMConfig', () => {
    before(() => {
      settingsService.updateSetting('llm.provider', 'openai');
      settingsService.updateSetting('llm.model', 'gpt-4');
      settingsService.updateSetting('openai.apiKey', 'sk-test-config');
      settingsService.updateSetting('llm.baseUrl', 'https://api.custom.com');
    });

    it('should return complete LLM config with decrypted API key', () => {
      const config = settingsService.getLLMConfig();
      assert.strictEqual(config.provider, 'openai');
      assert.strictEqual(config.model, 'gpt-4');
      assert.strictEqual(config.apiKey, 'sk-test-config');
      assert.strictEqual(config.baseUrl, 'https://api.custom.com');
    });
  });
});
