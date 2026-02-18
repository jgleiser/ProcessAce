/* global lucide, showConfirmModal, showAlertModal */
// workspace-settings.js

document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();

  // Elements
  const myWorkspacesList = document.getElementById('my-workspaces-list');
  const sharedWorkspacesList = document.getElementById('shared-workspaces-list');

  // Manage Modal
  const manageModal = document.getElementById('manage-modal');
  const closeManageModalBtn = document.getElementById('close-manage-modal');
  const modalWorkspaceName = document.getElementById('modal-workspace-name');
  const manageWorkspaceIdInput = document.getElementById('manage-workspace-id');
  const inviteForm = document.getElementById('invite-form');
  const membersList = document.getElementById('members-list');
  const invitationsList = document.getElementById('invitations-list');
  const tabMembers = document.getElementById('tab-members');
  const tabInvites = document.getElementById('tab-invites');

  // Create Modal
  const createModal = document.getElementById('create-modal');
  const createWorkspaceBtn = document.getElementById('create-workspace-btn');
  const closeCreateModalBtn = document.getElementById('close-create-modal');
  const cancelCreateBtn = document.getElementById('cancel-create-btn');
  const createWorkspaceForm = document.getElementById('create-workspace-form');

  // State
  let currentUser = null;
  let activeModal = null; // Track active modal for back button / escape support

  // --- Modal Logic (Close on Back / Escape / Click Outside) ---

  function openModal(modal) {
    if (activeModal) return;
    activeModal = modal;
    modal.classList.remove('hidden');
    history.pushState({ modalOpen: true }, '');
  }

  function closeModal() {
    if (activeModal) {
      history.back(); // This triggers popstate, which handles the actual hiding
    }
  }

  // Handle Browser Back Button
  window.addEventListener('popstate', () => {
    if (activeModal) {
      activeModal.classList.add('hidden');
      activeModal = null;
    }
  });

  // Handle Escape Key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeModal) {
      closeModal();
    }
  });

  // Handle Click Outside (Backdrop)
  [manageModal, createModal].forEach((m) => {
    if (m) {
      m.addEventListener('click', (e) => {
        if (e.target === m) {
          closeModal();
        }
      });
    }
  });

  // --- Initialization ---

  try {
    const authRes = await fetch('/api/auth/me');
    if (authRes.ok) {
      currentUser = await authRes.json();
      loadWorkspaces();
    } else {
      window.location.href = '/login.html';
    }
  } catch (e) {
    console.error('Auth check failed', e);
  }

  // --- Loading Workspaces ---

  async function loadWorkspaces() {
    try {
      const res = await fetch('/api/workspaces');
      if (res.ok) {
        const workspaces = await res.json();
        renderWorkspaces(workspaces);
      }
    } catch (e) {
      console.error('Failed to load workspaces', e);
    }
  }

  function renderWorkspaces(workspaces) {
    const myWorkspaces = workspaces.filter((w) => w.owner_id === currentUser.id);
    const sharedWorkspaces = workspaces.filter((w) => w.owner_id !== currentUser.id);

    // My Workspaces
    if (myWorkspaces.length === 0) {
      myWorkspacesList.innerHTML =
        '<div class="empty-state ws-empty-state">You haven\'t created any workspaces yet.</div>';
    } else {
      myWorkspacesList.innerHTML = myWorkspaces.map((w) => createWorkspaceCard(w, true)).join('');
    }

    // Shared Workspaces
    if (sharedWorkspaces.length === 0) {
      sharedWorkspacesList.innerHTML =
        '<div class="empty-state ws-empty-state">No shared workspaces found.</div>';
    } else {
      sharedWorkspacesList.innerHTML = sharedWorkspaces
        .map((w) => createWorkspaceCard(w, false))
        .join('');
    }

    lucide.createIcons();
    attachCardListeners();
  }

  function createWorkspaceCard(workspace, isOwner) {
    const jobCount = workspace.job_count || 0;
    const artifactCount = workspace.artifact_count || 0;
    const memberCount = workspace.member_count || 0;

    const roleText = isOwner ? 'OWNER' : workspace.role ? workspace.role.toUpperCase() : 'VIEWER';

    let actionsContent = '';
    if (isOwner) {
      if (workspace.name === 'My Workspace') {
        actionsContent = `
                        <div class="ws-card-info-text">Default Workspace</div>
                    `;
      } else {
        actionsContent = `
                        <button class="action-btn primary manage-btn" data-id="${workspace.id}" data-name="${workspace.name}" data-owner-id="${workspace.owner_id}" data-role="owner">Manage</button>
                        <button class="action-btn danger delete-ws-btn" data-id="${workspace.id}">Delete</button>
                    `;
      }
    } else if (workspace.role === 'admin') {
      actionsContent = `
                    <button class="action-btn primary manage-btn" data-id="${workspace.id}" data-name="${workspace.name}" data-owner-id="${workspace.owner_id}" data-role="admin">Manage</button>
                `;
    } else {
      actionsContent = `
                    <div class="ws-card-info-text">View Only</div>
                `;
    }

    return `
            <div class="workspace-card">
                <div class="workspace-header">
                    <div>
                        <div class="workspace-title">${workspace.name}</div>
                        <div class="workspace-role">${roleText}</div>
                    </div>
                </div>
                <div class="workspace-stats">
                    <div class="stat-item">
                        <span class="stat-value">${jobCount}</span>
                        <span class="stat-label">Processes</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${artifactCount}</span>
                        <span class="stat-label">Documents</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${memberCount}</span>
                        <span class="stat-label">Members</span>
                    </div>
                </div>
                <div class="workspace-actions">
                    ${actionsContent}
                </div>
            </div>
        `;
  }

  function attachCardListeners() {
    document.querySelectorAll('.manage-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const ownerId = btn.getAttribute('data-owner-id');
        const myRole = btn.getAttribute('data-role');
        openManageModal(id, name, ownerId, myRole);
      });
    });

    document.querySelectorAll('.delete-ws-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const confirmed = await showConfirmModal(
          'Are you sure you want to delete this workspace? This defaults ALL jobs, evidence, and artifacts associated with it. This cannot be undone.',
          'Delete Workspace',
          'Delete',
          'Cancel',
        );
        if (confirmed) {
          deleteWorkspace(id);
        }
      });
    });
  }

  // --- Workspace Actions ---

  async function deleteWorkspace(id) {
    try {
      const res = await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadWorkspaces();
      } else {
        await showAlertModal('Failed to delete workspace');
      }
    } catch (e) {
      console.error(e);
      await showAlertModal('Error deleting workspace');
    }
  }

  // --- Manage Modal Logic ---

  async function openManageModal(id, name, ownerId, myRole) {
    modalWorkspaceName.textContent = name;
    manageWorkspaceIdInput.value = id;

    openModal(manageModal); // Use helper

    // Reset tabs
    switchTab('members');

    loadMembers(id, ownerId, myRole);
    loadInvitations(id);
  }

  // Replace old close function with our helper interaction
  if (closeManageModalBtn) closeManageModalBtn.addEventListener('click', closeModal);

  // Tab Switching
  function switchTab(tab) {
    if (tab === 'members') {
      tabMembers.classList.add('active', 'tab-active');
      tabMembers.classList.remove('tab-inactive');

      tabInvites.classList.add('tab-inactive');
      tabInvites.classList.remove('active', 'tab-active');

      membersList.classList.remove('hidden');
      invitationsList.classList.add('hidden');
    } else {
      tabInvites.classList.add('active', 'tab-active');
      tabInvites.classList.remove('tab-inactive');

      tabMembers.classList.add('tab-inactive');
      tabMembers.classList.remove('active', 'tab-active');

      invitationsList.classList.remove('hidden');
      membersList.classList.add('hidden');
    }
  }

  if (tabMembers) tabMembers.addEventListener('click', () => switchTab('members'));
  if (tabInvites) tabInvites.addEventListener('click', () => switchTab('invites'));

  // Loading Members/Invites
  async function loadMembers(workspaceId, ownerId, myRole) {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members?t=${Date.now()}`);
      const members = await res.json();

      if (membersList) {
        membersList.innerHTML = members
          .map((m) => {
            const isMemberOwner = m.role === 'owner';
            const isMe = currentUser && m.id === currentUser.id;

            // Determine if current user can manage this specific member
            const canManage = myRole === 'owner' || myRole === 'admin';

            // Can edit role:
            // 1. I must be admin or owner
            // 2. Member must NOT be owner
            // 3. Member works be NOT ME (optional, but good UX)
            // 4. If I am admin, I probably shouldn't edit other admins? (Let's allow it for simplicity, but block moving to/from owner which backend handles)
            const canEdit = canManage && !isMemberOwner && !isMe;

            // Can remove:
            // 1. I must be admin or owner
            // 2. Member must NOT be owner
            // 3. Member must NOT be ME (leave workspace instead)
            const canRemove = canManage && !isMemberOwner && !isMe;

            const removeButton = canRemove
              ? `
                                <button class="btn-icon remove-member" data-uid="${m.id}" data-wid="${workspaceId}">
                                    <i data-lucide="trash-2" class="icon-sm"></i>
                                </button>
                            `
              : '';

            let roleDisplay;
            if (isMemberOwner) {
              roleDisplay = `<span class="role-badge role-owner">OWNER</span>`;
            } else if (canEdit) {
              // Edit button flow
              roleDisplay = `
                            <div class="role-edit-container role-edit-row" data-uid="${m.id}" data-wid="${workspaceId}" data-current-role="${m.role}" data-owner-id="${ownerId}">
                                <span class="role-display-area">
                                    <span class="role-badge role-${m.role}">${m.role}</span>
                                </span>
                                <button class="btn-icon edit-role-btn" title="Edit Role">
                                    <i data-lucide="pencil" class="icon-xs"></i>
                                </button>
                            </div>
                        `;
            } else {
              // Static badge for others
              roleDisplay = `<span class="role-badge role-${m.role}">${m.role}</span>`;
            }

            return `
                    <li class="list-group-item">
                        <div class="member-row">
                            <div class="member-avatar">
                                ${m.name ? m.name[0] : m.email[0].toUpperCase()}
                            </div>
                            <div>
                                <div class="member-name">${m.name || 'User'}</div>
                                <div class="member-email">${m.email}</div>
                            </div>
                        </div>
                        <div class="member-row">
                            ${roleDisplay}
                            ${removeButton}
                        </div>
                    </li>
                `;
          })
          .join('');

        lucide.createIcons();

        // Attach listeners for edit role
        document.querySelectorAll('.edit-role-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const container = btn.closest('.role-edit-container');
            const uid = container.dataset.uid;
            const currentRole = container.dataset.currentRole;
            const wid = container.dataset.wid;
            // We can check container owners, etc. if needed

            // Switch to select + save
            container.innerHTML = `
                             <select class="form-input member-role-select role-edit-select">
                                <option value="viewer" ${currentRole === 'viewer' ? 'selected' : ''}>Viewer</option>
                                <option value="editor" ${currentRole === 'editor' ? 'selected' : ''}>Editor</option>
                                <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                            <button class="action-btn primary save-role-btn role-edit-save">Save</button>
                            <button class="btn-icon cancel-role-btn" title="Cancel">
                                <i data-lucide="x" class="icon-xs"></i>
                            </button>
                        `;
            lucide.createIcons();

            // Attach save listener
            const saveBtn = container.querySelector('.save-role-btn');
            saveBtn.addEventListener('click', async () => {
              const newRole = container.querySelector('.member-role-select').value;

              try {
                const res = await fetch(`/api/workspaces/${wid}/members/${uid}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ role: newRole }),
                });

                if (res.ok) {
                  showInviteMessage('success', 'Member role updated successfully');
                  loadMembers(wid, ownerId, myRole);
                } else {
                  const err = await res.json();
                  showInviteMessage('error', err.error || 'Failed to update role');
                }
              } catch (err) {
                console.error(err);
                showInviteMessage('error', 'Error updating role');
              }
            });

            // Attach cancel listener
            const cancelBtn = container.querySelector('.cancel-role-btn');
            cancelBtn.addEventListener('click', () => {
              loadMembers(workspaceId, ownerId, myRole); // Reload to reset
            });
          });
        });

        document.querySelectorAll('.remove-member').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const confirmed = await showConfirmModal(
              'Are you sure you want to remove this member?',
              'Remove Member',
            );
            if (confirmed) {
              removeMember(btn.dataset.wid, btn.dataset.uid);
            }
          });
        });
      }
    } catch (e) {
      console.error(e);
      if (membersList)
        membersList.innerHTML =
          '<li class="list-item-padded text-error">Failed to load members</li>';
    }
  }

  async function loadInvitations(workspaceId) {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invitations?t=${Date.now()}`);
      const invites = await res.json();
      if (invitationsList) {
        if (invites.length === 0) {
          invitationsList.innerHTML =
            '<li class="list-item-padded text-center text-muted">No pending invitations</li>';
          return;
        }
        invitationsList.innerHTML = invites
          .map(
            (i) => `
                    <li class="list-group-item">
                        <div>
                            <div>${i.recipient_email}</div>
                            <div class="invite-info-line">Invited by ${i.inviter_email}</div>
                        </div>
                        <div class="member-row">
                            <span class="role-badge role-viewer">Pending</span>
                            <button class="btn-icon revoke-invite" data-id="${i.id}" data-wid="${workspaceId}">
                                <i data-lucide="trash-2" class="icon-sm"></i>
                            </button>
                        </div>
                    </li>
                `,
          )
          .join('');
        lucide.createIcons();

        document.querySelectorAll('.revoke-invite').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const confirmed = await showConfirmModal(
              'Are you sure you want to revoke this invitation?',
              'Revoke Invitation',
            );
            if (confirmed) {
              revokeInvitation(btn.dataset.wid, btn.dataset.id);
            }
          });
        });
      }
    } catch (e) {
      console.error(e);
      if (invitationsList)
        invitationsList.innerHTML =
          '<li class="list-item-padded text-error">Failed to load invitations</li>';
    }
  }

  // Actions
  async function removeMember(wid, uid) {
    await fetch(`/api/workspaces/${wid}/members/${uid}`, { method: 'DELETE' });
    loadMembers(wid);
  }

  async function revokeInvitation(wid, inviteId) {
    await fetch(`/api/workspaces/${wid}/invitations/${inviteId}`, { method: 'DELETE' });
    loadInvitations(wid);
  }

  // Notification Helper
  const inviteMessageContainer = document.getElementById('inviteMessageContainer');

  function showInviteMessage(type, text) {
    if (!inviteMessageContainer) return;

    inviteMessageContainer.innerHTML = `
            <div class="invite-message ${type === 'error' ? 'invite-message-error' : 'invite-message-success'}">
                ${text}
            </div>
        `;

    // Auto clear after 3 seconds
    setTimeout(() => {
      inviteMessageContainer.innerHTML = '';
    }, 3000);
  }

  if (inviteForm) {
    const inviteEmailInput = document.getElementById('invite-email');
    const suggestionsContainer = document.getElementById('email-suggestions');
    let debounceTimer;

    // Autocomplete Logic
    if (inviteEmailInput && suggestionsContainer) {
      inviteEmailInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);

        if (query.length < 2) {
          suggestionsContainer.classList.add('hidden');
          return;
        }

        debounceTimer = setTimeout(async () => {
          try {
            const res = await fetch(`/api/auth/users/search?q=${encodeURIComponent(query)}`);
            if (res.ok) {
              const users = await res.json();
              renderSuggestions(users);
            }
          } catch (err) {
            console.error('Failed to search users', err);
          }
        }, 300);
      });

      function renderSuggestions(users) {
        if (users.length === 0) {
          suggestionsContainer.classList.add('hidden');
          return;
        }

        suggestionsContainer.innerHTML = users
          .map(
            (u) => `
                    <div class="suggestion-item" data-email="${u.email}">
                        <span class="suggestion-name">${u.name}</span>
                        <span class="suggestion-email">${u.email}</span>
                    </div>
                `,
          )
          .join('');

        suggestionsContainer.classList.remove('hidden');

        // Add click listeners
        suggestionsContainer.querySelectorAll('.suggestion-item').forEach((item) => {
          item.addEventListener('click', () => {
            inviteEmailInput.value = item.dataset.email;
            suggestionsContainer.classList.add('hidden');
          });
        });
      }

      // Hide when clicking outside
      document.addEventListener('click', (e) => {
        if (!inviteEmailInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
          suggestionsContainer.classList.add('hidden');
        }
      });
    }

    inviteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const wid = manageWorkspaceIdInput.value;
      const email = document.getElementById('invite-email').value;
      const role = document.getElementById('invite-role-select').value; // Get from select

      try {
        const res = await fetch(`/api/workspaces/${wid}/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role }),
        });
        if (res.ok) {
          document.getElementById('invite-email').value = '';
          showInviteMessage('success', 'Invitation sent / generated!');
          await loadInvitations(wid);
          switchTab('invites');
        } else {
          const err = await res.json();
          showInviteMessage('error', err.error || 'Failed to invite');
        }
      } catch (e) {
        console.error(e);
        showInviteMessage('error', 'An error occurred while sending the invitation');
      }
    });
  }

  // --- Create Workspace Modal ---

  if (createWorkspaceBtn) {
    createWorkspaceBtn.addEventListener('click', () => openModal(createModal));
  }
  if (closeCreateModalBtn) {
    closeCreateModalBtn.addEventListener('click', closeModal);
  }
  if (cancelCreateBtn) {
    cancelCreateBtn.addEventListener('click', closeModal);
  }

  if (createWorkspaceForm) {
    createWorkspaceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-workspace-name').value;
      try {
        const res = await fetch('/api/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (res.ok) {
          closeModal(); // Triggers back -> popstate -> hide
          document.getElementById('new-workspace-name').value = '';
          loadWorkspaces();
        }
      } catch (e) {
        console.error(e);
      }
    });
  }
});
