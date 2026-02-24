/* global apiClient */

/**
 * Shared Header Logic & Template
 * Handles HTML injection, User Menu Dropdown, Auth Display, and Language Switcher
 */

const HeaderTemplate = `
<header class="page-header">
  <a href="/" class="header-brand">
    <img src="images/ProcessAce-w-100x100.png" alt="ProcessAce Logo" width="32" height="32">
    <h1>ProcessAce</h1>
  </a>
  <div class="header-controls">
    <!-- Workspace Selector (Hidden by default, enabled by app.js on dashboard) -->
    <div class="workspace-selector hidden" id="workspaceSelector">
      <!-- View Mode (default) -->
      <div id="workspaceViewMode" class="workspace-view-mode">
        <span class="ws-label" data-i18n="header.workspace">Workspace:</span>
        <span id="currentWorkspaceName" class="ws-name">Loading...</span>
        <a href="#" id="changeWorkspaceLink" class="ws-change-link" data-i18n="header.changeWorkspace">Change</a>
      </div>
      <!-- Edit Mode (hidden by default) -->
      <div id="workspaceEditMode" class="workspace-edit-mode hidden">
        <span class="ws-label" data-i18n="header.workspace">Workspace:</span>
        <select id="workspaceSelect" class="ws-select">
          <option value="">Loading...</option>
        </select>
        <input type="text" id="newWorkspaceInput" placeholder="New workspace name..." class="ws-new-input hidden" />
        <button id="workspaceActionBtn" class="btn-primary ws-action-btn" data-i18n="workspace.selectBtn">
          Select
        </button>
        <a href="#" id="cancelWorkspaceLink" class="ws-cancel-link" data-i18n="header.cancelChange">Cancel</a>
      </div>
    </div>

    <!-- Language Switcher -->
    <div class="lang-switcher-container" id="langSwitcher">
      <button id="langSwitcherBtn" class="lang-switcher-btn" title="Change Language">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
          <path d="M2 12h20M12 2c2.5 2.5 4 5.5 4 10s-1.5 7.5-4 10c-2.5-2.5-4-5.5-4-10s1.5-7.5 4-10z" stroke="currentColor" stroke-width="2"/>
        </svg>
        <span id="currentLangLabel">EN</span>
      </button>
      <div id="langDropdown" class="lang-dropdown hidden">
        <button class="lang-option" data-lang="en">
          <span>English</span>
          <span class="lang-check hidden" id="langCheckEn">✓</span>
        </button>
        <button class="lang-option" data-lang="es">
          <span>Español</span>
          <span class="lang-check hidden" id="langCheckEs">✓</span>
        </button>
      </div>
    </div>

    <div class="user-menu-container">
      <button id="userMenuBtn" class="user-menu-btn">
        <span id="userDisplay">Loading...</span>
        <span>▼</span>
      </button>
      <div id="userDropdown" class="user-dropdown hidden">
        <a href="/user-settings.html" data-i18n="header.userSettings">User Settings</a>
        <a href="/workspace-settings.html" id="workspaceSettingsLink" data-i18n="header.workspaceSettings">Workspace Settings</a>
        <div id="adminOptionsHeader" class="admin-options-header hidden" data-i18n="header.adminOptions">Admin options</div>
        <a href="/admin-users.html" id="adminLink" class="hidden" data-i18n="header.users">Users</a>
        <a href="/admin-jobs.html" id="adminJobsLink" class="hidden" data-i18n="header.jobsDashboard">Jobs Dashboard</a>
        <a href="/app-settings.html" id="appSettingsLink" class="hidden" data-i18n="header.appSettings">App Settings</a>
        <button id="logoutBtn" data-i18n="header.logout">Logout</button>
      </div>
    </div>
  </div>
</header>
`;

function injectHeader() {
  const customHeader = document.getElementById('app-header');

  if (customHeader) {
    customHeader.innerHTML = HeaderTemplate;
  }
}

