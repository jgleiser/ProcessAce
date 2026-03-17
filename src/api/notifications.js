const express = require('express');
const notificationService = require('../services/notificationService');
const { sendErrorResponse } = require('../utils/errorResponse');

const router = express.Router();

/**
 * GET /api/notifications
 * Get all notifications for the authenticated user, including unread count.
 */
router.get('/', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const notifications = notificationService.getUserNotifications(req.user.id);
    const unreadCount = notificationService.getUnreadCount(req.user.id);
    res.json({ notifications, unreadCount });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = notificationService.markAsRead(id, req.user.id);
    if (!updated) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read for the authenticated user.
 */
router.put('/read-all', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    notificationService.markAllAsRead(req.user.id);
    res.json({ success: true });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a specific notification.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = notificationService.deleteNotification(id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (error) {
    return sendErrorResponse(res, error, req);
  }
});

module.exports = router;
