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
        updatedAt = new Date()
    }) {
        this.id = id;
        this.type = type;
        this.data = data;
        this.status = status;
        this.result = result;
        this.error = error;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}

const insertStmt = db.prepare(`
    INSERT INTO jobs (id, type, data, status, result, error, createdAt, updatedAt)
    VALUES (@id, @type, @data, @status, @result, @error, @createdAt, @updatedAt)
`);

const updateStmt = db.prepare(`
    UPDATE jobs SET status = @status, result = @result, error = @error, updatedAt = @updatedAt WHERE id = @id
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
            updatedAt: payload.updatedAt
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

module.exports = { Job, saveJob, getJob, deleteJob };
