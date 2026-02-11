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

// Enable WAL for better concurrency, but fallback if it fails (e.g. Docker mounts)
try {
    db.pragma('journal_mode = WAL');
} catch (err) {
    logger.warn({ err }, 'Failed to enable WAL mode. Continuing with default journal mode.');
}

// Initialize Tables
try {
    // Users Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            password_hash TEXT,
            created_at TEXT
        )
    `).run();

    // Migration: Add role and status columns to users table
    try {
        db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'viewer'").run();
    } catch (e) { /* ignore if exists */ }
    try {
        db.prepare("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'").run();
    } catch (e) { /* ignore if exists */ }
    try {
        db.prepare("ALTER TABLE users ADD COLUMN name TEXT").run();
    } catch (e) { /* ignore if exists */ }

    // Workspaces Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT,
            owner_id TEXT,
            created_at TEXT,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        )
    `).run();

    // Workspace Members Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS workspace_members (
            workspace_id TEXT,
            user_id TEXT,
            role TEXT,
            PRIMARY KEY (workspace_id, user_id),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `).run();

    // Workspace Invitations Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS workspace_invitations (
            id TEXT PRIMARY KEY,
            workspace_id TEXT,
            inviter_id TEXT,
            recipient_email TEXT,
            role TEXT DEFAULT 'viewer',
            token TEXT UNIQUE,
            status TEXT DEFAULT 'pending', 
            created_at TEXT,
            expires_at TEXT,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
            FOREIGN KEY(inviter_id) REFERENCES users(id)
        )
    `).run();

    // Evidence Table
    // Check if table exists to decide whether to create or alter
    const evidenceTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence'").get();
    if (!evidenceTableExists) {
        db.prepare(`
            CREATE TABLE evidence (
                id TEXT PRIMARY KEY,
                filename TEXT,
                originalName TEXT,
                mimeType TEXT,
                size INTEGER,
                path TEXT,
                status TEXT DEFAULT 'pending',
                metadata TEXT,
                createdAt TEXT,
                updatedAt TEXT,
                user_id TEXT,
                workspace_id TEXT
            )
        `).run();
    } else {
        // Migration: Add columns if they don't exist
        try {
            db.prepare("ALTER TABLE evidence ADD COLUMN user_id TEXT").run();
        } catch (e) { /* ignore if exists */ }
        try {
            db.prepare("ALTER TABLE evidence ADD COLUMN workspace_id TEXT").run();
        } catch (e) { /* ignore if exists */ }
    }

    // Artifact Table
    const artifactsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'").get();
    if (!artifactsTableExists) {
        db.prepare(`
            CREATE TABLE artifacts (
                id TEXT PRIMARY KEY,
                type TEXT,
                version INTEGER,
                content TEXT,
                metadata TEXT,
                createdBy TEXT,
                createdAt TEXT,
                previousVersionId TEXT,
                filename TEXT,
                user_id TEXT,
                workspace_id TEXT
            )
        `).run();
    } else {
        try {
            db.prepare("ALTER TABLE artifacts ADD COLUMN user_id TEXT").run();
        } catch (e) { /* ignore if exists */ }
        try {
            db.prepare("ALTER TABLE artifacts ADD COLUMN workspace_id TEXT").run();
        } catch (e) { /* ignore if exists */ }
        try {
            db.prepare("ALTER TABLE artifacts ADD COLUMN llm_provider TEXT").run();
        } catch (e) { /* ignore if exists */ }
        try {
            db.prepare("ALTER TABLE artifacts ADD COLUMN llm_model TEXT").run();
        } catch (e) { /* ignore if exists */ }
    }

    // Jobs Table
    const jobsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'").get();
    if (!jobsTableExists) {
        db.prepare(`
            CREATE TABLE jobs (
                id TEXT PRIMARY KEY,
                type TEXT,
                data TEXT,
                status TEXT,
                result TEXT,
                error TEXT,
                createdAt TEXT,
                updatedAt TEXT,
                user_id TEXT,
                workspace_id TEXT
            )
        `).run();
    } else {
        try {
            db.prepare("ALTER TABLE jobs ADD COLUMN user_id TEXT").run();
        } catch (e) { /* ignore if exists */ }
        try {
            db.prepare("ALTER TABLE jobs ADD COLUMN workspace_id TEXT").run();
        } catch (e) { /* ignore if exists */ }
        try {
            db.prepare("ALTER TABLE jobs ADD COLUMN process_name TEXT").run();
        } catch (e) { /* ignore if exists */ }
    }

    // App Settings Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `).run();

    // Notifications Table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            type TEXT,
            title TEXT,
            message TEXT,
            data TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `).run();

    logger.info('SQLite Database initialized');
} catch (err) {
    logger.error({ err }, 'Failed to initialize SQLite database');
    process.exit(1);
}

module.exports = db;
