/* global marked, BpmnJS, EasyMDE, showConfirmModal, showAlertModal */

document.addEventListener('DOMContentLoaded', async () => {
  // Auth Check and UI updates are now handled by header.js

  // Create global variables for UI elements (some might be injected by header.js)
  // We need to wait for header.js to inject them?
  // header.js runs on DOMContentLoaded and injects synchronously.
  // Since header.js is included before app.js, its listener *should* run first, or at least injectHeader
  // is called before we access these if we are careful.

  // Unhide Workspace Selector for Dashboard
  const workspaceSelector = document.getElementById('workspaceSelector');
  if (workspaceSelector) {
    workspaceSelector.classList.remove('hidden');
  }

  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const jobsList = document.getElementById('jobsList');
  const jobCount = document.getElementById('jobCount');

  // Workspace logic follows...

  // NEW WORKSPACE SWITCHER (View/Edit Mode)
  // These elements are injected by header.js
  const workspaceViewMode = document.getElementById('workspaceViewMode');
  const workspaceEditMode = document.getElementById('workspaceEditMode');
  const currentWorkspaceNameEl = document.getElementById('currentWorkspaceName');
  const changeWorkspaceLink = document.getElementById('changeWorkspaceLink');
  const cancelWorkspaceLink = document.getElementById('cancelWorkspaceLink');
  const workspaceActionBtn = document.getElementById('workspaceActionBtn');
  const newWorkspaceInput = document.getElementById('newWorkspaceInput');
  const workspaceSelect = document.getElementById('workspaceSelect');

  let currentWorkspaceId = null;
  let currentWorkspaceName = 'Loading...';
  let workspacesCache = [];

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  }

  async function loadWorkspaces() {
    try {
      const res = await fetch('/api/workspaces');
      if (res.ok) {
        workspacesCache = await res.json();
        populateWorkspaceSelect();

        // Set current workspace: check cookie first, then default to first
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

        // Update display
        updateWorkspaceDisplay();

        // Start polling now that we have a workspace
        updateJobs();
      }
    } catch (err) {
      console.error('Failed to load workspaces', err);
    }
  }

  function populateWorkspaceSelect() {
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
    // Add "Create new" option
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

    // Restriction Check
    const role = ws ? ws.role : 'viewer'; // Default to viewer if unknown
    const uploadContainer =
      document.querySelector('.card:has(#uploadZone)') ||
      document.getElementById('uploadZone')?.closest('.card');

    // If we can't find by .card:has (firefox support?), try simpler selection if structure is known.
    // Or just target #uploadZone and hide it, but the parent card looks better hidden.
    // app.js has: const uploadZone = document.getElementById('uploadZone');
    // Let's assume the upload is inside specific container.
    // Inspecting structure from memory/view: Usually it's a "Upload Evidence" card.
    // Let's hide uploadZone's parent if it's the main container.

    // Simpler: Just hide/disable uploadZone.
    const viewerMsgId = 'viewer-msg';
    let msg = document.getElementById(viewerMsgId);

    if (role === 'viewer') {
      if (uploadContainer) {
        uploadContainer.classList.add('hidden');
      } else if (uploadZone) {
        uploadZone.classList.add('hidden');
      }
      // Show a message
      if (!msg) {
        msg = document.createElement('div');
        msg.id = viewerMsgId;
        msg.className = 'card viewer-message';
        msg.textContent = 'You have viewer access. You cannot start new jobs.';
        uploadZone.parentNode.insertBefore(msg, uploadZone);
      } else {
        msg.classList.remove('hidden');
      }
    } else {
      if (uploadZone) uploadZone.classList.remove('hidden');
      if (msg) msg.classList.add('hidden');
    }
  }

  function showEditMode() {
    if (workspaceViewMode) workspaceViewMode.classList.add('hidden');
    if (workspaceEditMode) workspaceEditMode.classList.remove('hidden');
    workspaceSelect.value = currentWorkspaceId || '';
    if (newWorkspaceInput) newWorkspaceInput.classList.add('hidden');
    if (workspaceActionBtn) workspaceActionBtn.textContent = 'Select';
  }

  function showViewMode() {
    if (workspaceViewMode) workspaceViewMode.classList.remove('hidden');
    if (workspaceEditMode) workspaceEditMode.classList.add('hidden');
  }

  // Handle "Change" link click
  if (changeWorkspaceLink) {
    changeWorkspaceLink.addEventListener('click', (e) => {
      e.preventDefault();
      showEditMode();
    });
  }

  // Handle "Cancel" link click
  if (cancelWorkspaceLink) {
    cancelWorkspaceLink.addEventListener('click', (e) => {
      e.preventDefault();
      showViewMode();
    });
  }

  // Handle workspace select change (toggle new workspace input)
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

  // Handle action button (Select or Add)
  if (workspaceActionBtn) {
    workspaceActionBtn.addEventListener('click', async () => {
      if (workspaceSelect.value === '__NEW__') {
        // Create new workspace
        const name = newWorkspaceInput ? newWorkspaceInput.value.trim() : '';
        if (!name) {
          await showAlertModal('Please enter a workspace name');
          return;
        }

        try {
          const res = await fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });

          if (res.ok) {
            const newWorkspace = await res.json();
            currentWorkspaceId = newWorkspace.id;
            // Save to cookie
            document.cookie = `processAce_workspaceId=${currentWorkspaceId}; path=/; max-age=31536000; SameSite=Strict`;

            await loadWorkspaces();
            showViewMode();
            loadJobsFromServer();
          } else {
            await showAlertModal('Failed to create workspace');
          }
        } catch (err) {
          console.error('Error creating workspace', err);
          await showAlertModal('Error creating workspace');
        }
      } else {
        // Select existing workspace
        currentWorkspaceId = workspaceSelect.value;
        // Save to cookie
        document.cookie = `processAce_workspaceId=${currentWorkspaceId}; path=/; max-age=31536000; SameSite=Strict`;

        updateWorkspaceDisplay();
        showViewMode();
        loadJobsFromServer();
      }
    });
  }

  // Load workspaces on page load - Moved to end of file to ensure polling logic is ready
  // loadWorkspaces();

  // Modal Elements
  // Modal Elements
  const modal = document.getElementById('artifactModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const closeModal = document.querySelector('.close-modal');

  // Event Delegation for Modal Body (Dynamic Elements)
  modalBody.addEventListener('click', (e) => {
    // Delete Row Button
    const deleteBtn = e.target.closest('.delete-row-btn');
    if (deleteBtn) {
      deleteTableRow(deleteBtn);
    }
  });

  // Modal Control Functions
  function openArtifactModal() {
    modal.classList.remove('hidden');
    // Push a state so the back button can close the modal
    history.pushState({ modalOpen: true }, '');
  }

  function closeArtifactModal() {
    destroyBpmn();
    destroyDocEditor();
    if (!modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
    }
  }

  // Close Modal Events
  closeModal.addEventListener('click', () => history.back());

  window.addEventListener('click', (e) => {
    if (e.target === modal) history.back();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      history.back();
    }
  });

  window.addEventListener('popstate', () => {
    // If the state doesn't have modalOpen, close the modal
    closeArtifactModal();
  });

  // Drag & Drop
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length) handleFiles(files);
  });

  // Browse
  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFiles(fileInput.files);
  });

  async function handleFiles(files) {
    const file = files[0]; // Process single file for now

    // Read inputs BEFORE modifying DOM
    const processNameInput = document.getElementById('processNameInput');
    const processName = processNameInput ? processNameInput.value.trim() : '';

    const providerSelect = document.getElementById('providerSelect');
    const provider = providerSelect ? providerSelect.value : '';

    const modelSelect = document.getElementById('modelSelect');
    const model = modelSelect ? modelSelect.value.trim() : '';

    // Show loading state
    const originalContent = uploadZone.innerHTML;
    uploadZone.innerHTML = `
            <div class="upload-progress">
                <div class="spinner"></div>
                <p>Uploading ${file.name}...</p>
            </div>
        `;

    const formData = new FormData();

    // Append metadata first
    formData.append('workspaceId', currentWorkspaceId);

    if (processName) {
      formData.append('processName', processName);
    }

    if (provider) {
      formData.append('provider', provider);
    }
    if (model) {
      formData.append('model', model);
    }

    // Append file last
    formData.append('file', file);

    try {
      const response = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        const processName = processNameInput ? processNameInput.value.trim() : null;
        addJobToTrack(data.jobId, file.name, processName);
      } else {
        await showAlertModal('Upload failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error:', error);
      await showAlertModal('Upload error');
    } finally {
      // Reset upload zone after short delay
      setTimeout(() => {
        uploadZone.innerHTML = originalContent;
        // Re-bind events if necessary or just reload page content (simple approach: simple reset)
        // Actually, innerHTML rewrite destroys event listeners on browseBtn.
        // Better approach: toggle visibility of child elements.
        // For this quick demo, we'll just reload page or keep simple.
        window.location.reload();
      }, 1000);
    }
  }

  // Job Tracking - Fetch from server (SQLite)
  let trackedJobs = [];

  async function loadJobsFromServer() {
    try {
      const url = currentWorkspaceId
        ? `/api/jobs?workspaceId=${encodeURIComponent(currentWorkspaceId)}`
        : '/api/jobs';
      const res = await fetch(url);
      if (res.ok) {
        trackedJobs = await res.json();
        renderJobs();
      }
    } catch (err) {
      console.error('Failed to load jobs', err);
    }
  }

  // Load jobs on page load - REMOVED (waiting for workspace init)
  // loadJobsFromServer();

  function addJobToTrack() {
    // Job will be fetched from server on next poll/reload
    // Just trigger immediate refresh
    loadJobsFromServer();
  }

  // Event Delegation for Delete
  jobsList.addEventListener('click', async (e) => {
    // Edit Job Name (Toggle Mode)
    const editBtn = e.target.closest('.edit-job-btn');
    if (editBtn) {
      const jobId = editBtn.dataset.id;
      const container = document.getElementById(`job-title-container-${jobId}`);
      const editContainer = document.getElementById(`job-edit-container-${jobId}`);
      if (container && editContainer) {
        container.classList.add('hidden');
        editContainer.classList.remove('hidden');
        editContainer.querySelector('input').focus();
      }
      return;
    }

    // Save Job Name
    const saveBtn = e.target.closest('.save-job-btn');
    if (saveBtn) {
      const jobId = saveBtn.dataset.id;
      const input = document.getElementById(`job-input-${jobId}`);
      const newName = input.value.trim();

      if (newName) {
        try {
          const res = await fetch(`/api/jobs/${jobId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ processName: newName }),
          });

          if (res.ok) {
            loadJobsFromServer(); // Refresh list
          } else {
            await showAlertModal('Failed to update name');
          }
        } catch (err) {
          console.error('Error updating job name', err);
        }
      } else {
        // If empty, maybe just cancel? Or allow clearing?
        // For now, let's treat empty as valid (clearing custom name, fallback to filename?
        // Backend logic: processName = "" -> updates DB.
        // Frontend render: processName || filename. So it works.
        // But let's allow it.
        try {
          const res = await fetch(`/api/jobs/${jobId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ processName: newName }), // empty string
          });
          if (res.ok) loadJobsFromServer();
        } catch (e) {
          console.error(e);
        }
      }
      return;
    }

    // Cancel Edit
    const cancelBtn = e.target.closest('.cancel-job-btn');
    if (cancelBtn) {
      const jobId = cancelBtn.dataset.id;
      const container = document.getElementById(`job-title-container-${jobId}`);
      const editContainer = document.getElementById(`job-edit-container-${jobId}`);
      if (container && editContainer) {
        container.classList.remove('hidden');
        editContainer.classList.add('hidden');
      }
      return;
    }

    // Delete Job
    const deleteBtn = e.target.closest('.delete-job-btn');
    if (deleteBtn) {
      const jobId = deleteBtn.dataset.id;
      deleteJob(jobId);
      return;
    }

    // View Artifact
    const viewBtn = e.target.closest('.view-artifact-btn');
    if (viewBtn) {
      e.preventDefault();
      const { id, type } = viewBtn.dataset;
      const canEdit = viewBtn.dataset.canEdit === 'true';
      viewArtifact(id, type, canEdit);
    }
  });

  async function viewArtifact(id, type, canEdit) {
    const modalContent = document.querySelector('#artifactModal .modal-content');
    if (type === 'bpmn') {
      modalContent.classList.add('modal-content-expanded');
    } else {
      modalContent.classList.remove('modal-content-expanded');
    }
    openArtifactModal();
    modalBody.innerHTML = '<div class="spinner spinner-centered"></div>';
    modalTitle.textContent = `Viewing ${type.toUpperCase()}`;

    try {
      const res = await fetch(`/api/artifacts/${id}/content?view=true`);
      if (!res.ok) throw new Error('Failed to load content');

      let content;
      const contentType = res.headers.get('content-type');

      if (contentType.includes('application/json')) {
        content = await res.json();
      } else {
        content = await res.text();
      }

      currentCanEdit = canEdit;
      renderModalContent(type, content, id, canEdit);
    } catch (err) {
      modalBody.innerHTML = `<p class="text-error">Error loading artifact: ${err.message}</p>`;
    }
  }

  let bpmnInstance = null;
  let currentArtifactId = null;
  let currentArtifactContent = null;
  let currentArtifactType = null; // Store type for re-rendering
  let currentCanEdit = false; // Store permission for re-rendering

  function renderModalContent(type, content, artifactId, canEdit = false) {
    currentArtifactId = artifactId;
    currentArtifactContent = content;
    currentArtifactType = type;

    if (type === 'bpmn') {
      // Set up container with Control Bar
      modalBody.innerHTML = `
                <div class="bpmn-controls">
                    <div id="viewControls" class="bpmn-controls-group">
                        ${canEdit ? `<button class="bpmn-btn primary" id="editBpmn">Edit Diagram</button>` : ''}
                        <button class="bpmn-btn primary" id="resetZoom">Fit to View</button>
                        <div class="dropdown-wrapper">
                            <button class="bpmn-btn primary" id="exportBpmnBtn">Export ▼</button>
                            <div id="bpmnExportMenu" class="dropdown-menu hidden">
                                <a href="#" id="exportBpmnXml" class="dropdown-menu-item">BPMN XML</a>
                                <a href="#" id="exportBpmnPng" class="dropdown-menu-item">PNG Image</a>
                                <a href="#" id="exportBpmnSvg" class="dropdown-menu-item">SVG Image</a>
                            </div>
                        </div>
                    </div>
                    <div id="editControls" class="bpmn-controls-group hidden">
                        <button class="bpmn-btn primary" id="saveBpmn">Save Changes</button>
                        <button class="bpmn-btn" id="cancelEdit">Cancel</button>
                    </div>
                </div>
                <div id="bpmn-canvas"></div>
            `;

      loadBpmnViewer(content);

      // Bind Export Menu
      const exportBtn = document.getElementById('exportBpmnBtn');
      const exportMenu = document.getElementById('bpmnExportMenu');
      // Close other menus if any (simple toggle)
      if (exportBtn) {
        exportBtn.onclick = (e) => {
          e.stopPropagation();
          exportMenu.classList.toggle('hidden');
        };
        // Close menu when clicking outside
        window.addEventListener('click', () => {
          if (exportMenu && !exportMenu.classList.contains('hidden'))
            exportMenu.classList.add('hidden');
        });
      }

      document.getElementById('exportBpmnXml').onclick = (e) => {
        e.preventDefault();
        downloadBpmnXml();
      };
      document.getElementById('exportBpmnPng').onclick = (e) => {
        e.preventDefault();
        downloadBpmnPng();
      };
      document.getElementById('exportBpmnSvg').onclick = (e) => {
        e.preventDefault();
        downloadSvg();
      };
    } else if (type === 'sipoc' || type === 'raci') {
      if (!Array.isArray(content)) {
        modalBody.innerHTML = '<pre>' + JSON.stringify(content, null, 2) + '</pre>';
        return;
      }
      // Control Bar
      const isSipoc = type === 'sipoc';
      let html = `
                <div class="table-controls table-controls-bar">
                    ${canEdit ? `<button class="bpmn-btn primary" id="btn-edit-table">Edit ${isSipoc ? 'SIPOC' : 'RACI'}</button>` : ''}
                    <button class="bpmn-btn primary btn-export-csv" id="btn-export-csv">Export CSV</button>
                    <div id="editTableControls" class="bpmn-controls-group hidden">
                         <button class="bpmn-btn primary" id="btn-add-row">+ Add Row</button>
                         <button class="bpmn-btn primary" id="btn-save-table">Save Changes</button>
                         <button class="bpmn-btn" id="btn-cancel-table">Cancel</button>
                    </div>
                </div>
                <div id="table-container">
            `;

      const headers = isSipoc
        ? ['Supplier', 'Input', 'Process', 'Output', 'Customer']
        : ['Activity', 'Responsible', 'Accountable', 'Consulted', 'Informed'];

      const keys = isSipoc
        ? ['supplier', 'input', 'process_step', 'output', 'customer']
        : ['activity', 'responsible', 'accountable', 'consulted', 'informed'];

      html += `<table class="data-table" id="viewTable"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;

      content.forEach((row) => {
        html += '<tr>';
        keys.forEach((key) => (html += `<td>${row[key] || ''}</td>`));
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      modalBody.innerHTML = html;

      // Attach Event Listeners
      const editBtn = document.getElementById('btn-edit-table');
      if (editBtn) editBtn.addEventListener('click', () => switchToTableEditMode(type));

      const exportBtn = document.getElementById('btn-export-csv');
      if (exportBtn) exportBtn.addEventListener('click', () => downloadTableCsv(type));

      const addBtn = document.getElementById('btn-add-row');
      if (addBtn) addBtn.addEventListener('click', () => addTableRow(type));

      const saveBtn = document.getElementById('btn-save-table');
      if (saveBtn) saveBtn.addEventListener('click', () => saveTableChanges(type));

      const cancelBtn = document.getElementById('btn-cancel-table');
      if (cancelBtn) cancelBtn.addEventListener('click', cancelTableEdit);
    } else if (type === 'doc') {
      // Markdown
      if (typeof marked === 'undefined') {
        modalBody.innerHTML = '<p class="text-error">Error: Marked library not loaded.</p>';
        return;
      }
      modalBody.innerHTML = `
                <div class="doc-controls doc-controls-bar">
                    ${canEdit ? `<button class="bpmn-btn primary" id="editDoc">Edit Document</button>` : ''}
                    <button class="bpmn-btn primary btn-download-md" id="btn-export-md">Download MD</button>
                    <button class="bpmn-btn primary btn-print-doc" id="btn-print-doc">Print / PDF</button>

                    <div id="editDocControls" class="bpmn-controls-group hidden">
                         <button class="bpmn-btn primary" id="saveDoc">Save Changes</button>
                         <button class="bpmn-btn" id="cancelDocEdit">Cancel</button>
                    </div>
                </div>
                <div id="markdown-content" class="markdown-content">${marked.parse(content)}</div>
                <textarea id="markdown-editor" class="hidden"></textarea>
            `;

      if (canEdit) document.getElementById('editDoc').onclick = () => switchToDocEditMode();
      document.getElementById('btn-export-md').onclick = downloadMarkdown;
      document.getElementById('btn-print-doc').onclick = printDoc;
    } else {
      modalBody.textContent =
        typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
    }
  }

  // BPMN Helper Functions
  function loadBpmnViewer(xml) {
    destroyBpmn();

    // Initialize VIEWER (using Modeler constructor but as viewer if needed, or relying on Viewer not overwriting)
    // We will match the previous logic: if Modeler script is loaded, BpmnJS is the Modeler.
    bpmnInstance = new BpmnJS({
      container: '#bpmn-canvas',
      height: 600,
    });

    bpmnInstance
      .importXML(xml)
      .then(() => {
        const canvas = bpmnInstance.get('canvas');
        canvas.zoom('fit-viewport');

        // Hide palette in View Mode
        const palette = document.querySelector('.djs-palette');
        if (palette) palette.style.display = 'none';

        // Bind View Controls
        const editBtn = document.getElementById('editBpmn');
        if (editBtn) editBtn.onclick = () => switchToEditMode();

        const resetBtn = document.getElementById('resetZoom');
        if (resetBtn) resetBtn.onclick = () => canvas.zoom('fit-viewport');

        const dlBtn = document.getElementById('downloadSvg');
        if (dlBtn) dlBtn.onclick = downloadSvg;
      })
      .catch((err) => {
        console.error('BPMN Import Error', err);
        const canvas = document.getElementById('bpmn-canvas');
        if (canvas)
          canvas.innerHTML = `<p class="error-inline">Error rendering BPMN: ${err.message}</p>`;
      });
  }

  function switchToEditMode() {
    destroyBpmn();

    // Toggle UI
    document.getElementById('viewControls').classList.add('hidden');
    document.getElementById('editControls').classList.remove('hidden');

    // Initialize MODELER
    bpmnInstance = new BpmnJS({
      container: '#bpmn-canvas',
      height: 600,
    });

    bpmnInstance
      .importXML(currentArtifactContent)
      .then(() => {
        const canvas = bpmnInstance.get('canvas');
        canvas.zoom('fit-viewport');

        // Show palette
        const palette = document.querySelector('.djs-palette');
        if (palette) palette.style.display = 'block';

        document.getElementById('saveBpmn').onclick = saveBpmnChanges;
        document.getElementById('cancelEdit').onclick = cancelEdit;
      })
      .catch(async (err) => {
        console.error('Modeler Error', err);
        await showAlertModal('Error entering edit mode');
      });
  }

  async function saveBpmnChanges() {
    try {
      const { xml } = await bpmnInstance.saveXML({ format: true });

      const saveBtn = document.getElementById('saveBpmn');
      // const originalText = saveBtn.textContent; // Unused
      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      const res = await fetch(`/api/artifacts/${currentArtifactId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: xml }),
      });

      if (!res.ok) throw new Error('Save failed');

      // Success
      currentArtifactContent = xml;
      cancelEdit();
    } catch (err) {
      console.error(err);
      await showAlertModal('Failed to save changes');
      const saveBtn = document.getElementById('saveBpmn');
      if (saveBtn) {
        saveBtn.textContent = 'Save Changes';
        saveBtn.disabled = false;
      }
    }
  }

  function cancelEdit() {
    // Revert UI
    document.getElementById('viewControls').classList.remove('hidden');
    document.getElementById('editControls').classList.add('hidden');

    loadBpmnViewer(currentArtifactContent);
  }

  async function downloadSvg() {
    try {
      const { svg } = await bpmnInstance.saveSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `process.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error saving SVG', err);
    }
  }

  function destroyBpmn() {
    if (bpmnInstance) {
      bpmnInstance.destroy();
      bpmnInstance = null;
    }
  }

  let easyMDEInstance = null;

  function switchToDocEditMode() {
    // UI Toggles
    document.getElementById('editDoc').style.display = 'none';
    document.getElementById('btn-export-md').style.display = 'none';
    document.getElementById('btn-print-doc').style.display = 'none';

    const controls = document.getElementById('editDocControls');
    controls.classList.remove('hidden');
    controls.style.display = 'flex';

    document.getElementById('markdown-content').style.display = 'none';

    // Init Editor
    const textArea = document.getElementById('markdown-editor');
    easyMDEInstance = new EasyMDE({
      element: textArea,
      initialValue: currentArtifactContent,
      spellChecker: false,
      status: false,
    });

    // Bind Save/Cancel
    document.getElementById('saveDoc').onclick = saveDocChanges;
    document.getElementById('cancelDocEdit').onclick = cancelDocEdit;
  }

  async function saveDocChanges() {
    try {
      const newContent = easyMDEInstance.value();
      const saveBtn = document.getElementById('saveDoc');
      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      const res = await fetch(`/api/artifacts/${currentArtifactId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });

      if (!res.ok) throw new Error('Save failed');

      // Success
      currentArtifactContent = newContent;
      cancelDocEdit();
    } catch (err) {
      console.error(err);
      await showAlertModal('Failed to save changes');
      const saveBtn = document.getElementById('saveDoc');
      if (saveBtn) {
        saveBtn.textContent = 'Save Changes';
        saveBtn.disabled = false;
      }
    }
  }

  // --- Export Functions ---

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function downloadBpmnXml() {
    if (!bpmnInstance) return;
    try {
      const { xml } = await bpmnInstance.saveXML({ format: true });
      downloadFile(`process-${currentArtifactId}.bpmn`, xml, 'application/xml');
    } catch (err) {
      console.error('Error exporting BPMN XML', err);
      await showAlertModal('Failed to export BPMN XML');
    }
  }

  async function downloadBpmnPng() {
    if (!bpmnInstance) return;
    try {
      const { svg } = await bpmnInstance.saveSVG();

      // Create an image from the SVG
      const img = new Image();
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(function (blob) {
          const pngUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `process-${currentArtifactId}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(pngUrl);
          URL.revokeObjectURL(url);
        }, 'image/png');
      };

      img.src = url;
    } catch (err) {
      console.error('Error exporting BPMN PNG', err);
      await showAlertModal('Failed to export BPMN PNG');
    }
  }

  function downloadTableCsv(type) {
    if (!Array.isArray(currentArtifactContent)) return;

    const isSipoc = type === 'sipoc';
    const headers = isSipoc
      ? ['Supplier', 'Input', 'Process', 'Output', 'Customer']
      : ['Activity', 'Responsible', 'Accountable', 'Consulted', 'Informed'];

    const keys = isSipoc
      ? ['supplier', 'input', 'process_step', 'output', 'customer']
      : ['activity', 'responsible', 'accountable', 'consulted', 'informed'];

    // CSV Header
    let csvContent = headers.join(',') + '\n';

    // CSV Rows
    currentArtifactContent.forEach((row) => {
      const rowData = keys.map((key) => {
        let val = row[key] || '';
        // Escape quotes and wrap in quotes if contains comma
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csvContent += rowData.join(',') + '\n';
    });

    downloadFile(`${type}-${currentArtifactId}.csv`, csvContent, 'text/csv;charset=utf-8;');
  }

  function downloadMarkdown() {
    downloadFile(
      `doc-${currentArtifactId}.md`,
      currentArtifactContent,
      'text/markdown;charset=utf-8',
    );
  }

  function printDoc() {
    window.print();
  }

  function cancelDocEdit() {
    destroyDocEditor();

    // Render View
    const viewDiv = document.getElementById('markdown-content');
    viewDiv.innerHTML = marked.parse(currentArtifactContent);
    viewDiv.style.display = 'block';

    // UI Toggles
    // UI Toggles
    document.getElementById('editDoc').style.display = 'inline-block';
    document.getElementById('btn-export-md').style.display = 'inline-block';
    document.getElementById('btn-print-doc').style.display = 'inline-block';
    document.getElementById('editDocControls').style.display = 'none';
  }

  function destroyDocEditor() {
    if (easyMDEInstance) {
      easyMDEInstance.toTextArea();
      easyMDEInstance = null;
    }
  }

  // Override close function to destroy viewer and editor

  async function deleteJob(jobId) {
    if (!(await showConfirmModal('Permanently delete this job and file?'))) return;

    // Call backend to cleanup files, then refresh from server
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        loadJobsFromServer();
      } else {
        console.error('Delete failed');
      }
    } catch (err) {
      console.error('Delete failed on server', err);
    }
  }

  let updateJobs = async function () {
    // Simply refresh from server - all job state is in SQLite
    await loadJobsFromServer();
  };

  function renderJobs() {
    jobCount.textContent = trackedJobs.length;
    if (trackedJobs.length === 0) {
      jobsList.innerHTML =
        '<div class="empty-state"><p>No jobs yet. Upload evidence to start.</p></div>';
      return;
    }

    jobsList.innerHTML = trackedJobs
      .map(
        (job) => `
            <div class="job-card">
                <div class="job-info">
                    <div class="job-title-row">
                        <div class="job-title-container" id="job-title-container-${job.id}">
                            <h4>${job.processName || job.filename}</h4>
                            ${job.processName ? `<span class="job-filename-label">(${job.filename})</span>` : ''}
                            ${job.canEdit ? `<button class="edit-job-btn" data-id="${job.id}" data-current-name="${job.processName || ''}" title="Edit Name">✏️</button>` : ''}
                        </div>
                         <div id="job-edit-container-${job.id}" class="job-edit-container hidden">
                            <input type="text" id="job-input-${job.id}" value="${job.processName || ''}" placeholder="Process Name" class="job-edit-input">
                            <button class="save-job-btn btn-primary" data-id="${job.id}">Save</button>
                            <button class="cancel-job-btn" data-id="${job.id}">Cancel</button>
                        </div>
                        ${job.canDelete ? `<button class="delete-job-btn" data-id="${job.id}">&times;</button>` : ''}
                    </div>
                    <div class="job-meta">ID: ${job.id.substring(0, 8)}...</div>
                    ${renderArtifacts(job.result, job.canEdit)}
                    ${job.status === 'lost' ? `<div class="job-lost-message">Job lost during server restart</div>` : ''}
                </div>
                <div class="job-status status-${job.status}">
                    <span class="status-dot"></span>
                    ${job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </div>
            </div>
        `,
      )
      .join('');
  }

  function renderArtifacts(result, canEdit = false) {
    if (!result) return '';

    let html = '<div class="artifact-container">';

    // Backward compatibility
    if (result.artifactId && !result.artifacts) {
      html += `<a href="/api/artifacts/${result.artifactId}/content" class="btn-primary artifact-btn-download">Download BPMN</a>`;
    }

    // New formatted artifacts
    if (result.artifacts && Array.isArray(result.artifacts)) {
      result.artifacts.forEach((art) => {
        const label = art.type.toUpperCase();

        // container for buttons group
        html += `<div class="artifact-btn-group">`;

        // Download Button
        html += `<a href="/api/artifacts/${art.id}/content" class="btn-primary artifact-btn-download grouped">${label}</a>`;

        if (['sipoc', 'raci', 'doc', 'bpmn'].includes(art.type)) {
          html += `<button class="btn-primary view-artifact-btn artifact-btn-view" data-id="${art.id}" data-type="${art.type}" data-can-edit="${canEdit}">👁️</button>`;
        } else {
          // Just rounded corner fix if no view button
          html = html.replace('artifact-btn-download grouped', 'artifact-btn-download');
        }

        html += `</div>`;
      });
    }

    html += '</div>';
    return html;
  }

  // --- Table Helper Functions ---
  function switchToTableEditMode(type) {
    // UI Toggles
    // UI Toggles
    document.querySelector('.table-controls button').classList.add('hidden'); // Hide "Edit"
    const exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) exportBtn.classList.add('hidden');

    const controls = document.getElementById('editTableControls');
    controls.classList.remove('hidden');

    // Render Editable Table
    const container = document.getElementById('table-container');
    container.innerHTML = generateEditableTable(type, currentArtifactContent);
  }

  function cancelTableEdit() {
    // Re-render View by reloading modal content
    // We need to infer type from previous context or current state
    if (currentArtifactContent && Array.isArray(currentArtifactContent)) {
      // Heuristic: check keys in first row or just default
      if (currentArtifactContent.length > 0) {
        if ('activity' in currentArtifactContent[0]) {
          /* raci */
        }
      }
      // Fallback if empty, maybe check existing headers if possible?
      // Or just assume sipoc if not detectable?
      // Better: Pass type to cancel or store it.
      // Ideally we stored `currentArtifactType` in `viewArtifact`
      renderModalContent(
        currentArtifactType,
        currentArtifactContent,
        currentArtifactId,
        currentCanEdit,
      );
    } else {
      // Fallback
      renderModalContent('sipoc', currentArtifactContent, currentArtifactId, currentCanEdit);
    }
  }

  function generateEditableTable(type, data) {
    let headers = [];
    let keys = [];

    if (type === 'sipoc') {
      headers = ['Supplier', 'Input', 'Process', 'Output', 'Customer'];
      keys = ['supplier', 'input', 'process_step', 'output', 'customer'];
    } else {
      headers = ['Activity', 'Responsible', 'Accountable', 'Consulted', 'Informed'];
      keys = ['activity', 'responsible', 'accountable', 'consulted', 'informed'];
    }

    let html = `<table class="data-table" id="editTable"><thead><tr>`;
    headers.forEach((h) => (html += `<th>${h}</th>`));
    html += `<th>Action</th></tr></thead><tbody>`;

    data.forEach((row) => {
      html += `<tr>`;
      keys.forEach((key) => {
        html += `<td><input type="text" class="table-input" data-key="${key}" value="${(row[key] || '').replace(/"/g, '&quot;')}" /></td>`;
      });
      html += `<td><button class="delete-row-btn">&times;</button></td></tr>`;
    });
    html += `</tbody></table>`;
    return html;
  }

  function addTableRow(type) {
    const tbody = document.querySelector('#editTable tbody');
    const tr = document.createElement('tr');

    let keys =
      type === 'sipoc'
        ? ['supplier', 'input', 'process_step', 'output', 'customer']
        : ['activity', 'responsible', 'accountable', 'consulted', 'informed'];

    let html = '';
    keys.forEach((key) => {
      html += `<td><input type="text" class="table-input" data-key="${key}" value="" /></td>`;
    });
    html += `<td><button class="delete-row-btn">&times;</button></td>`;
    tr.innerHTML = html;
    tbody.appendChild(tr);
  }

  function deleteTableRow(btn) {
    btn.closest('tr').remove();
  }

  async function saveTableChanges(_type) {
    try {
      const rows = document.querySelectorAll('#editTable tbody tr');
      const newData = [];

      rows.forEach((tr) => {
        const rowObj = {};
        const inputs = tr.querySelectorAll('input');
        inputs.forEach((input) => {
          const key = input.dataset.key;
          rowObj[key] = input.value;
        });
        newData.push(rowObj);
      });

      // Save
      const saveBtn = document.querySelector('#btn-save-table');
      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      const res = await fetch(`/api/artifacts/${currentArtifactId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newData }),
      });

      if (!res.ok) throw new Error('Save failed');

      // Success
      currentArtifactContent = newData;
      cancelTableEdit();
    } catch (err) {
      console.error(err);
      await showAlertModal('Failed to save changes');
      const saveBtn = document.querySelector('#btn-save-table');
      if (saveBtn) {
        saveBtn.textContent = 'Save Changes';
        saveBtn.disabled = false;
      }
    }
  }

  // Initial render and polling
  // Initial render and polling
  renderJobs();

  // Smart Polling
  const ACTIVE_STATUSES = ['pending', 'processing', 'in_progress', 'queued'];
  let pollTimeout = null;

  function scheduleNextPoll() {
    if (pollTimeout) clearTimeout(pollTimeout);

    const hasActiveJobs = trackedJobs.some((job) => ACTIVE_STATUSES.includes(job.status));
    const interval = hasActiveJobs ? 5000 : 30000;

    pollTimeout = setTimeout(updateJobs, interval);
  }

  // Override updateJobs to include rescheduling
  const originalUpdateJobs = updateJobs;
  updateJobs = async function () {
    await originalUpdateJobs();
    scheduleNextPoll();
  };

  // Start by loading workspaces, which will trigger the first updateJobs()
  // This ensures we have the correct workspace ID before fetching jobs
  loadWorkspaces();
});
