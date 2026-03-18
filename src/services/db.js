const fs = require('fs');
const path = require('path');
const logger = require('../logging/logger');

const PLAINTEXT_SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'utf8');

const resolveDatabaseConfig = (env = process.env) => {
  const isProduction = env.NODE_ENV === 'production';
  const dataDir = path.resolve(process.cwd(), 'data');
  const dbPath = env.DB_PATH || path.join(dataDir, isProduction ? 'processAce.db' : 'processAce-dev.db');
  const usesSqlCipher = isProduction;

  if (usesSqlCipher && !env.SQLITE_ENCRYPTION_KEY) {
    logger.fatal('SQLITE_ENCRYPTION_KEY environment variable is required in production.');
    throw new Error('SQLITE_ENCRYPTION_KEY environment variable is required in production.');
  }

  return {
    dataDir,
    dbPath,
    isProduction,
    isInMemory: dbPath === ':memory:',
    usesSqlCipher,
    driverModuleName: usesSqlCipher ? 'better-sqlite3-multiple-ciphers' : 'better-sqlite3',
    sqliteEncryptionKey: env.SQLITE_ENCRYPTION_KEY,
  };
};

const ensureDataDirectory = (dataDir, fileSystem = fs) => {
  if (!fileSystem.existsSync(dataDir)) {
    fileSystem.mkdirSync(dataDir, { recursive: true });
  }
};

const isPlaintextSqliteFile = (dbPath, fileSystem = fs) => {
  if (!fileSystem.existsSync(dbPath)) {
    return false;
  }

  const stats = fileSystem.statSync(dbPath);
  if (stats.size === 0) {
    return false;
  }

  const header = fileSystem.readFileSync(dbPath).subarray(0, PLAINTEXT_SQLITE_HEADER.length);
  return header.equals(PLAINTEXT_SQLITE_HEADER);
};

const validateProductionDatabaseFile = (config, fileSystem = fs) => {
  if (!config.usesSqlCipher || config.isInMemory) {
    return;
  }

  if (isPlaintextSqliteFile(config.dbPath, fileSystem)) {
    const message =
      'Existing plaintext SQLite database detected in production. ProcessAce will not auto-migrate plaintext databases to SQLCipher. Back up the database and follow the documented export/import migration procedure before restarting.';
    logger.fatal({ dbPath: config.dbPath }, message);
    throw new Error(message);
  }
};

const loadDatabaseDriver = (config) => {
  try {
    return require(config.driverModuleName);
  } catch (error) {
    if (config.usesSqlCipher) {
      logger.fatal(
        { err: error },
        'Encrypted SQLite driver is unavailable. Rebuild the production image so the production database module compiles for the target runtime.',
      );
      throw new Error(
        'Encrypted SQLite driver is required in production. Rebuild the production image so the production database module compiles for the target runtime before starting ProcessAce.',
        {
          cause: error,
        },
      );
    }

    throw error;
  }
};

const resolveDatabaseConstructor = (driverModule) => {
  if (typeof driverModule === 'function') {
    return driverModule;
  }

  if (driverModule && typeof driverModule.Database === 'function') {
    return driverModule.Database;
  }

  if (driverModule && typeof driverModule.default === 'function') {
    return driverModule.default;
  }

  if (driverModule && driverModule.default && typeof driverModule.default.Database === 'function') {
    return driverModule.default.Database;
  }

  throw new TypeError('Database driver did not export a constructor.');
};

const escapePragmaValue = (value) => String(value).replace(/'/g, "''");

const applyDatabaseEncryptionKey = (database, encryptionKey) => {
  database.pragma("cipher = 'sqlcipher'");
  database.pragma('legacy = 4');
  database.pragma(`key = '${escapePragmaValue(encryptionKey)}'`);
};

const validateEncryptedDatabase = (database) => {
  try {
    database.prepare('SELECT count(*) as count FROM sqlite_master').get();
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to open the encrypted production database.');
    throw new Error(
      'Failed to open the encrypted production database. Verify SQLITE_ENCRYPTION_KEY and migrate any legacy plaintext database before retrying.',
      {
        cause: error,
      },
    );
  }
};

const ensureColumn = (database, tableName, columnName, definition) => {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    database.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
};

const configureJournalMode = (database, env = process.env) => {
  if (env.DISABLE_SQLITE_WAL !== 'true') {
    try {
      database.pragma('journal_mode = WAL');
    } catch (err) {
      logger.warn({ err }, 'Failed to enable WAL mode. Continuing with default journal mode.');
    }
    return;
  }

  try {
    database.pragma('journal_mode = DELETE');
    logger.info('WAL mode disabled via configuration. Switched to DELETE journal mode.');
  } catch (err) {
    logger.warn({ err }, 'Failed to switch to DELETE journal mode.');
  }
};

const initializeSchema = (database) => {
  try {
    database
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            password_hash TEXT,
            role TEXT DEFAULT 'editor',
            status TEXT DEFAULT 'active',
            name TEXT,
            created_at TEXT,
            last_login_at TEXT
        )
    `,
      )
      .run();

    ensureColumn(database, 'users', 'last_login_at', 'TEXT');

    database
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT,
            owner_id TEXT,
            created_at TEXT,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        )
    `,
      )
      .run();

    database
      .prepare(
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
      )
      .run();

    database
      .prepare(
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
      )
      .run();

    database
      .prepare(
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
      )
      .run();

    database
      .prepare(
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
      )
      .run();

    database
      .prepare(
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
            process_name TEXT,
            progress INTEGER DEFAULT 0,
            progress_message TEXT
        )
    `,
      )
      .run();

    ensureColumn(database, 'jobs', 'progress', 'INTEGER DEFAULT 0');
    ensureColumn(database, 'jobs', 'progress_message', 'TEXT');

    database
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `,
      )
      .run();

    database
      .prepare(
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
      )
      .run();

    database
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS consent_records (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            consent_type TEXT,
            granted INTEGER DEFAULT 1,
            timestamp TEXT,
            ip_address TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `,
      )
      .run();

    database
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS login_attempts (
            user_id TEXT PRIMARY KEY,
            attempt_count INTEGER DEFAULT 0,
            locked_until TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `,
      )
      .run();

    logger.info('SQLite Database initialized');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize SQLite database');
    process.exit(1);
  }
};

const createDatabaseConnection = (options = {}) => {
  const env = options.env || process.env;
  const fileSystem = options.fileSystem || fs;
  const config = resolveDatabaseConfig(env);

  ensureDataDirectory(config.dataDir, fileSystem);
  validateProductionDatabaseFile(config, fileSystem);

  const Database = resolveDatabaseConstructor(options.Database || loadDatabaseDriver(config));
  const database = new Database(config.dbPath);

  if (config.usesSqlCipher && !config.isInMemory) {
    applyDatabaseEncryptionKey(database, config.sqliteEncryptionKey);
    validateEncryptedDatabase(database);
  }

  configureJournalMode(database, env);
  initializeSchema(database);

  return database;
};

const db = createDatabaseConnection();

const dbHelpers = {
  resolveDatabaseConfig,
  createDatabaseConnection,
  applyDatabaseEncryptionKey,
  isPlaintextSqliteFile,
  resolveDatabaseConstructor,
  validateProductionDatabaseFile,
};

module.exports = new Proxy(db, {
  get(target, property, receiver) {
    if (property in dbHelpers) {
      return dbHelpers[property];
    }

    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
