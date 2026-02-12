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
    [manageModal, createModal].forEach(m => {
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
        const myWorkspaces = workspaces.filter(w => w.owner_id === currentUser.id);
        const sharedWorkspaces = workspaces.filter(w => w.owner_id !== currentUser.id);

        // My Workspaces
        if (myWorkspaces.length === 0) {
            myWorkspacesList.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1; padding: 2rem;">You haven\'t created any workspaces yet.</div>';
        } else {
            myWorkspacesList.innerHTML = myWorkspaces.map(w => createWorkspaceCard(w, true)).join('');
        }

        // Shared Workspaces
        if (sharedWorkspaces.length === 0) {
            sharedWorkspacesList.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1; padding: 2rem;">No shared workspaces found.</div>';
        } else {
            sharedWorkspacesList.innerHTML = sharedWorkspaces.map(w => createWorkspaceCard(w, false)).join('');
        }

        lucide.createIcons();
        attachCardListeners();
    }

    function createWorkspaceCard(workspace, isOwner) {
        const jobCount = workspace.job_count || 0;
        const artifactCount = workspace.artifact_count || 0;
        const memberCount = workspace.member_count || 0;

        return `
            <div class="workspace-card">
                <div class="workspace-header">
                    <div>
                        <div class="workspace-title">${workspace.name}</div>
                        <div class="workspace-role">${isOwner ? 'OWNER' : workspace.role}</div>
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
                    ${isOwner ? `
                        ${workspace.name === 'My Workspace' ? `
                            <div style="flex:1; text-align: center; font-size: 0.8rem; color: var(--text-muted); padding: 0.5rem;">Default Workspace</div>
                        ` : `
                            <button class="action-btn primary manage-btn" data-id="${workspace.id}" data-name="${workspace.name}" data-owner-id="${workspace.owner_id}">Manage</button>
                            <button class="action-btn danger delete-ws-btn" data-id="${workspace.id}">Delete</button>
                        `}
                    ` : `
                        <div style="flex:1; text-align: center; font-size: 0.8rem; color: var(--text-muted); padding: 0.5rem;">View Only</div>
                    `}
                </div>
            </div>
        `;
    }

    function attachCardListeners() {
        document.querySelectorAll('.manage-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                const ownerId = btn.getAttribute('data-owner-id');
                openManageModal(id, name, ownerId);
            });
        });

        document.querySelectorAll('.delete-ws-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const confirmed = await showConfirmModal(
                    'Are you sure you want to delete this workspace? This defaults ALL jobs, evidence, and artifacts associated with it. This cannot be undone.',
                    'Delete Workspace',
                    'Delete',
                    'Cancel'
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
                alert('Failed to delete workspace');
            }
        } catch (e) {
            console.error(e);
            alert('Error deleting workspace');
        }
    }

    // --- Manage Modal Logic ---

    async function openManageModal(id, name, ownerId) {
        modalWorkspaceName.textContent = name;
        manageWorkspaceIdInput.value = id;

        openModal(manageModal); // Use helper

        // Reset tabs
        switchTab('members');

        loadMembers(id, ownerId);
        loadInvitations(id);
    }

    // Replace old close function with our helper interaction
    if (closeManageModalBtn) closeManageModalBtn.addEventListener('click', closeModal);

    // Tab Switching
    function switchTab(tab) {
        if (tab === 'members') {
            tabMembers.classList.add('active', 'text-primary', 'border-b-2', 'border-primary'); // Tailwind classes concept but applied via style in HTML
            tabMembers.style.color = 'var(--primary)';
            tabMembers.style.borderBottom = '2px solid var(--primary)';

            tabInvites.style.color = 'var(--text-muted)';
            tabInvites.style.borderBottom = 'none';

            membersList.classList.remove('hidden');
            invitationsList.classList.add('hidden');
        } else {
            tabInvites.style.color = 'var(--primary)';
            tabInvites.style.borderBottom = '2px solid var(--primary)';

            tabMembers.style.color = 'var(--text-muted)';
            tabMembers.style.borderBottom = 'none';

            invitationsList.classList.remove('hidden');
            membersList.classList.add('hidden');
        }
    }

    if (tabMembers) tabMembers.addEventListener('click', () => switchTab('members'));
    if (tabInvites) tabInvites.addEventListener('click', () => switchTab('invites'));

    // Loading Members/Invites
    async function loadMembers(workspaceId, ownerId) {
        try {
            const res = await fetch(`/api/workspaces/${workspaceId}/members?t=${Date.now()}`);
            const members = await res.json();

            const isCurrentUserOwner = currentUser && currentUser.id === ownerId;

            if (membersList) {
                membersList.innerHTML = members.map(m => {
                    const isMemberOwner = m.role === 'owner';

                    let roleDisplay;
                    if (isMemberOwner) {
                        roleDisplay = `<span class="role-badge role-owner">OWNER</span>`;
                    } else if (isCurrentUserOwner) {
                        // Edit button flow
                        roleDisplay = `
                            <div class="role-edit-container" data-uid="${m.id}" data-wid="${workspaceId}" data-current-role="${m.role}" style="display: flex; align-items: center; gap: 0.5rem;">
                                <span class="role-display-area">
                                    <span class="role-badge role-${m.role}">${m.role}</span>
                                </span>
                                <button class="btn-icon edit-role-btn" title="Edit Role">
                                    <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                                </button>
                            </div>
                        `;
                    } else {
                        // Static badge for others
                        roleDisplay = `<span class="role-badge role-${m.role}">${m.role}</span>`;
                    }

                    return `
                    <li class="list-group-item">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 32px; height: 32px; background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;">
                                ${m.name ? m.name[0] : m.email[0].toUpperCase()}
                            </div>
                            <div>
                                <div style="font-weight: 500;">${m.name || 'User'}</div>
                                <div style="font-size: 0.8rem; color: var(--text-muted);">${m.email}</div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            ${roleDisplay}
                            ${!isMemberOwner && isCurrentUserOwner ? `
                                <button class="btn-icon remove-member" data-uid="${m.id}" data-wid="${workspaceId}">
                                    <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                                </button>
                            ` : ''}
                        </div>
                    </li>
                `}).join('');

                lucide.createIcons();

                // Attach listeners for edit role
                document.querySelectorAll('.edit-role-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const container = btn.closest('.role-edit-container');
                        const uid = container.dataset.uid;
                        const currentRole = container.dataset.currentRole;
                        const wid = container.dataset.wid;

                        // Switch to select + save
                        container.innerHTML = `
                             <select class="form-input member-role-select" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; border-radius: 4px; height: auto; width: auto;">
                                <option value="viewer" ${currentRole === 'viewer' ? 'selected' : ''}>Viewer</option>
                                <option value="editor" ${currentRole === 'editor' ? 'selected' : ''}>Editor</option>
                                <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                            <button class="action-btn primary save-role-btn" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; flex: 0 0 auto;">Save</button>
                            <button class="btn-icon cancel-role-btn" title="Cancel">
                                <i data-lucide="x" style="width: 14px; height: 14px;"></i>
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
                                    body: JSON.stringify({ role: newRole })
                                });

                                if (res.ok) {
                                    showInviteMessage('success', 'Member role updated successfully');
                                    loadMembers(wid, ownerId);
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
                            loadMembers(workspaceId, ownerId); // Reload to reset
                        });
                    });
                });

                document.querySelectorAll('.remove-member').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const confirmed = await showConfirmModal('Are you sure you want to remove this member?', 'Remove Member');
                        if (confirmed) {
                            removeMember(btn.dataset.wid, btn.dataset.uid);
                        }
                    });
                });
            }

        } catch (e) {
            console.error(e);
            if (membersList) membersList.innerHTML = '<li style="padding: 1rem; color: var(--error);">Failed to load members</li>';
        }
    }

    async function loadInvitations(workspaceId) {
        try {
            const res = await fetch(`/api/workspaces/${workspaceId}/invitations?t=${Date.now()}`);
            const invites = await res.json();
            if (invitationsList) {
                if (invites.length === 0) {
                    invitationsList.innerHTML = '<li style="padding: 1rem; text-align: center; color: var(--text-muted);">No pending invitations</li>';
                    return;
                }
                invitationsList.innerHTML = invites.map(i => `
                    <li class="list-group-item">
                        <div>
                            <div>${i.recipient_email}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Invited by ${i.inviter_email}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <span class="role-badge role-viewer">Pending</span>
                            <button class="btn-icon revoke-invite" data-id="${i.id}" data-wid="${workspaceId}">
                                <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                            </button>
                        </div>
                    </li>
                `).join('');
                lucide.createIcons();

                document.querySelectorAll('.revoke-invite').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const confirmed = await showConfirmModal('Are you sure you want to revoke this invitation?', 'Revoke Invitation');
                        if (confirmed) {
                            revokeInvitation(btn.dataset.wid, btn.dataset.id);
                        }
                    });
                });
            }

        } catch (e) {
            console.error(e);
            if (invitationsList) invitationsList.innerHTML = '<li style="padding: 1rem; color: var(--error);">Failed to load invitations</li>';
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
            <div style="padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 6px; font-size: 0.85rem; background: ${type === 'error' ? 'rgba(255, 82, 82, 0.1)' : 'rgba(0, 230, 118, 0.1)'}; color: ${type === 'error' ? 'var(--error)' : 'var(--success)'}; border: 1px solid ${type === 'error' ? 'var(--error)' : 'var(--success)'};">
                ${text}
            </div>
        `;

        // Auto clear after 3 seconds
        setTimeout(() => {
            inviteMessageContainer.innerHTML = '';
        }, 3000);
    }

    if (inviteForm) {
        inviteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const wid = manageWorkspaceIdInput.value;
            const email = document.getElementById('invite-email').value;
            const role = document.getElementById('invite-role-select').value; // Get from select

            try {
                const res = await fetch(`/api/workspaces/${wid}/invite`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, role })
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
                    body: JSON.stringify({ name })
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
