/* global showToast */
const t = window.i18n ? window.i18n.t : (k) => k;
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('notificationsContainer');
  const markAllReadBtn = document.getElementById('markAllReadBtn');

  // Load notifications
  const loadNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error('Failed to load notifications');

      const { notifications, unreadCount } = await res.json();
      renderNotifications(notifications);

      // Update button state
      if (unreadCount === 0) {
        markAllReadBtn.disabled = true;
        markAllReadBtn.style.opacity = '0.5';
      } else {
        markAllReadBtn.disabled = false;
        markAllReadBtn.style.opacity = '1';
      }
    } catch (error) {
      console.error(error);
      container.innerHTML = `<div class="text-center text-muted">${t('notifications.loadFailed')}</div>`;
    }
  };

  // Render notifications
  const renderNotifications = (notifications) => {
    container.innerHTML = '';

    const filteredNotifications = notifications.filter((notif) => {
      if (
        notif.type === 'workspace_invite' &&
        notif.data &&
        (notif.data.inviteStatus === 'accepted' || notif.data.inviteStatus === 'declined')
      ) {
        return false;
      }
      return true;
    });

    if (filteredNotifications.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>${t('notifications.noNotifications')}</p>
          <small>${t('notifications.noNotificationsDesc')}</small>
        </div>
      `;
      return;
    }

    filteredNotifications.forEach((notif) => {
      const card = document.createElement('div');
      card.className = `notification-card ${notif.is_read ? '' : 'unread'}`;
      card.id = `notification-${notif.id}`;

      let actionsHtml = '';

      // Customize actions based on type
      if (notif.type === 'workspace_invite' && notif.data && notif.data.token) {
        // Check if it's already accepted/declined locally or just show actions
        // Since we don't track invite status in notification table, we rely on the API action
        // But we can hide actions if the notification is read? No, user might read it but act later.
        // Ideally we'd check invite status, but let's just show buttons.

        actionsHtml = `
                    <div class="notification-actions">
                        <button class="btn-primary btn-accept" data-token="${notif.data.token}" data-id="${notif.id}">Accept</button>
                        <button class="btn-secondary btn-decline" data-token="${notif.data.token}" data-id="${notif.id}">Decline</button>
                    </div>
                 `;
      }

      card.innerHTML = `
                <div class="notification-content">
                    <h3>${notif.title}</h3>
                    <p>${notif.message}</p>
                    <div class="notification-meta">${new Date(notif.created_at).toLocaleString()}</div>
                </div>
                ${actionsHtml}
            `;

      container.appendChild(card);
    });

    // Event Listeners
    document.querySelectorAll('.btn-accept').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const token = e.target.dataset.token;
        const id = e.target.dataset.id;
        await handleAction(id, `/api/invitations/${token}/accept`, 'POST');
      });
    });

    document.querySelectorAll('.btn-decline').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const token = e.target.dataset.token;
        const id = e.target.dataset.id;

        const confirmed = await window.showConfirmModal(
          t('notifications.declineConfirm'),
          t('notifications.declineConfirmTitle'),
          t('notifications.declineYes'),
          t('common.cancel'),
        );

        if (confirmed) {
          await handleAction(id, `/api/invitations/${token}/decline`, 'POST', `notification-${id}`);
        }
      });
    });
  };

  const handleAction = async (notificationId, url, method, removeId = null) => {
    try {
      const res = await fetch(url, { method });
      if (res.ok) {
        // Mark as read
        await fetch(`/api/notifications/${notificationId}/read`, { method: 'PUT' });

        // If accepted, redirect to dashboard
        if (url.includes('accept')) {
          showToast(t('notifications.acceptedRedirect'), 'success');
          setTimeout(() => (window.location.href = '/'), 1000);
        } else {
          showToast(t('notifications.declinedMsg'), 'info');

          if (removeId) {
            const el = document.getElementById(removeId);
            if (el) {
              el.remove();
              // Check if list is empty
              if (container.children.length === 0) {
                container.innerHTML = `
                                    <div class="empty-notifications">
                                        <h3>No notifications yet</h3>
                                        <p>When you subscribe to updates or get invited to workspaces, they'll show up here.</p>
                                    </div>
                                `;
              }
            } else {
              loadNotifications(); // Fallback
            }
          } else {
            loadNotifications(); // Reload
          }
        }
      } else {
        const err = await res.json();
        showToast(err.error || 'Action failed', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('An error occurred', 'error');
    }
  };

  // Mark all as read
  markAllReadBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'PUT' });
      loadNotifications();
    } catch (error) {
      console.error(error);
    }
  });

  loadNotifications();
});
