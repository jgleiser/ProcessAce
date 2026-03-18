const express = require('express');
const authService = require('../services/authService');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const logger = require('../logging/logger');
const db = require('../services/db');
const notificationService = require('../services/notificationService');
const { sendErrorResponse } = require('../utils/errorResponse');

const router = express.Router();

// All routes in this file require authentication + admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/admin/users
 * Get all users (admin only)
 */
router.get('/users', (req, res) => {
  try {
    // Disable caching
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Expires', '0');
    res.set('Pragma', 'no-cache');

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Extract filters
    const filters = {
      name: req.query.name,
      email: req.query.email,
      role: req.query.role,
      status: req.query.status,
    };

    const result = authService.getUsersPaginated(page, limit, filters);

    logger.info(
      {
        event_type: 'admin_users_list',
        actor: req.user.id,
        page,
        limit,
        filters,
        userCount: result.users.length,
      },
      'Admin retrieved user list',
    );

    res.json({
      users: result.users,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching users');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/admin/jobs
 * Get all jobs with pagination (admin only)
 * Query params: page (default 1), limit (default 10)
 */
router.get('/jobs', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const offset = (page - 1) * limit;

    // Filters
    const { user, workspace, status, type, provider, model } = req.query;

    let whereClauses = [];
    let params = [];

    // Filter by User (name or email)
    if (user) {
      whereClauses.push('(u.name LIKE ? OR u.email LIKE ?)');
      params.push(`%${user}%`, `%${user}%`);
    }

    // Filter by Workspace (name)
    if (workspace) {
      whereClauses.push('w.name LIKE ?');
      params.push(`%${workspace}%`);
    }

    // Filter by Status (exact match)
    if (status && status !== 'All') {
      whereClauses.push('j.status = ?');
      params.push(status);
    }

    // Filter by Job Type (exact match)
    if (type && type !== 'All') {
      whereClauses.push('j.type = ?');
      params.push(type);
    }

    // Filter by LLM Provider/Model
    // Since provider/model are in artifacts, we check if ANY artifact associated with this job matches.
    // The link is strictly Job -> Result (JSON) -> Artifact ID -> Artifact Table
    // However, for performance and simplicity in SQLite, we can try to join with artifacts if we can extract ID.
    // Given the complexity of JSON extraction in SQL for an array of artifacts,
    // we will use a subquery that checks `j.result LIKE '%"id":"' || a.id || '"%'` which is a bit hacky but works for JSON strings.
    // A better approach in standard SQL would be JSON_TABLE, but SQLite uses json_each.

    // SQLite JSON approach:
    // EXISTS (SELECT 1 FROM artifacts a, json_each(j.result, '$.artifacts') as ja WHERE a.id = ja.value ->> 'id' AND a.llm_provider = ?)

    if (provider && provider !== 'All') {
      const providerQuery = `
            EXISTS (
                SELECT 1 FROM artifacts a 
                WHERE (
                    j.result LIKE '%' || a.id || '%' 
                )
                AND a.llm_provider = ?
            )
        `;
      whereClauses.push(providerQuery);
      params.push(provider);
    }

    if (model) {
      const modelQuery = `
            EXISTS (
                SELECT 1 FROM artifacts a 
                WHERE (
                    j.result LIKE '%' || a.id || '%' 
                )
                AND a.llm_model LIKE ?
            )
        `;
      whereClauses.push(modelQuery);
      params.push(`%${model}%`);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Count total jobs (with filters)
    const countQueryStr = `
        SELECT COUNT(*) as total 
        FROM jobs j
        LEFT JOIN users u ON j.user_id = u.id
        LEFT JOIN workspaces w ON j.workspace_id = w.id
        ${whereSql}
    `;
    const countResult = db.prepare(countQueryStr).get(...params);
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);

    // Get paginated jobs
    const jobsQueryStr = `
        SELECT 
            j.id,
            j.type,
            j.status,
            j.data,
            j.result,
            j.process_name,
            j.createdAt,
            j.user_id,
            j.workspace_id,
            u.name as user_name,
            u.email as user_email,
            w.name as workspace_name
        FROM jobs j
        LEFT JOIN users u ON j.user_id = u.id
        LEFT JOIN workspaces w ON j.workspace_id = w.id
        ${whereSql}
        ORDER BY j.createdAt DESC
        LIMIT ? OFFSET ?
    `;

    // Execute query to fetch jobs
    const jobs = db.prepare(jobsQueryStr).all(...params, limit, offset);

    // Enrich jobs (same as before)
    const artifactQuery = db.prepare('SELECT llm_provider, llm_model FROM artifacts WHERE id = ?');
    const evidenceQuery = db.prepare('SELECT originalName FROM evidence WHERE id = ?');

    const enrichedJobs = jobs.map((job) => {
      const data = JSON.parse(job.data || '{}');
      const result = JSON.parse(job.result || 'null');

      let llm_provider = null;
      let llm_model = null;
      let artifacts = [];
      let originalName = null;

      if (data.evidenceId) {
        const evidence = evidenceQuery.get(data.evidenceId);
        if (evidence) {
          originalName = evidence.originalName;
        }
      }

      if (result && result.artifacts && Array.isArray(result.artifacts)) {
        artifacts = result.artifacts;
        if (artifacts.length > 0) {
          const firstArtifact = artifactQuery.get(artifacts[0].id);
          if (firstArtifact) {
            llm_provider = firstArtifact.llm_provider;
            llm_model = firstArtifact.llm_model;
          }
        }
      } else if (result && result.artifactId) {
        artifacts = [{ id: result.artifactId, type: 'bpmn' }];
        const artifact = artifactQuery.get(result.artifactId);
        if (artifact) {
          llm_provider = artifact.llm_provider;
          llm_model = artifact.llm_model;
        }
      }

      return {
        id: job.id,
        type: job.type,
        status: job.status,
        processName: job.process_name || data.processName || null,
        originalName: originalName || data.filename || null,
        evidenceId: data.evidenceId || null,
        createdAt: job.createdAt,
        user: {
          id: job.user_id,
          name: job.user_name || 'Unknown',
          email: job.user_email || 'N/A',
        },
        workspace: {
          id: job.workspace_id,
          name: job.workspace_name || 'N/A',
        },
        llm_provider,
        llm_model,
        artifacts,
      };
    });

    logger.info(
      {
        event_type: 'admin_jobs_list',
        actor: req.user.id,
        page,
        limit,
        total,
        filters: { user, workspace, status, type, provider, model },
      },
      'Admin retrieved jobs list with filters',
    );

    res.json({
      jobs: enrichedJobs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching jobs');
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update user role and/or status (admin or superadmin)
 */
router.patch('/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { role, status } = req.body;

    if (id === req.user.id && role && role !== req.user.role) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    if (id === req.user.id && status === 'inactive') {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const updatedUser = authService.updateUser(id, { role, status }, req.user);

    logger.info(
      {
        event_type: 'admin_user_update',
        actor: req.user.id,
        targetUserId: id,
        updates: { role, status },
      },
      'Admin updated user',
    );

    res.json(updatedUser);
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('Invalid')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === authService.SUPERADMIN_ROLE_REQUIRED_ERROR || error.message === authService.SUPERADMIN_ACCOUNT_MANAGEMENT_ERROR) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === authService.LAST_SUPERADMIN_DEACTIVATION_ERROR || error.message === authService.LAST_SUPERADMIN_ROLE_CHANGE_ERROR) {
      return res.status(400).json({ error: error.message });
    }
    return sendErrorResponse(res, error, req);
  }
});

router.post('/users/:id/approve', (req, res) => {
  try {
    const { id } = req.params;
    const updatedUser = authService.approveUser(id);

    notificationService.createNotification(id, 'account_approved', 'Account approved', 'Your account has been approved. You can now sign in.');

    logger.info(
      {
        event_type: 'admin_user_approved',
        actor: req.user.id,
        targetUserId: id,
      },
      'Admin approved user',
    );

    res.json(updatedUser);
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Only pending or rejected users can be approved') {
      return res.status(400).json({ error: error.message });
    }
    return sendErrorResponse(res, error, req);
  }
});

router.post('/users/:id/reject', (req, res) => {
  try {
    const { id } = req.params;
    const updatedUser = authService.rejectUser(id);

    notificationService.createNotification(id, 'account_rejected', 'Registration not approved', 'Your registration was not approved.');

    logger.info(
      {
        event_type: 'admin_user_rejected',
        actor: req.user.id,
        targetUserId: id,
      },
      'Admin rejected user',
    );

    res.json(updatedUser);
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Only pending users can be rejected') {
      return res.status(400).json({ error: error.message });
    }
    return sendErrorResponse(res, error, req);
  }
});

module.exports = router;
