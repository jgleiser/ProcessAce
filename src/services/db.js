const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../logging/logger');

const fs = require('fs');

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'processAce.db');
const db = new Database(dbPath/*, { verbose: console.log } */);

// Enable WAL for better concurrency
db.pragma('journal_mode = WAL');

// Initialize Tables
try {
    // Evidence Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS evidence (
            id TEXT PRIMARY KEY,
            filename TEXT,
            originalName TEXT,
            mimeType TEXT,
            size INTEGER,
            path TEXT,
            status TEXT DEFAULT 'pending',
            metadata TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )
    `).run();

    // Artifact Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT PRIMARY KEY,
            type TEXT,
            version INTEGER,
            content TEXT,
            metadata TEXT,
            createdBy TEXT,
            createdAt TEXT,
            previousVersionId TEXT,
            filename TEXT
        )
    `).run();

    // Jobs Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            type TEXT,
            data TEXT,
            status TEXT,
            result TEXT,
            error TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )
    `).run();

    logger.info('SQLite Database initialized');
} catch (err) {
    logger.error({ err }, 'Failed to initialize SQLite database');
    process.exit(1);
}

module.exports = db;
