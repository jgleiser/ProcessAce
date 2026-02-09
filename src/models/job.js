const db = require('../services/db');
const { v4: uuidv4 } = require('uuid');

class Job {
    constructor({
        id = uuidv4(),
        type,
        data = {},
        status = 'pending',
        result = null,
        error = null,
        createdAt = new Date(),
        updatedAt = new Date(),
        user_id = null,
        workspace_id = null,
        process_name = null
    }) {
        this.id = id;
        this.type = type;
        this.data = data;
        this.status = status;
        this.result = result;
        this.error = error;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.user_id = user_id;
        this.workspace_id = workspace_id;
        this.process_name = process_name;
    }
}

const insertStmt = db.prepare(`
    INSERT INTO jobs (id, type, data, status, result, error, createdAt, updatedAt, user_id, workspace_id, process_name)
    VALUES (@id, @type, @data, @status, @result, @error, @createdAt, @updatedAt, @user_id, @workspace_id, @process_name)
`);

const updateStmt = db.prepare(`
    UPDATE jobs SET status = @status, result = @result, error = @error, updatedAt = @updatedAt, user_id = @user_id, workspace_id = @workspace_id, process_name = @process_name WHERE id = @id
`);

const getStmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
const deleteStmt = db.prepare('DELETE FROM jobs WHERE id = ?');

const saveJob = (job) => {
    const existing = getStmt.get(job.id);
    const payload = {
        ...job,
        data: JSON.stringify(job.data),
        result: JSON.stringify(job.result),
        createdAt: job.createdAt.toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (existing) {
        updateStmt.run({
            id: payload.id,
            status: payload.status,
            result: payload.result,
            error: payload.error,
            updatedAt: payload.updatedAt,
            user_id: payload.user_id,
            workspace_id: payload.workspace_id,
            process_name: payload.process_name
        });
    } else {
        insertStmt.run(payload);
    }
    return job;
};

const getJob = (id) => {
    const row = getStmt.get(id);
    if (!row) return null;
    return new Job({
        ...row,
        data: JSON.parse(row.data || '{}'),
        result: JSON.parse(row.result || 'null'),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
    });
};

const deleteJob = (id) => {
    const res = deleteStmt.run(id);
    return res.changes > 0;
};

const listJobsByUserStmt = db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY createdAt DESC LIMIT 20');

const getJobsByUserId = (userId) => {
    const rows = listJobsByUserStmt.all(userId);
    return rows.map(row => new Job({
        ...row,
        data: JSON.parse(row.data || '{}'),
        result: JSON.parse(row.result || 'null'),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
    }));
};

// Filter jobs by user AND workspace
const listJobsByWorkspaceStmt = db.prepare('SELECT * FROM jobs WHERE user_id = ? AND workspace_id = ? ORDER BY createdAt DESC LIMIT 20');

const getJobsByUserAndWorkspace = (userId, workspaceId) => {
    const rows = listJobsByWorkspaceStmt.all(userId, workspaceId);
    return rows.map(row => new Job({
        ...row,
        data: JSON.parse(row.data || '{}'),
        result: JSON.parse(row.result || 'null'),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
    }));
};

module.exports = { Job, saveJob, getJob, deleteJob, getJobsByUserId, getJobsByUserAndWorkspace };
