const express = require('express');
const HTMLtoDOCX = require('html-to-docx');
const sanitizeHtml = require('sanitize-html');
const { marked } = require('marked');
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

/**
 * GET /api/artifacts/:id/export/docx
 * Parses a Markdown doc artifact to HTML, sanitizes it, then compiles a DOCX
 * buffer and streams it as a file download.
 */
router.get('/:id/export/docx', async (req, res) => {
  const logger = require('../logging/logger');
  const { id } = req.params;

  const artifact = await getArtifact(id);
  if (!artifact) {
    return res.status(404).json({ error: 'Artifact not found' });
  }
  if (artifact.type !== 'doc') {
    return res
      .status(400)
      .json({ error: 'Only narrative document artifacts can be exported to DOCX' });
  }

  // Authorization check — same pattern as other endpoints in this router
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

  try {
    // 1. Markdown → HTML
    const rawHtml = marked.parse(artifact.content);

    // 2. Sanitize: strip any <script>, <iframe>, or on* handlers before compilation
    const cleanHtml = sanitizeHtml(rawHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'img',
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt', 'width', 'height'],
      },
    });

    // 3. Wrap in a well-formed HTML document so html-to-docx maps styles/fonts correctly
    // No indentation or newlines are used because html-to-docx parses whitespace between tags as empty paragraphs
    const htmlDocument = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>body { font-family: "Calibri", sans-serif; font-size: 11pt; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid black; padding: 4px; } h1, h2, h3 { page-break-after: avoid; }</style></head><body>${cleanHtml.trim()}</body></html>`;

    // 4. Compile to DOCX buffer (margins in TWIPs; 1440 TWIPs = 1 inch, 720 = 0.5 inch)
    // We must provide header, footer, and gutter to avoid html-to-docx
    // injecting invalid 'undefined' strings into the OpenXML markup.
    const docxBuffer = await HTMLtoDOCX(htmlDocument, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
      title: artifact.filename || 'Process Document',
      margins: {
        top: 1440,
        right: 1440,
        bottom: 1440,
        left: 1440,
        header: 720,
        footer: 720,
        gutter: 0,
      },
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="document-${id}.docx"`);
    res.setHeader('Content-Length', docxBuffer.length);
    res.send(docxBuffer);

    logger.info(
      {
        event_type: 'artifact_exported',
        export_format: 'docx',
        artifact_type: artifact.type,
        artifact_id: id,
        actor: req.user.id,
      },
      'Artifact exported to DOCX',
    );
  } catch (error) {
    logger.error(
      {
        event_type: 'error',
        error_type: 'docx_compilation_error',
        message: error.message,
        stack: error.stack,
        artifact_id: id,
      },
      'DOCX compilation failed',
    );
    res.status(500).json({ error: 'Internal server error during document generation.' });
  }
});

module.exports = router;
