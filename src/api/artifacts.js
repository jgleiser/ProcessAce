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
    res.setHeader('Content-Type', 'text/xml'); // Assuming BPMN/XML for now
    res.setHeader('Content-Disposition', `attachment; filename="process-${id.substring(0, 8)}.bpmn"`);

    res.send(artifact.content);
});

module.exports = router;
