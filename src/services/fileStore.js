const fs = require('fs');
const path = require('path');
const logger = require('../logging/logger');

class FileStore {
  constructor(filename) {
    this.filepath = path.join(process.cwd(), 'src', 'data', filename);
    // Ensure data directory exists
    const dir = path.dirname(this.filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load() {
    try {
      if (fs.existsSync(this.filepath)) {
        const data = fs.readFileSync(this.filepath, 'utf8');
        const parsed = JSON.parse(data);

        // Convert object back to Map, handling Date strings if needed
        // For simplicity, we assume generic object -> Map entries
        // But complex objects (like Artifact/Evidence classes) might need re-hydration
        // For Phase 1, raw object storage is fine as long as we treat them as objects.
        // However, our In-Memory stores use Maps.
        // JSON.parse returns an Object, Object.entries can turn it into Map.

        // We need to re-instantiate dates if possible, but basic JSON is okay for now.
        // Best effort Map reconstruction:
        return new Map(Object.entries(parsed));
      }
    } catch (err) {
      logger.error({ err, filepath: this.filepath }, 'Failed to load store');
    }
    return new Map();
  }

  save(map) {
    try {
      // Convert Map to Object
      const obj = Object.fromEntries(map);
      const data = JSON.stringify(obj, null, 2);
      fs.writeFileSync(this.filepath, data, 'utf8');
    } catch (err) {
      logger.error({ err, filepath: this.filepath }, 'Failed to save store');
    }
  }
}

module.exports = FileStore;
