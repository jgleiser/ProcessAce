/* global apiClient */
/**
 * Shared Header Logic
 * Handles User Menu Dropdown and Auth Display
 */
document.addEventListener('DOMContentLoaded', async () => {
  const userDisplay = document.getElementById('userDisplay');
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userDropdown = document.getElementById('userDropdown');
  const logoutBtn = document.getElementById('logoutBtn');
  const adminLink = document.getElementById('adminLink');
  const adminJobsLink = document.getElementById('adminJobsLink');
  const appSettingsLink = document.getElementById('appSettingsLink');

  const headerControls = document.querySelector('.header-controls');

  // Toggle Dropdown
  if (userMenuBtn && userDropdown) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('hidden');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.classList.add('hidden');
      }
    });
  }

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await apiClient.post('/api/auth/logout');
        window.location.href = '/login.html';
      } catch (err) {
        console.error('Logout failed', err);
      }
    });
  }

  // Notification Logic
  const setupNotifications = async () => {
    // Check if widget already exists
    if (document.querySelector('.notification-container')) return;

    // Create notification elements
    const notifContainer = document.createElement('div');
    notifContainer.className = 'notification-container';

    const notifBtn = document.createElement('button');
    notifBtn.className = 'notification-btn';
    notifBtn.title = 'View Notifications';
    notifBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z" fill="currentColor"/>
            </svg>
        `;

    const badge = document.createElement('span');
    badge.className = 'notification-badge hidden';
    notifBtn.appendChild(badge);

    notifContainer.appendChild(notifBtn);

    // Insert before user menu
    const userMenuContainer = document.querySelector('.user-menu-container');
    if (headerControls && userMenuContainer) {
      headerControls.insertBefore(notifContainer, userMenuContainer);
    } else if (headerControls) {
      headerControls.appendChild(notifContainer);
    }

    // Redirect on click
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = '/notifications.html';
    });

    // Fetch unread count
    const updateUnreadCount = async () => {
      try {
        const { unreadCount } = await apiClient.get('/api/notifications');
        if (unreadCount > 0) {
          badge.textContent = ''; // Just a dot
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      } catch (err) {
        console.error('Error loading notifications', err);
      }
    };

    updateUnreadCount();

    // Poll every minute
    setInterval(updateUnreadCount, 60000);
  };

  // Auth Check & UI Update
  try {
    const user = await apiClient.get('/api/auth/me');
    if (user) {
      if (userDisplay) userDisplay.textContent = user.email;

      // Show Admin Links
      if (user.role === 'admin') {
        if (adminLink) adminLink.style.display = 'block';
        if (adminJobsLink) adminJobsLink.style.display = 'block';
        if (appSettingsLink) appSettingsLink.style.display = 'block';
      }

      // Setup Notifications
      setupNotifications();
    } else {
      // Not authenticated - redirect to login unless on public page
      if (
        window.location.pathname !== '/login.html' &&
        window.location.pathname !== '/register.html' &&
        window.location.pathname !== '/accept-invite.html'
      ) {
        window.location.href = '/login.html';
      }
    }
  } catch (err) {
    console.error('Auth verification failed', err);
  }
});
