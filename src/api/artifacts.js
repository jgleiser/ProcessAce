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
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

    res.send(artifact.content);
});

module.exports = router;
