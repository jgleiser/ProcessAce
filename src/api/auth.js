const express = require('express');
const authService = require('../services/authService');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../logging/logger');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password are required' });
        }

        const user = await authService.registerUser(name, email, password);
        res.status(201).json(user);
    } catch (error) {
        if (error.message === 'User already exists') {
            return res.status(409).json({ error: 'User already exists' });
        }
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const { user, token } = await authService.authenticateUser(email, password);

        // Set HTTP-only cookie
        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({ message: 'Login successful', user });
    } catch (error) {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ message: 'Logged out successfully' });
});

// Get Current User (Protected)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = authService.getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Update Current User Profile
router.put('/me', authenticateToken, async (req, res) => {
    try {
        const { name, password, currentPassword } = req.body;
        const updatedUser = await authService.updateUserProfile(req.user.id, { name, password, currentPassword });
        res.json(updatedUser);
    } catch (error) {
        logger.error({ err: error }, 'Failed to update profile');
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