/**
 * Sets up the language switcher dropdown toggle, option clicks, and checkmark updates.
 */
function setupLanguageSwitcher() {
  const langBtn = document.getElementById('langSwitcherBtn');
  const langDropdown = document.getElementById('langDropdown');
  const currentLangLabel = document.getElementById('currentLangLabel');

  if (!langBtn || !langDropdown) return;

  // Toggle dropdown
  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langDropdown.classList.toggle('hidden');
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!langBtn.contains(e.target) && !langDropdown.contains(e.target)) {
      langDropdown.classList.add('hidden');
    }
  });

  // Handle option clicks
  langDropdown.querySelectorAll('.lang-option').forEach((option) => {
    option.addEventListener('click', () => {
      const lang = option.dataset.lang;
      if (window.i18n) {
        window.i18n.setLanguage(lang);
      }
      langDropdown.classList.add('hidden');
    });
  });

  // Update active state
  function updateLangDisplay() {
    const lang = window.i18n ? window.i18n.currentLang : 'en';
    if (currentLangLabel) currentLangLabel.textContent = lang.toUpperCase();

    // Update checkmarks
    const checkEn = document.getElementById('langCheckEn');
    const checkEs = document.getElementById('langCheckEs');
    if (checkEn) checkEn.classList.toggle('hidden', lang !== 'en');
    if (checkEs) checkEs.classList.toggle('hidden', lang !== 'es');
  }

  updateLangDisplay();

  // Listen for language changes
  document.addEventListener('languageChanged', updateLangDisplay);
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inject Header HTML
  injectHeader();

  // 2. Initialize i18n (loads translations, detects language, translates page)
  if (window.i18n) {
    await window.i18n.init();
  }

  // 3. Setup Language Switcher
  setupLanguageSwitcher();

  // 4. Select Elements (now that they exist)
  const userDisplay = document.getElementById('userDisplay');
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userDropdown = document.getElementById('userDropdown');
  const logoutBtn = document.getElementById('logoutBtn');
  const adminLink = document.getElementById('adminLink');
  const adminJobsLink = document.getElementById('adminJobsLink');
  const appSettingsLink = document.getElementById('appSettingsLink');
  const adminOptionsHeader = document.getElementById('adminOptionsHeader');

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
    notifBtn.title = window.i18n ? window.i18n.t('header.viewNotifications') : 'View Notifications';
    notifBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z" fill="currentColor"/>
            </svg>
        `;

    const badge = document.createElement('span');
    badge.className = 'notification-badge hidden';
    notifBtn.appendChild(badge);

    notifContainer.appendChild(notifBtn);

    // Insert before lang switcher or user menu
    const langSwitcher = document.getElementById('langSwitcher');
    const userMenuContainer = document.querySelector('.user-menu-container');
    if (headerControls && langSwitcher) {
      headerControls.insertBefore(notifContainer, langSwitcher);
    } else if (headerControls && userMenuContainer) {
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
        if (adminLink) adminLink.classList.remove('hidden');
        if (adminJobsLink) adminJobsLink.classList.remove('hidden');
        if (appSettingsLink) appSettingsLink.classList.remove('hidden');
        if (adminOptionsHeader) adminOptionsHeader.classList.remove('hidden');
      } else {
        // Redirect non-admins if they are on an admin page
        const adminPages = ['/admin-jobs.html', '/admin-users.html', '/app-settings.html'];
        if (adminPages.includes(window.location.pathname)) {
          window.location.href = '/';
          return;
        }
      }

      // Setup Notifications
      setupNotifications();
    } else {
      // Not authenticated - redirect to login unless on public page
      if (
        window.location.pathname !== '/login.html' &&
        window.location.pathname !== '/register.html'
      ) {
        window.location.href = '/login.html';
      }
    }
  } catch (err) {
    console.error('Auth verification failed', err);
  }
});
