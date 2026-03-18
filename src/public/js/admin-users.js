let currentPage = 1;
let currentLimit = 10;
let totalPages = 1;
let currentUserId = null;
let currentUserRole = null;
let originalUserData = {};
const t = window.i18n ? window.i18n.t.bind(window.i18n) : (k) => k;

const paginationContainer = document.getElementById('paginationContainer');
const paginationInfo = document.getElementById('paginationInfo');
const paginationControls = document.getElementById('paginationControls');
const limitSelect = document.getElementById('limitSelect');
const filterName = document.getElementById('filterName');
const filterEmail = document.getElementById('filterEmail');
const filterStatus = document.getElementById('filterStatus');
const filterRole = document.getElementById('filterRole');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');

const isAdminRole = (role) => role === 'admin' || role === 'superadmin';
const isCurrentUserSuperadmin = () => currentUserRole === 'superadmin';

const getRoleLabel = (role) => {
  const roleKeyMap = {
    superadmin: 'common.superadmin',
    admin: 'common.admin',
    editor: 'common.editor',
    viewer: 'common.viewer',
  };

  return t(roleKeyMap[role] || 'common.user');
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }

    const user = await response.json();
    currentUserId = user.id;
    currentUserRole = user.role;

    if (!isAdminRole(user.role)) {
      showError(t('common.accessDenied'));
      document.getElementById('loadingState').classList.add('hidden');
      return;
    }

    limitSelect.value = currentLimit;
    loadUsers(currentPage, currentLimit);

    document.getElementById('saveAllBtn').addEventListener('click', saveAllChanges);

    limitSelect.addEventListener('change', (e) => {
      currentLimit = parseInt(e.target.value, 10);
      currentPage = 1;
      loadUsers(currentPage, currentLimit);
    });

    paginationControls.addEventListener('click', (e) => {
      const btn = e.target.closest('.page-btn');
      if (btn && !btn.disabled) {
        const page = parseInt(btn.dataset.page, 10);
        if (!Number.isNaN(page)) {
          goToPage(page);
        }
      }
    });

    setupFilters();
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/login.html';
  }
});

