/**
 * Workspace Manager
 * Handles workspace fetching, selection, and UI updates.
 */
window.WorkspaceManager = (function () {
  let currentWorkspaceId = null;
  let currentWorkspaceName = 'Loading...';
  let workspacesCache = [];

  // DOM Elements
  let workspaceSelector,
    workspaceViewMode,
    workspaceEditMode,
    currentWorkspaceNameEl,
    changeWorkspaceLink,
    cancelWorkspaceLink,
    workspaceActionBtn,
    newWorkspaceInput,
    workspaceSelect;

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  }

  function setCookie(name, value) {
    document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Strict`;
  }

  async function loadWorkspaces() {
    try {
      const res = await window.apiClient.get('/api/workspaces');
      workspacesCache = res;
      populateWorkspaceSelect();

      const savedWorkspaceId = getCookie('processAce_workspaceId');
      const validSavedWorkspace = savedWorkspaceId
        ? workspacesCache.find((w) => w.id === savedWorkspaceId)
        : null;

      if (!currentWorkspaceId) {
        if (validSavedWorkspace) {
          currentWorkspaceId = validSavedWorkspace.id;
          currentWorkspaceName = validSavedWorkspace.name;
        } else if (workspacesCache.length > 0) {
          currentWorkspaceId = workspacesCache[0].id;
          currentWorkspaceName = workspacesCache[0].name;
        }
      }

      updateWorkspaceDisplay();
      triggerWorkspaceChanged();
    } catch (err) {
      console.error('Failed to load workspaces', err);
    }
  }

  function populateWorkspaceSelect() {
    if (!workspaceSelect) return;
    workspaceSelect.innerHTML = '';

    if (workspacesCache.length === 0) {
      workspaceSelect.innerHTML = '<option value="">No workspaces</option>';
    } else {
      workspacesCache.forEach((ws) => {
        const option = document.createElement('option');
        option.value = ws.id;
        option.textContent = ws.name;
        workspaceSelect.appendChild(option);
      });
    }

    const newOption = document.createElement('option');
    newOption.value = '__NEW__';
    newOption.textContent = '+ Create new workspace...';
    workspaceSelect.appendChild(newOption);

    workspaceSelect.value = currentWorkspaceId || '';
  }

  function updateWorkspaceDisplay() {
    const ws = workspacesCache.find((w) => w.id === currentWorkspaceId);
    currentWorkspaceName = ws ? ws.name : 'None';
    if (currentWorkspaceNameEl) currentWorkspaceNameEl.textContent = currentWorkspaceName;

    const role = ws ? ws.role : 'viewer';

    const uploadZone = document.getElementById('uploadZone');
    const uploadContainer =
      document.querySelector('.card:has(#uploadZone)') ||
      (uploadZone ? uploadZone.closest('.card') : null);

    const viewerMsgId = 'viewer-msg';
    let msg = document.getElementById(viewerMsgId);

    if (role === 'viewer') {
      if (uploadContainer) {
        uploadContainer.classList.add('hidden');
      } else if (uploadZone) {
        uploadZone.classList.add('hidden');
      }
      if (!msg && uploadZone) {
        msg = document.createElement('div');
        msg.id = viewerMsgId;
        msg.className = 'card viewer-message';
        msg.textContent = 'You have viewer access. You cannot start new jobs.';
        uploadZone.parentNode.insertBefore(msg, uploadZone);
      } else if (msg) {
        msg.classList.remove('hidden');
      }
    } else {
      if (uploadContainer) {
        uploadContainer.classList.remove('hidden');
      } else if (uploadZone) {
        uploadZone.classList.remove('hidden');
      }
      if (msg) msg.classList.add('hidden');
    }
  }

  function showEditMode() {
    if (workspaceViewMode) workspaceViewMode.classList.add('hidden');
    if (workspaceEditMode) workspaceEditMode.classList.remove('hidden');
    if (workspaceSelect) workspaceSelect.value = currentWorkspaceId || '';
    if (newWorkspaceInput) newWorkspaceInput.classList.add('hidden');
    if (workspaceActionBtn) workspaceActionBtn.textContent = 'Select';
  }

  function showViewMode() {
    if (workspaceViewMode) workspaceViewMode.classList.remove('hidden');
    if (workspaceEditMode) workspaceEditMode.classList.add('hidden');
  }

  function triggerWorkspaceChanged() {
    document.dispatchEvent(
      new CustomEvent('workspaceChanged', {
        detail: { workspaceId: currentWorkspaceId, workspaceName: currentWorkspaceName },
      }),
    );
  }

  async function handleWorkspaceAction() {
    if (!workspaceSelect) return;

    if (workspaceSelect.value === '__NEW__') {
      const name = newWorkspaceInput ? newWorkspaceInput.value.trim() : '';
      if (!name) {
        if (typeof window.showAlertModal === 'function') {
          await window.showAlertModal('Please enter a workspace name');
        } else {
          alert('Please enter a workspace name');
        }
        return;
      }

      try {
        const newWorkspace = await window.apiClient.post('/api/workspaces', { name });
        currentWorkspaceId = newWorkspace.id;
        setCookie('processAce_workspaceId', currentWorkspaceId);

        await loadWorkspaces();
        showViewMode();
      } catch (err) {
        console.error('Error creating workspace', err);
        if (typeof window.showAlertModal === 'function') {
          await window.showAlertModal('Error creating workspace');
        }
      }
    } else {
      currentWorkspaceId = workspaceSelect.value;
      setCookie('processAce_workspaceId', currentWorkspaceId);

      updateWorkspaceDisplay();
      showViewMode();
      triggerWorkspaceChanged();
    }
  }

  function setupEventListeners() {
    if (changeWorkspaceLink) {
      changeWorkspaceLink.addEventListener('click', (e) => {
        e.preventDefault();
        showEditMode();
      });
    }

    if (cancelWorkspaceLink) {
      cancelWorkspaceLink.addEventListener('click', (e) => {
        e.preventDefault();
        showViewMode();
      });
    }

    if (workspaceSelect) {
      workspaceSelect.addEventListener('change', (e) => {
        if (e.target.value === '__NEW__') {
          if (newWorkspaceInput) {
            newWorkspaceInput.classList.remove('hidden');
            newWorkspaceInput.focus();
          }
          if (workspaceActionBtn) workspaceActionBtn.textContent = 'Add';
        } else {
          if (newWorkspaceInput) newWorkspaceInput.classList.add('hidden');
          if (workspaceActionBtn) workspaceActionBtn.textContent = 'Select';
        }
      });
    }

    if (workspaceActionBtn) {
      workspaceActionBtn.addEventListener('click', handleWorkspaceAction);
    }
  }

  function init() {
    // Find DOM elements (they might be injected by header.js synchronously before this runs)
    workspaceSelector = document.getElementById('workspaceSelector');
    workspaceViewMode = document.getElementById('workspaceViewMode');
    workspaceEditMode = document.getElementById('workspaceEditMode');
    currentWorkspaceNameEl = document.getElementById('currentWorkspaceName');
    changeWorkspaceLink = document.getElementById('changeWorkspaceLink');
    cancelWorkspaceLink = document.getElementById('cancelWorkspaceLink');
    workspaceActionBtn = document.getElementById('workspaceActionBtn');
    newWorkspaceInput = document.getElementById('newWorkspaceInput');
    workspaceSelect = document.getElementById('workspaceSelect');

    if (workspaceSelector) {
      workspaceSelector.classList.remove('hidden');
    }

    setupEventListeners();
    loadWorkspaces();
  }

  return {
    init,
    getCurrentWorkspaceId: () => currentWorkspaceId,
    getCurrentWorkspaceName: () => currentWorkspaceName,
  };
})();
