const express = require('express');
const router = express.Router();
const {
  getArtifact,
  getArtifactVersionHistory,
  getArtifactVersion,
} = require('../models/artifact');

/**
 * GET /api/artifacts/:id/content
 * Download or view an artifact's content. Set ?view=true for inline display.
 */
router.get('/:id/content', async (req, res) => {
  const { id } = req.params;
  const artifact = await getArtifact(id);

  if (!artifact) {
    return res.status(404).json({ error: 'Artifact not found' });
  }

  // Set headers for file download
  // Infer mime type
  let mimeType = 'text/plain';
  if (artifact.type === 'bpmn') mimeType = 'text/xml';
  if (artifact.type === 'sipoc' || artifact.type === 'raci') mimeType = 'application/json';
  if (artifact.type === 'doc') mimeType = 'text/markdown';

  res.setHeader('Content-Type', mimeType);

  const downloadName =
    artifact.filename || `process-${id.substring(0, 8)}.${artifact.metadata.extension || 'txt'}`;

  // If ?view=true is present, do NOT set Content-Disposition attachment
  // This allows the browser/fetch to read it inline
  if (req.query.view !== 'true') {
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  }

  res.send(artifact.content);
});

/**
 * PUT /api/artifacts/:id/content
 * Update an artifact's content. Requires edit permissions.
 */
router.put('/:id/content', async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const { updateArtifact } = require('../models/artifact');

  // Authorization Check
  const artifact = await getArtifact(id);
  if (!artifact) {
    return res.status(404).json({ error: 'Artifact not found' });
  }

  // Check permissions
  // Allow if Creator (user_id matches)
  let canEdit = false;
  if (artifact.user_id && artifact.user_id === req.user.id) {
    canEdit = true;
  }

  // OR if Admin/Editor/Owner in workspace
  if (!canEdit && artifact.workspace_id) {
    const workspaceService = require('../services/workspaceService');
    const role = workspaceService.getMemberRole(artifact.workspace_id, req.user.id);
    if (['admin', 'editor', 'owner'].includes(role)) {
      canEdit = true;
    }
  }

  if (!canEdit) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Ensure content is a string for SQLite
  const contentToSave = typeof content === 'object' ? JSON.stringify(content) : content;

  const success = await updateArtifact(id, contentToSave);

  if (!success) {
    return res.status(404).json({ error: 'Artifact not found' });
  }

  const updatedArtifact = await getArtifact(id);
  const logger = require('../logging/logger');
  logger.info(
    {
      event_type: 'artifact_version_updated',
      artifact_type: updatedArtifact.type,
      artifact_id: updatedArtifact.id,
      version: updatedArtifact.version,
      created_by: req.user.id,
      previous_version: artifact.version,
    },
    'Artifact version updated',
  );

  res.json({ success: true, version: updatedArtifact.version });
});

/**
 * GET /api/artifacts/:id/versions
 * Get the version history of an artifact
 */
router.get('/:id/versions', async (req, res) => {
  const { id } = req.params;

  const artifact = await getArtifact(id);
  if (!artifact) {
    return res.status(404).json({ error: 'Artifact not found' });
  }

  // Authorization Check
  let canView = false;
  if (artifact.user_id && artifact.user_id === req.user.id) {
    canView = true;
  }
  if (!canView && artifact.workspace_id) {
    const workspaceService = require('../services/workspaceService');
    const role = workspaceService.getMemberRole(artifact.workspace_id, req.user.id);
    if (['admin', 'editor', 'owner', 'viewer'].includes(role)) {
      canView = true;
    }
  }

  if (!canView) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const history = await getArtifactVersionHistory(id);
  res.json(history);
});

/**
 * GET /api/artifacts/:id/versions/:version/content
 * View a specific version of an artifact
 */
router.get('/:id/versions/:version/content', async (req, res) => {
  const { id, version } = req.params;
  const artifact = await getArtifactVersion(id, parseInt(version, 10));

  if (!artifact) {
    return res.status(404).json({ error: 'Artifact version not found' });
  }

  // Authorization Check
  let canView = false;
  if (artifact.user_id && artifact.user_id === req.user.id) {
    canView = true;
  }
  if (!canView && artifact.workspace_id) {
    const workspaceService = require('../services/workspaceService');
    const role = workspaceService.getMemberRole(artifact.workspace_id, req.user.id);
    if (['admin', 'editor', 'owner', 'viewer'].includes(role)) {
      canView = true;
    }
  }

  if (!canView) {
    return res.status(403).json({ error: 'Access denied' });
  }

  let mimeType = 'text/plain';
  if (artifact.type === 'bpmn') mimeType = 'text/xml';
  if (artifact.type === 'sipoc' || artifact.type === 'raci') mimeType = 'application/json';
  if (artifact.type === 'doc') mimeType = 'text/markdown';

  res.setHeader('Content-Type', mimeType);

  const downloadName =
    artifact.filename ||
    `process-${id.substring(0, 8)}-v${version}.${artifact.metadata.extension || 'txt'}`;

  if (req.query.view !== 'true') {
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  }

  res.send(artifact.content);
});

module.exports = router;
