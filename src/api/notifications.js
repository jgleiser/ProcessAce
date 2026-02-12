const express = require('express');
const notificationService = require('../services/notificationService');
const logger = require('../logging/logger');

const router = express.Router();

// Get my notifications
router.get('/', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const notifications = notificationService.getUserNotifications(req.user.id);
    const unreadCount = notificationService.getUnreadCount(req.user.id);
    res.json({ notifications, unreadCount });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching notifications');
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark as read
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    notificationService.markAsRead(id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error marking notification as read');
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Mark all as read
router.put('/read-all', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    notificationService.markAllAsRead(req.user.id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error marking all as read');
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    notificationService.deleteNotification(id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting notification');
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;
