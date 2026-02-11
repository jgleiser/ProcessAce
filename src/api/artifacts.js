const express = require('express');
const router = express.Router();
const { getArtifact } = require('../models/artifact');

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

    const downloadName = artifact.filename || `process-${id.substring(0, 8)}.${artifact.metadata.extension || 'txt'}`;

    // If ?view=true is present, do NOT set Content-Disposition attachment
    // This allows the browser/fetch to read it inline
    if (req.query.view !== 'true') {
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    }

    res.send(artifact.content);
});

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

    res.json({ success: true });
});

module.exports = router;