async function loadUsers(page = 1, limit = 10) {
  try {
    const loading = document.getElementById('loadingState');
    const table = document.getElementById('usersTable');
    const pagContainer = document.getElementById('paginationContainer');

    loading.classList.remove('hidden');
    table.classList.add('hidden');
    pagContainer.classList.add('hidden');

    const filters = getFilters();
    const queryParams = new URLSearchParams({
      page,
      limit,
      ...filters,
    });

    const response = await fetch(`/api/admin/users?${queryParams.toString()}`);
    if (!response.ok) {
      if (response.status === 403) {
        showError(t('common.accessDenied'));
        return;
      }
      throw new Error('Failed to fetch users');
    }

    const data = await response.json();
    const users = data.users || data;
    const pagination = data.pagination || {
      page: 1,
      limit: 10,
      total: users.length,
      totalPages: 1,
    };

    currentPage = pagination.page;
    currentLimit = pagination.limit;
    totalPages = pagination.totalPages;

    renderUsersTable(users);
    renderPagination(pagination);
  } catch (error) {
    console.error('Error loading users. Details:', error);
    showError(`Failed to load users: ${error.message}`);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  const table = document.getElementById('usersTable');
  const loading = document.getElementById('loadingState');

  loading.classList.add('hidden');
  table.classList.remove('hidden');

  tbody.innerHTML = users
    .map((user) => {
      originalUserData[user.id] = { status: user.status, role: user.role };
      const isCurrentUser = user.id === currentUserId;
      const canManagePrivilegedUser = isCurrentUserSuperadmin() || !isAdminRole(user.role);
      const canEditRole = !isCurrentUser && canManagePrivilegedUser;
      const canEditStatus = !isCurrentUser && canManagePrivilegedUser && !['pending', 'rejected'].includes(user.status);
      const createdDate = new Date(user.created_at).toLocaleDateString();
      const statusLabelKey = user.status === 'rejected' ? 'common.rejected' : `common.${user.status}`;
      const roleOptions = isCurrentUserSuperadmin() ? ['superadmin', 'admin', 'editor', 'viewer'] : ['editor', 'viewer'];

      const roleCell = canEditRole
        ? `
            <select class="role-select" data-field="role" data-user-id="${user.id}">
              ${roleOptions
                .map(
                  (roleOption) =>
                    `<option value="${roleOption}" ${user.role === roleOption ? 'selected' : ''}>${escapeHtml(getRoleLabel(roleOption))}</option>`,
                )
                .join('')}
            </select>
          `
        : `<span class="user-row-muted">${escapeHtml(getRoleLabel(user.role))}</span>`;

      const statusCell =
        user.status === 'pending' || user.status === 'rejected'
          ? `
              <span class="status-badge status-badge-${user.status}">
                ${t(statusLabelKey)}
              </span>
            `
          : canEditStatus
            ? `
              <select class="status-select" data-field="status" data-user-id="${user.id}">
                <option value="active" ${user.status === 'active' ? 'selected' : ''}>${t('common.active')}</option>
                <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>${t('common.inactive')}</option>
              </select>
            `
            : `<span class="user-row-muted">${escapeHtml(t(statusLabelKey))}</span>`;

      const actionButtons = isCurrentUser
        ? `<span class="user-row-muted">${escapeHtml(t('adminUsers.currentUserLocked'))}</span>`
        : user.status === 'pending'
          ? `
              <div class="user-row-actions">
                <button class="btn-primary btn-sm approve-user-btn" data-user-id="${user.id}">${t('adminUsers.approveUser')}</button>
                <button class="btn-secondary btn-sm reject-user-btn" data-user-id="${user.id}">${t('adminUsers.rejectUser')}</button>
              </div>
            `
          : user.status === 'rejected'
            ? `
              <div class="user-row-actions">
                <button class="btn-primary btn-sm approve-user-btn" data-user-id="${user.id}">${t('adminUsers.approveUser')}</button>
              </div>
            `
            : '<span class="user-row-muted">-</span>';

      return `
        <tr data-user-id="${user.id}">
          <td>
            <span class="user-name">${escapeHtml(user.name || 'N/A')}</span>
            ${isCurrentUser ? `<span class="you-badge">${t('adminUsers.youBadge')}</span>` : ''}
          </td>
          <td class="user-email">${escapeHtml(user.email)}</td>
          <td>${statusCell}</td>
          <td>${roleCell}</td>
          <td class="user-date">${createdDate}</td>
          <td>${actionButtons}</td>
        </tr>
      `;
    })
    .join('');

  document.querySelectorAll('.status-select, .role-select').forEach((select) => {
    select.addEventListener('change', updateSaveButton);
  });

  document.querySelectorAll('.approve-user-btn').forEach((button) => {
    button.addEventListener('click', () => {
      updateUserRegistrationStatus(button.dataset.userId, 'approve');
    });
  });

  document.querySelectorAll('.reject-user-btn').forEach((button) => {
    button.addEventListener('click', () => {
      updateUserRegistrationStatus(button.dataset.userId, 'reject');
    });
  });
}

function getPendingChanges() {
  const changes = [];

  document.querySelectorAll('tr[data-user-id]').forEach((row) => {
    const userId = row.dataset.userId;
    const statusSelect = row.querySelector('.status-select');
    const roleSelect = row.querySelector('.role-select');
    const original = originalUserData[userId];
    const updates = {};

    if (!original) {
      return;
    }

    if (statusSelect && statusSelect.value !== original.status) {
      updates.status = statusSelect.value;
    }
    if (roleSelect && roleSelect.value !== original.role) {
      updates.role = roleSelect.value;
    }

    if (Object.keys(updates).length > 0) {
      changes.push({ userId, updates });
    }
  });

  return changes;
}

async function updateUserRegistrationStatus(userId, action) {
  try {
    const response = await fetch(`/api/admin/users/${userId}/${action}`, {
      method: 'POST',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || t('adminUsers.statusActionFailed'));
    }

    showToast(action === 'approve' ? t('adminUsers.userApproved') : t('adminUsers.userRejected'), 'success');
    await loadUsers(currentPage, currentLimit);
    updateSaveButton();
  } catch (error) {
    console.error(`Error executing ${action} for user ${userId}:`, error);
    showToast(error.message || t('adminUsers.statusActionFailed'), 'error');
  }
}

function updateSaveButton() {
  const changes = getPendingChanges();
  const saveBtn = document.getElementById('saveAllBtn');
  const countSpan = document.getElementById('changesCount');

  if (changes.length > 0) {
    saveBtn.disabled = false;
    countSpan.textContent = t('adminUsers.unsavedChanges', { count: changes.length });
  } else {
    saveBtn.disabled = true;
    countSpan.textContent = '';
  }
}

async function saveAllChanges() {
  const changes = getPendingChanges();
  if (changes.length === 0) return;

  const saveBtn = document.getElementById('saveAllBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = t('adminUsers.savingChanges');

  let successCount = 0;
  let errorMessages = [];

  for (const { userId, updates } of changes) {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update user');
      }

      const updatedUser = await response.json();
      originalUserData[userId] = { status: updatedUser.status, role: updatedUser.role };
      successCount += 1;
    } catch (error) {
      console.error(`Error updating user ${userId}:`, error);
      errorMessages.push(error.message);
    }
  }

  saveBtn.textContent = t('adminUsers.saveChanges');
  updateSaveButton();

  if (errorMessages.length > 0) {
    showToast(`${successCount} saved, ${errorMessages.length} failed: ${errorMessages[0]}`, 'error');
  } else {
    showToast(t('adminUsers.changesSaved'), 'success');
  }

  await loadUsers(currentPage, currentLimit);
}

