const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../logging/logger');

const fs = require('fs');

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'processAce.db');
const db = new Database(dbPath /*, { verbose: console.log } */);

// Enable WAL for better concurrency, but check for explicit disable (e.g. for Docker on Windows)
if (process.env.DISABLE_SQLITE_WAL !== 'true') {
  try {
    db.pragma('journal_mode = WAL');
  } catch (err) {
    logger.warn({ err }, 'Failed to enable WAL mode. Continuing with default journal mode.');
  }
} else {
  try {
    db.pragma('journal_mode = DELETE');
    logger.info('WAL mode disabled via configuration. Switched to DELETE journal mode.');
  } catch (err) {
    logger.warn({ err }, 'Failed to switch to DELETE journal mode.');
  }
}

// Initialize Tables
try {
  // Users Table
  db.prepare(
    `
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            password_hash TEXT,
            role TEXT DEFAULT 'editor',
            status TEXT DEFAULT 'active',
            name TEXT,
            created_at TEXT
        )
    `,
  ).run();

  // Workspaces Table
  db.prepare(
    `
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT,
            owner_id TEXT,
            created_at TEXT,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        )
    `,
  ).run();

  // Workspace Members Table
  db.prepare(
    `
        CREATE TABLE IF NOT EXISTS workspace_members (
            workspace_id TEXT,
            user_id TEXT,
            role TEXT,
            PRIMARY KEY (workspace_id, user_id),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `,
  ).run();

  // Workspace Invitations Table
  db.prepare(
    `
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
    `,
  ).run();

  // Evidence Table
  db.prepare(
    `
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
            updatedAt TEXT,
            user_id TEXT,
            workspace_id TEXT
        )
    `,
  ).run();

  // Artifact Table
  db.prepare(
    `
        CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT,
            type TEXT,
            version INTEGER,
            content TEXT,
            metadata TEXT,
            createdBy TEXT,
            createdAt TEXT,
            previousVersionId TEXT,
            filename TEXT,
            user_id TEXT,
            workspace_id TEXT,
            llm_provider TEXT,
            llm_model TEXT,
            PRIMARY KEY (id, version)
        )
    `,
  ).run();

  // Jobs Table
  db.prepare(
    `
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            type TEXT,
            data TEXT,
            status TEXT,
            result TEXT,
            error TEXT,
            createdAt TEXT,
            updatedAt TEXT,
            user_id TEXT,
            workspace_id TEXT,
            process_name TEXT
        )
    `,
  ).run();

  // App Settings Table
  db.prepare(
    `
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `,
  ).run();

  // Notifications Table
  db.prepare(
    `
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
    `,
  ).run();

  logger.info('SQLite Database initialized');
} catch (err) {
  logger.error({ err }, 'Failed to initialize SQLite database');
  process.exit(1);
}

module.exports = db;
