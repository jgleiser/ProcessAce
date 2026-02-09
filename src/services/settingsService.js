const db = require('./db');
const logger = require('../logging/logger');

class SettingsService {
    constructor() {
        this.defaultSettings = {
            'llm.provider': 'openai',
            'llm.model': 'gpt-5-nano-2025-08-07'
        };
    }

    /**
     * Get all application settings
     * @returns {Object} Key-value pairs of settings
     */
    getSettings() {
        try {
            const rows = db.prepare('SELECT key, value FROM app_settings').all();
            const settings = { ...this.defaultSettings };
            rows.forEach(row => {
                settings[row.key] = row.value;
            });
            return settings;
        } catch (error) {
            logger.error({ err: error }, 'Failed to get settings');
            return this.defaultSettings;
        }
    }

    /**
     * Update a specific setting
     * @param {string} key 
     * @param {string} value 
     */
    updateSetting(key, value) {
        try {
            const stmt = db.prepare(`
                INSERT INTO app_settings (key, value) 
                VALUES (?, ?) 
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `);
            stmt.run(key, String(value));
            logger.info({ key, value }, 'Setting updated');
            return { key, value };
        } catch (error) {
            logger.error({ err: error, key, value }, 'Failed to update setting');
            throw error;
        }
    }

    /**
     * Get LLM Configuration
     * @returns {Object} { provider, model }
     */
    getLLMConfig() {
        const settings = this.getSettings();
        return {
            provider: settings['llm.provider'],
            model: settings['llm.model']
        };
    }
}

module.exports = new SettingsService();
