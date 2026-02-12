const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const logger = require('../logging/logger');

class NotificationService {
  /**
   * Create a notification
   * @param {string} userId
   * @param {string} type
   * @param {string} title
   * @param {string} message
   * @param {object} data
   */
  createNotification(userId, type, title, message, data = {}) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const dataStr = JSON.stringify(data);

    try {
      db.prepare(
        `
                INSERT INTO notifications (id, user_id, type, title, message, data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
      ).run(id, userId, type, title, message, dataStr, now);
      return { id, userId, type, title, message, data, isRead: 0, createdAt: now };
    } catch (error) {
      logger.error({ err: error }, 'Error creating notification');
      throw error;
    }
  }

  /**
   * Get user notifications
   * @param {string} userId
   */
  getUserNotifications(userId) {
    const rows = db
      .prepare(
        `
            SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC
        `,
      )
      .all(userId);

    return rows.map((row) => {
      const notif = {
        ...row,
        data: JSON.parse(row.data),
        is_read: !!row.is_read,
      };

      // If it's a workspace invite, check the status
      if (notif.type === 'workspace_invite' && notif.data && notif.data.token) {
        try {
          const invite = db
            .prepare('SELECT status FROM workspace_invitations WHERE token = ?')
            .get(notif.data.token);
          notif.data.inviteStatus = invite ? invite.status : 'deleted';
        } catch (err) {
          logger.error({ err }, 'Error checking invitation status for notification');
          notif.data.inviteStatus = 'unknown';
        }
      }

      return notif;
    });
  }

  /**
   * Mark notification as read
   * @param {string} id
   */
  markAsRead(id) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
  }

  /**
   * Mark all user notifications as read
   * @param {string} userId
   */
  markAllAsRead(userId) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  }

  /**
   * Delete a notification
   * @param {string} id
   */
  deleteNotification(id) {
    db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
  }

  /**
   * Remove workspace invitations for a specific workspace
   * @param {string} userId
   * @param {string} workspaceId
   */
  removeWorkspaceInvitations(userId, workspaceId) {
    const notifications = this.getUserNotifications(userId);

    notifications.forEach((notif) => {
      if (
        notif.type === 'workspace_invite' &&
        notif.data &&
        notif.data.workspaceId === workspaceId
      ) {
        this.deleteNotification(notif.id);
      }
    });
  }

  /**
   * Get unread count
   * @param {string} userId
   */
  getUnreadCount(userId) {
    const result = db
      .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(userId);
    return result.count;
  }
}

module.exports = new NotificationService();
