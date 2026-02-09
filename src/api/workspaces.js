const express = require('express');
const workspaceService = require('../services/workspaceService');
const logger = require('../logging/logger');

const router = express.Router();

// Get user's workspaces
router.get('/', async (req, res) => {
    try {
        const workspaces = workspaceService.getUserWorkspaces(req.user.id);
        res.json(workspaces);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch workspaces' });
    }
});

// Create workspace
router.post('/', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        const workspace = await workspaceService.createWorkspace(name, req.user.id);
        res.status(201).json(workspace);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create workspace' });
    }
});

module.exports = router;
