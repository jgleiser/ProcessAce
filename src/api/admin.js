const express = require('express');
const authService = require('../services/authService');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const logger = require('../logging/logger');
const db = require('../services/db');

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

    const result = authService.getUsersPaginated(page, limit);

    logger.info(
      {
        event_type: 'admin_users_list',
        actor: req.user.id,
        page,
        limit,
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
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Cap at 100
    const offset = (page - 1) * limit;

    // Count total jobs
    const countResult = db.prepare('SELECT COUNT(*) as total FROM jobs').get();
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);

    // Get paginated jobs with user and workspace info
    const jobsQuery = db.prepare(`
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
            ORDER BY j.createdAt DESC
            LIMIT ? OFFSET ?
        `);

    const jobs = jobsQuery.all(limit, offset);

    // For each job, get LLM info from the first artifact if available
    const artifactQuery = db.prepare('SELECT llm_provider, llm_model FROM artifacts WHERE id = ?');
    // Query to get evidence originalName
    const evidenceQuery = db.prepare('SELECT originalName FROM evidence WHERE id = ?');

    const enrichedJobs = jobs.map((job) => {
      const data = JSON.parse(job.data || '{}');
      const result = JSON.parse(job.result || 'null');

      let llm_provider = null;
      let llm_model = null;
      let artifacts = [];
      let originalName = null;

      // Get original filename from evidence
      if (data.evidenceId) {
        const evidence = evidenceQuery.get(data.evidenceId);
        if (evidence) {
          originalName = evidence.originalName;
        }
      }

      // Get artifacts from result
      if (result && result.artifacts && Array.isArray(result.artifacts)) {
        artifacts = result.artifacts;
        // Get LLM info from first artifact
        if (artifacts.length > 0) {
          const firstArtifact = artifactQuery.get(artifacts[0].id);
          if (firstArtifact) {
            llm_provider = firstArtifact.llm_provider;
            llm_model = firstArtifact.llm_model;
          }
        }
      } else if (result && result.artifactId) {
        // Backward compat for single artifact
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
      },
      'Admin retrieved jobs list',
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
 * Update user role and/or status (admin only)
 */
router.patch('/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { role, status } = req.body;

    // Prevent admin from demoting themselves
    if (id === req.user.id && role && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot change your own admin role' });
    }

    // Prevent admin from deactivating themselves
    if (id === req.user.id && status === 'inactive') {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const updatedUser = authService.updateUser(id, { role, status });

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
    logger.error({ err: error }, 'Error updating user');
    res.status(500).json({ error: 'Failed to update user' });
  }
});

module.exports = router;
