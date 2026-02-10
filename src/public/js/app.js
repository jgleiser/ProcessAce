document.addEventListener('DOMContentLoaded', async () => {
    // Auth Check handled by header.js for UI, but we might want to ensure we have the user object for other things?
    // app.js uses currentUser for some things?
    // Let's check lines 1-48 carefully. 
    // It fetches /api/auth/me to get currentUser.
    // It also updates userDisplay/adminLink which header.js now does.
    // It also sets global `currentUser` variable (line 3).
    // Does app.js usage `currentUser` later?
    // Scanning...
    // It doesn't seem to use `currentUser` anywhere else in the provided code snippet (lines 1-800).
    // But `evidence.js` (upload) uses `req.user` on backend. Frontend just sends file.
    // So we might get away with just removing the UI update parts.

    // However, to be safe, let's keep the fetch but remove the UI manipulation.
    // AND remove the logout listener.

    // Better yet: header.js is included BEFORE app.js.
    // We can rely on header.js to handle UI.
    // We can just keep the redirection logic if needed.

    // Let's remove lines 3-33 (Auth Check & UI) and 41-48 (Logout).

    // Wait, line 1 is event listener. 
    // I will replace start of file.

    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const jobsList = document.getElementById('jobsList');
    const jobCount = document.getElementById('jobCount');

    // Workspace logic follows...

    // NEW WORKSPACE SWITCHER (View/Edit Mode)
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
                const validSavedWorkspace = savedWorkspaceId ? workspacesCache.find(w => w.id === savedWorkspaceId) : null;

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
            workspacesCache.forEach(ws => {
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
        const ws = workspacesCache.find(w => w.id === currentWorkspaceId);
        currentWorkspaceName = ws ? ws.name : 'None';
        if (currentWorkspaceNameEl) currentWorkspaceNameEl.textContent = currentWorkspaceName;
    }

    function showEditMode() {
        if (workspaceViewMode) workspaceViewMode.style.display = 'none';
        if (workspaceEditMode) workspaceEditMode.style.display = 'flex';
        workspaceSelect.value = currentWorkspaceId || '';
        if (newWorkspaceInput) newWorkspaceInput.style.display = 'none';
        if (workspaceActionBtn) workspaceActionBtn.textContent = 'Select';
    }

    function showViewMode() {
        if (workspaceViewMode) workspaceViewMode.style.display = 'flex';
        if (workspaceEditMode) workspaceEditMode.style.display = 'none';
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
                    newWorkspaceInput.style.display = 'block';
                    newWorkspaceInput.focus();
                }
                if (workspaceActionBtn) workspaceActionBtn.textContent = 'Add';
            } else {
                if (newWorkspaceInput) newWorkspaceInput.style.display = 'none';
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
                    alert('Please enter a workspace name');
                    return;
                }

                try {
                    const res = await fetch('/api/workspaces', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name })
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
                        alert('Failed to create workspace');
                    }
                } catch (err) {
                    console.error('Error creating workspace', err);
                    alert('Error creating workspace');
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

    window.addEventListener('popstate', (e) => {
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

        // Show loading state
        const originalContent = uploadZone.innerHTML;
        uploadZone.innerHTML = `
            <div class="upload-progress">
                <div class="spinner" style="border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid var(--primary); border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
                <p>Uploading ${file.name}...</p>
            </div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        `;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('workspaceId', currentWorkspaceId);

        const processNameInput = document.getElementById('processNameInput');
        if (processNameInput && processNameInput.value.trim()) {
            formData.append('processName', processNameInput.value.trim());
        }

        const providerSelect = document.getElementById('providerSelect');
        const modelSelect = document.getElementById('modelSelect');

        if (providerSelect) {
            formData.append('provider', providerSelect.value);
        }
        if (modelSelect && modelSelect.value.trim()) {
            formData.append('model', modelSelect.value.trim());
        }

        try {
            const response = await fetch('/api/evidence/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (response.ok) {
                const processName = processNameInput ? processNameInput.value.trim() : null;
                addJobToTrack(data.jobId, file.name, processName);
            } else {
                alert('Upload failed: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Upload error');
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

    function addJobToTrack(jobId, filename, processName) {
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
                container.style.display = 'none';
                editContainer.style.display = 'flex';
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
                        body: JSON.stringify({ processName: newName })
                    });

                    if (res.ok) {
                        loadJobsFromServer(); // Refresh list
                    } else {
                        alert('Failed to update name');
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
                        body: JSON.stringify({ processName: newName }) // empty string
                    });
                    if (res.ok) loadJobsFromServer();
                } catch (e) { console.error(e); }
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
                container.style.display = 'flex';
                editContainer.style.display = 'none';
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
            viewArtifact(id, type);
        }
    });

    async function viewArtifact(id, type) {
        const modalContent = document.querySelector('#artifactModal .modal-content');
        if (type === 'bpmn') {
            modalContent.classList.add('modal-content-expanded');
        } else {
            modalContent.classList.remove('modal-content-expanded');
        }
        openArtifactModal();
        modalBody.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
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

            renderModalContent(type, content, id);
        } catch (err) {
            modalBody.innerHTML = `<p style="color:var(--error)">Error loading artifact: ${err.message}</p>`;
        }
    }


    let bpmnInstance = null;
    let currentArtifactId = null;
    let currentArtifactContent = null;
    let currentArtifactType = null; // Store type for re-rendering
    let isEditMode = false;

    function renderModalContent(type, content, artifactId) {
        currentArtifactId = artifactId;
        currentArtifactContent = content;
        currentArtifactType = type;
        isEditMode = false;

        if (type === 'bpmn') {
            // Set up container with Control Bar
            modalBody.innerHTML = `
                <div class="bpmn-controls">
                    <div id="viewControls" style="display:flex; gap:10px;">
                        <button class="bpmn-btn primary" id="editBpmn">Edit Diagram</button>
                        <button class="bpmn-btn primary" id="resetZoom">Fit to View</button>
                        <button class="bpmn-btn primary" id="downloadSvg">Download SVG</button>
                    </div>
                    <div id="editControls" class="hidden" style="display:none; gap:10px;">
                        <button class="bpmn-btn primary" id="saveBpmn">Save Changes</button>
                        <button class="bpmn-btn" id="cancelEdit">Cancel</button>
                    </div>
                </div>
                <div id="bpmn-canvas"></div>
            `;

            loadBpmnViewer(content);
        }
        else if (type === 'sipoc' || type === 'raci') { // JSON Array
            if (!Array.isArray(content)) {
                modalBody.innerHTML = '<pre>' + JSON.stringify(content, null, 2) + '</pre>';
                return;
            }
            // Control Bar
            const isSipoc = type === 'sipoc';
            let html = `
                <div class="table-controls" style="display:flex; justify-content:flex-end; gap:10px; margin-bottom:10px;">
                    <button class="bpmn-btn primary" id="btn-edit-table">Edit ${isSipoc ? 'SIPOC' : 'RACI'}</button>
                    <div id="editTableControls" class="hidden" style="display:none; gap:10px;">
                         <button class="bpmn-btn primary" id="btn-add-row">+ Add Row</button>
                         <button class="bpmn-btn primary" id="btn-save-table">Save Changes</button>
                         <button class="bpmn-btn" id="btn-cancel-table">Cancel</button>
                    </div>
                </div>
                <div id="table-container">
            `;

            // View Mode Table
            const headers = isSipoc
                ? ['Supplier', 'Input', 'Process', 'Output', 'Customer']
                : ['Activity', 'Responsible', 'Accountable', 'Consulted', 'Informed'];

            const keys = isSipoc
                ? ['supplier', 'input', 'process_step', 'output', 'customer']
                : ['activity', 'responsible', 'accountable', 'consulted', 'informed'];

            html += `<table class="data-table" id="viewTable"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;

            content.forEach(row => {
                html += '<tr>';
                keys.forEach(key => html += `<td>${row[key] || ''}</td>`);
                html += '</tr>';
            });
            html += '</tbody></table></div>';
            modalBody.innerHTML = html;

            // Attach Event Listeners
            const editBtn = document.getElementById('btn-edit-table');
            if (editBtn) editBtn.addEventListener('click', () => switchToTableEditMode(type));

            const addBtn = document.getElementById('btn-add-row');
            if (addBtn) addBtn.addEventListener('click', () => addTableRow(type));

            const saveBtn = document.getElementById('btn-save-table');
            if (saveBtn) saveBtn.addEventListener('click', () => saveTableChanges(type));

            const cancelBtn = document.getElementById('btn-cancel-table');
            if (cancelBtn) cancelBtn.addEventListener('click', cancelTableEdit);
        }
        else if (type === 'doc') { // Markdown
            if (typeof marked === 'undefined') {
                modalBody.innerHTML = '<p style="color:var(--error)">Error: Marked library not loaded.</p>';
                return;
            }
            modalBody.innerHTML = `
                <div class="doc-controls" style="display:flex; justify-content:flex-end; gap:10px; margin-bottom:10px;">
                    <button class="bpmn-btn primary" id="editDoc">Edit Document</button>
                    <div id="editDocControls" class="hidden" style="display:none; gap:10px;">
                         <button class="bpmn-btn primary" id="saveDoc">Save Changes</button>
                         <button class="bpmn-btn" id="cancelDocEdit">Cancel</button>
                    </div>
                </div>
                <div id="markdown-content" class="markdown-content">${marked.parse(content)}</div>
                <textarea id="markdown-editor" style="display:none;"></textarea>
            `;

            document.getElementById('editDoc').onclick = () => switchToDocEditMode();
        }
        else {
            modalBody.textContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
        }
    }

    // BPMN Helper Functions
    function loadBpmnViewer(xml) {
        destroyBpmn();

        // Initialize VIEWER (using Modeler constructor but as viewer if needed, or relying on Viewer not overwriting)
        // We will match the previous logic: if Modeler script is loaded, BpmnJS is the Modeler.
        bpmnInstance = new BpmnJS({
            container: '#bpmn-canvas',
            height: 600
        });

        bpmnInstance.importXML(xml)
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
            .catch(err => {
                console.error('BPMN Import Error', err);
                const canvas = document.getElementById('bpmn-canvas');
                if (canvas) canvas.innerHTML = `<p style="color:var(--error); padding:20px;">Error rendering BPMN: ${err.message}</p>`;
            });
    }

    function switchToEditMode() {
        destroyBpmn();
        isEditMode = true;

        // Toggle UI
        document.getElementById('viewControls').style.display = 'none';
        document.getElementById('editControls').classList.remove('hidden');
        document.getElementById('editControls').style.display = 'flex';

        // Initialize MODELER
        bpmnInstance = new BpmnJS({
            container: '#bpmn-canvas',
            height: 600
        });

        bpmnInstance.importXML(currentArtifactContent)
            .then(() => {
                const canvas = bpmnInstance.get('canvas');
                canvas.zoom('fit-viewport');

                // Show palette
                const palette = document.querySelector('.djs-palette');
                if (palette) palette.style.display = 'block';

                document.getElementById('saveBpmn').onclick = saveBpmnChanges;
                document.getElementById('cancelEdit').onclick = cancelEdit;
            })
            .catch(err => {
                console.error('Modeler Error', err);
                alert('Error entering edit mode');
            });
    }

    async function saveBpmnChanges() {
        try {
            const { xml } = await bpmnInstance.saveXML({ format: true });

            const saveBtn = document.getElementById('saveBpmn');
            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;

            const res = await fetch(`/api/artifacts/${currentArtifactId}/content`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: xml })
            });

            if (!res.ok) throw new Error('Save failed');

            // Success
            currentArtifactContent = xml;
            cancelEdit();

        } catch (err) {
            console.error(err);
            alert('Failed to save changes');
            const saveBtn = document.getElementById('saveBpmn');
            if (saveBtn) {
                saveBtn.textContent = 'Save Changes';
                saveBtn.disabled = false;
            }
        }
    }

    function cancelEdit() {
        isEditMode = false;
        // Revert UI
        document.getElementById('viewControls').style.display = 'flex';
        document.getElementById('editControls').style.display = 'none';

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
        isEditMode = true;

        // UI Toggles
        document.getElementById('editDoc').style.display = 'none';
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
            status: false
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
                body: JSON.stringify({ content: newContent })
            });

            if (!res.ok) throw new Error('Save failed');

            // Success
            currentArtifactContent = newContent;
            cancelDocEdit();

        } catch (err) {
            console.error(err);
            alert('Failed to save changes');
            const saveBtn = document.getElementById('saveDoc');
            if (saveBtn) {
                saveBtn.textContent = 'Save Changes';
                saveBtn.disabled = false;
            }
        }
    }

    function cancelDocEdit() {
        isEditMode = false;
        destroyDocEditor();

        // Render View
        const viewDiv = document.getElementById('markdown-content');
        viewDiv.innerHTML = marked.parse(currentArtifactContent);
        viewDiv.style.display = 'block';

        // UI Toggles
        document.getElementById('editDoc').style.display = 'inline-block';
        document.getElementById('editDocControls').style.display = 'none';
    }

    function destroyDocEditor() {
        if (easyMDEInstance) {
            easyMDEInstance.toTextArea();
            easyMDEInstance = null;
        }
    }

    // Override close function to destroy viewer and editor


    function deleteJob(jobId) {
        if (!confirm('Permanently delete this job and file?')) return;

        // Call backend to cleanup files, then refresh from server
        fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
            .then(() => loadJobsFromServer())
            .catch(err => console.error('Delete failed on server', err));
    }

    async function updateJobs() {
        // Simply refresh from server - all job state is in SQLite
        await loadJobsFromServer();
    }

    function renderJobs() {
        jobCount.textContent = trackedJobs.length;
        if (trackedJobs.length === 0) {
            jobsList.innerHTML = '<div class="empty-state"><p>No jobs yet. Upload evidence to start.</p></div>';
            return;
        }

        jobsList.innerHTML = trackedJobs.map(job => `
            <div class="job-card">
                <div class="job-info">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start">
                        <div class="job-title-container" id="job-title-container-${job.id}" style="display:flex; align-items:center; gap:8px;">
                            <h4 style="margin:0;">${job.processName || job.filename}</h4>
                            ${job.processName ? `<span style="font-size:0.8em; color:#666; font-weight:normal">(${job.filename})</span>` : ''}
                            <button class="edit-job-btn" data-id="${job.id}" data-current-name="${job.processName || ''}" title="Edit Name" style="background:none; border:none; color:#666; cursor:pointer; font-size:0.9rem; padding:0;">✏️</button>
                        </div>
                         <div id="job-edit-container-${job.id}" style="display:none; align-items:center; gap:5px;">
                            <input type="text" id="job-input-${job.id}" value="${job.processName || ''}" placeholder="Process Name" style="padding:4px; border:1px solid #ccc; border-radius:4px; font-size:0.9rem;">
                            <button class="save-job-btn btn-primary" data-id="${job.id}" style="padding:4px 8px; font-size:0.8rem;">Save</button>
                            <button class="cancel-job-btn" data-id="${job.id}" style="background:none; border:none; color:#666; cursor:pointer; font-size:0.8rem; text-decoration:underline;">Cancel</button>
                        </div>
                        <button class="delete-job-btn" data-id="${job.id}" style="background:none; border:none; color:#666; cursor:pointer; font-size:1.2rem;">&times;</button>
                    </div>
                    <div class="job-meta">ID: ${job.id.substring(0, 8)}...</div>
                    ${renderArtifacts(job.result)}
                    ${job.status === 'lost' ? `<div style="color:#d32f2f; font-size:0.8rem; margin-top:5px;">Job lost during server restart</div>` : ''}
                </div>
                <div class="job-status status-${job.status}">
                    <span class="status-dot"></span>
                    ${job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </div>
            </div>
        `).join('');
    }

    function renderArtifacts(result) {
        if (!result) return '';

        let html = '<div style="margin-top:8px; display:flex; gap:5px; flex-wrap:wrap;">';

        // Backward compatibility
        if (result.artifactId && !result.artifacts) {
            html += `<a href="/api/artifacts/${result.artifactId}/content" class="btn-primary" style="text-decoration:none; font-size: 0.8rem; padding: 4px 10px;">Download BPMN</a>`;
        }

        // New formatted artifacts
        if (result.artifacts && Array.isArray(result.artifacts)) {
            result.artifacts.forEach(art => {
                const label = art.type.toUpperCase();

                // container for buttons group
                html += `<div style="display:inline-flex; gap:1px; margin-right:5px;">`;

                // Download Button
                html += `<a href="/api/artifacts/${art.id}/content" class="btn-primary" style="text-decoration:none; font-size: 0.8rem; padding: 4px 10px; border-top-right-radius:0; border-bottom-right-radius:0;">${label}</a>`;

                // View Button (only for text types and now bpmn)
                if (['sipoc', 'raci', 'doc', 'bpmn'].includes(art.type)) {
                    html += `<button class="btn-primary view-artifact-btn" data-id="${art.id}" data-type="${art.type}" style="border-left:1px solid rgba(0,0,0,0.2); font-size: 0.8rem; padding: 4px 8px; border-top-left-radius:0; border-bottom-left-radius:0;">👁️</button>`;
                } else {
                    // Just rounded corner fix if no view button
                    html = html.replace('border-top-right-radius:0; border-bottom-right-radius:0;', '');
                }

                html += `</div>`;
            });
        }

        html += '</div>';
        return html;
    }


    // --- Table Helper Functions ---
    function switchToTableEditMode(type) {
        isEditMode = true;

        // UI Toggles
        document.querySelector('.table-controls button').style.display = 'none'; // Hide "Edit"
        const controls = document.getElementById('editTableControls');
        controls.classList.remove('hidden');
        controls.style.display = 'flex';

        // Render Editable Table
        const container = document.getElementById('table-container');
        container.innerHTML = generateEditableTable(type, currentArtifactContent);
    };

    function cancelTableEdit() {
        isEditMode = false;
        // Re-render View by reloading modal content
        // We need to infer type from previous context or current state
        if (currentArtifactContent && Array.isArray(currentArtifactContent)) {
            // Heuristic: check keys in first row or just default
            let type = 'sipoc';
            if (currentArtifactContent.length > 0) {
                if ('activity' in currentArtifactContent[0]) type = 'raci';
            } else {
                // Fallback if empty, maybe check existing headers if possible? 
                // Or just assume sipoc if not detectable? 
                // Better: Pass type to cancel or store it.
                // Ideally we stored `currentArtifactType` in `viewArtifact`
            }
            // To fix the type issue fully properly:
            renderModalContent(currentArtifactType, currentArtifactContent, currentArtifactId);
        } else {
            // Fallback
            renderModalContent('sipoc', currentArtifactContent, currentArtifactId);
        }
    };

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
        headers.forEach(h => html += `<th>${h}</th>`);
        html += `<th>Action</th></tr></thead><tbody>`;

        data.forEach((row, index) => {
            html += `<tr>`;
            keys.forEach(key => {
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

        let keys = type === 'sipoc'
            ? ['supplier', 'input', 'process_step', 'output', 'customer']
            : ['activity', 'responsible', 'accountable', 'consulted', 'informed'];

        let html = '';
        keys.forEach(key => {
            html += `<td><input type="text" class="table-input" data-key="${key}" value="" /></td>`;
        });
        html += `<td><button class="delete-row-btn">&times;</button></td>`;
        tr.innerHTML = html;
        tbody.appendChild(tr);
    };

    function deleteTableRow(btn) {
        btn.closest('tr').remove();
    };

    async function saveTableChanges(type) {
        try {
            const rows = document.querySelectorAll('#editTable tbody tr');
            const newData = [];

            let keys = type === 'sipoc'
                ? ['supplier', 'input', 'process_step', 'output', 'customer']
                : ['activity', 'responsible', 'accountable', 'consulted', 'informed'];

            rows.forEach(tr => {
                const rowObj = {};
                const inputs = tr.querySelectorAll('input');
                inputs.forEach(input => {
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
                body: JSON.stringify({ content: newData })
            });

            if (!res.ok) throw new Error('Save failed');

            // Success
            currentArtifactContent = newData;
            cancelTableEdit();

        } catch (err) {
            console.error(err);
            alert('Failed to save changes');
            const saveBtn = document.querySelector('#btn-save-table');
            if (saveBtn) {
                saveBtn.textContent = 'Save Changes';
                saveBtn.disabled = false;
            }
        }
    };

    // Initial render and polling
    // Initial render and polling
    renderJobs();

    // Smart Polling
    const ACTIVE_STATUSES = ['pending', 'processing', 'in_progress', 'queued'];
    let pollTimeout = null;

    function scheduleNextPoll() {
        if (pollTimeout) clearTimeout(pollTimeout);

        const hasActiveJobs = trackedJobs.some(job => ACTIVE_STATUSES.includes(job.status));
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