function showError(message) {
  const container = document.getElementById('errorContainer');
  const dismissLabel = t('common.close');

  container.innerHTML = `
    <div class="settings-message settings-message-error">
      <div class="settings-message-content">${escapeHtml(message)}</div>
      <button type="button" class="notification-dismiss" aria-label="${escapeHtml(dismissLabel)}">&times;</button>
    </div>
  `;

  const dismissButton = container.querySelector('.notification-dismiss');
  dismissButton?.addEventListener('click', () => {
    container.innerHTML = '';
  });

  if (typeof globalThis.showToast === 'function' && globalThis.showToast !== showToast) {
    globalThis.showToast(message, 'error');
  }
}

function showToast(message, type = 'success') {
  if (typeof globalThis.showToast === 'function' && globalThis.showToast !== showToast) {
    globalThis.showToast(message, type);
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type} is-visible`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderPagination(pagination) {
  const { page, limit, total, totalPages: pages } = pagination;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  paginationContainer.classList.remove('hidden');
  paginationInfo.textContent = t('adminUsers.paginationInfo', { start, end, total });

  let buttonsHtml = `
    <button class="page-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">
      ${t('common.prev')}
    </button>
  `;

  const maxButtons = 5;
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
  let endPage = Math.min(pages, startPage + maxButtons - 1);

  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  if (startPage > 1) {
    buttonsHtml += `<button class="page-btn" data-page="1">1</button>`;
    if (startPage > 2) {
      buttonsHtml += '<span class="pagination-ellipsis">...</span>';
    }
  }

  for (let i = startPage; i <= endPage; i += 1) {
    buttonsHtml += `
      <button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">
        ${i}
      </button>
    `;
  }

  if (endPage < pages) {
    if (endPage < pages - 1) {
      buttonsHtml += '<span class="pagination-ellipsis">...</span>';
    }
    buttonsHtml += `<button class="page-btn" data-page="${pages}">${pages}</button>`;
  }

  buttonsHtml += `
    <button class="page-btn" ${page >= pages ? 'disabled' : ''} data-page="${page + 1}">
      ${t('common.next')}
    </button>
  `;

  paginationControls.innerHTML = buttonsHtml;
}

function goToPage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  loadUsers(currentPage, currentLimit);
}

function getFilters() {
  return {
    name: filterName.value.trim(),
    email: filterEmail.value.trim(),
    status: filterStatus.value,
    role: filterRole.value,
  };
}

function setupFilters() {
  const debouncedLoad = debounce(() => {
    currentPage = 1;
    loadUsers(currentPage, currentLimit);
  }, 500);

  filterName.addEventListener('input', debouncedLoad);
  filterEmail.addEventListener('input', debouncedLoad);

  filterStatus.addEventListener('change', () => {
    currentPage = 1;
    loadUsers(currentPage, currentLimit);
  });
  filterRole.addEventListener('change', () => {
    currentPage = 1;
    loadUsers(currentPage, currentLimit);
  });

  clearFiltersBtn.addEventListener('click', () => {
    filterName.value = '';
    filterEmail.value = '';
    filterStatus.value = 'All';
    filterRole.value = 'All';
    currentPage = 1;
    loadUsers(currentPage, currentLimit);
  });
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
