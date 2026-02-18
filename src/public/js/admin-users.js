/**
 * Admin Page JavaScript
 * Handles user management functionality
 */

let currentPage = 1;
let currentLimit = 10;
let totalPages = 1;
let currentUserId = null;
let originalUserData = {}; // Track original values to detect changes

// DOM Elements
const paginationContainer = document.getElementById('paginationContainer');
const paginationInfo = document.getElementById('paginationInfo');
const paginationControls = document.getElementById('paginationControls');
const limitSelect = document.getElementById('limitSelect');

// Check authentication and admin status on load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }

    const user = await response.json();
    currentUserId = user.id;

    // Check if user is admin
    if (user.role !== 'admin') {
      showError('Access denied. Admin privileges required.');
      document.getElementById('loadingState').classList.add('hidden');
      return;
    }

    // Initialize limit select
    limitSelect.value = currentLimit;

    loadUsers(currentPage, currentLimit);

    // Add event listener for save button
    document.getElementById('saveAllBtn').addEventListener('click', saveAllChanges);

    // Add listener for limit select
    limitSelect.addEventListener('change', (e) => {
      currentLimit = parseInt(e.target.value);
      currentPage = 1;
      loadUsers(currentPage, currentLimit);
    });

    // Add listner for pagination controls (Event Delegation)
    paginationControls.addEventListener('click', (e) => {
      const btn = e.target.closest('.page-btn');
      if (btn && !btn.disabled) {
        const page = parseInt(btn.dataset.page);
        if (!isNaN(page)) {
          goToPage(page);
        }
      }
    });
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/login.html';
  }
});

/**
 * Load all users from API
 */
async function loadUsers(page = 1, limit = 10) {
  try {
    const loading = document.getElementById('loadingState');
    const table = document.getElementById('usersTable');
    const pagContainer = document.getElementById('paginationContainer');

    loading.classList.remove('hidden');
    table.classList.add('hidden');
    pagContainer.classList.add('hidden');

    const response = await fetch(`/api/admin/users?page=${page}&limit=${limit}`);
    if (!response.ok) {
      if (response.status === 403) {
        showError('Access denied. Admin privileges required.');
        return;
      }
      throw new Error('Failed to fetch users');
    }

    const data = await response.json();

    // Handle response format change (array vs object with pagination)
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
    console.error('Stack:', error.stack);
    showError(`Failed to load users: ${error.message}`);
  }
}

/**
 * Render users in the table
 */
function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  const table = document.getElementById('usersTable');
  const loading = document.getElementById('loadingState');

  loading.classList.add('hidden');
  table.classList.remove('hidden');

  tbody.innerHTML = users
    .map((user) => {
      // Store original data
      originalUserData[user.id] = { status: user.status, role: user.role };
      const isCurrentUser = user.id === currentUserId;
      const createdDate = new Date(user.created_at).toLocaleDateString();

      return `
            <tr data-user-id="${user.id}">
                <td>
                    <span class="user-name">${escapeHtml(user.name || 'N/A')}</span>
                    ${isCurrentUser ? '<span class="you-badge">YOU</span>' : ''}
                </td>
                <td class="user-email">${escapeHtml(user.email)}</td>
                <td>
                    <select class="status-select" data-field="status" data-user-id="${user.id}" ${isCurrentUser ? 'disabled' : ''}>
                        <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </td>
                <td>
                    <select class="role-select" data-field="role" data-user-id="${user.id}" ${isCurrentUser ? 'disabled' : ''}>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Editor</option>
                        <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                    </select>
                </td>
                <td class="user-date">${createdDate}</td>
            </tr>
        `;
    })
    .join('');

  // Add change listeners to all selects
  document.querySelectorAll('.status-select, .role-select').forEach((select) => {
    select.addEventListener('change', updateSaveButton);
  });
}

/**
 * Get all pending changes
 */
function getPendingChanges() {
  const changes = [];

  document.querySelectorAll('tr[data-user-id]').forEach((row) => {
    const userId = row.dataset.userId;
    const statusSelect = row.querySelector('.status-select');
    const roleSelect = row.querySelector('.role-select');

    if (!statusSelect || !roleSelect) return;

    const original = originalUserData[userId];
    const updates = {};

    if (statusSelect.value !== original.status) {
      updates.status = statusSelect.value;
    }
    if (roleSelect.value !== original.role) {
      updates.role = roleSelect.value;
    }

    if (Object.keys(updates).length > 0) {
      changes.push({ userId, updates });
    }
  });

  return changes;
}

/**
 * Update bulk save button state
 */
function updateSaveButton() {
  const changes = getPendingChanges();
  const saveBtn = document.getElementById('saveAllBtn');
  const countSpan = document.getElementById('changesCount');

  if (changes.length > 0) {
    saveBtn.disabled = false;
    countSpan.textContent = `${changes.length} user${changes.length > 1 ? 's' : ''} modified`;
  } else {
    saveBtn.disabled = true;
    countSpan.textContent = '';
  }
}

/**
 * Save all pending changes
 */
async function saveAllChanges() {
  const changes = getPendingChanges();
  if (changes.length === 0) return;

  const saveBtn = document.getElementById('saveAllBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

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
      successCount++;
    } catch (error) {
      console.error(`Error updating user ${userId}:`, error);
      errorMessages.push(error.message);
    }
  }

  saveBtn.textContent = 'Save Changes';
  updateSaveButton();

  if (errorMessages.length > 0) {
    showToast(
      `${successCount} saved, ${errorMessages.length} failed: ${errorMessages[0]}`,
      'error',
    );
  } else {
    showToast(`${successCount} user${successCount > 1 ? 's' : ''} updated successfully`, 'success');
  }
}

/**
 * Show error message
 */
function showError(message) {
  const container = document.getElementById('errorContainer');
  container.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Render pagination controls
 */
function renderPagination(pagination) {
  const { page, limit, total, totalPages: pages } = pagination;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  // Show container
  paginationContainer.classList.remove('hidden');

  paginationInfo.textContent = `Showing ${start}-${end} of ${total} users`;

  // Build page buttons
  let buttonsHtml = '';

  // Previous button
  buttonsHtml += `
        <button class="page-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">
            ← Prev
        </button>
    `;

  // Page numbers
  const maxButtons = 5;
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
  let endPage = Math.min(pages, startPage + maxButtons - 1);

  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  if (startPage > 1) {
    buttonsHtml += `<button class="page-btn" data-page="1">1</button>`;
    if (startPage > 2) {
      buttonsHtml += `<span class="pagination-ellipsis">...</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    buttonsHtml += `
            <button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">
                ${i}
            </button>
        `;
  }

  if (endPage < pages) {
    if (endPage < pages - 1) {
      buttonsHtml += `<span class="pagination-ellipsis">...</span>`;
    }
    buttonsHtml += `<button class="page-btn" data-page="${pages}">${pages}</button>`;
  }

  // Next button
  buttonsHtml += `
        <button class="page-btn" ${page >= pages ? 'disabled' : ''} data-page="${page + 1}">
            Next →
        </button>
    `;

  paginationControls.innerHTML = buttonsHtml;
}

/**
 * Navigate to a specific page
 */
function goToPage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  loadUsers(currentPage, currentLimit);
}
