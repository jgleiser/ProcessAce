document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const jobsList = document.getElementById('jobsList');
    const jobCount = document.getElementById('jobCount');

    // Modal Elements
    const modal = document.getElementById('artifactModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const closeModal = document.querySelector('.close-modal');

    // Modal Control Functions
    function openArtifactModal() {
        modal.classList.remove('hidden');
        // Push a state so the back button can close the modal
        history.pushState({ modalOpen: true }, '');
    }

    function closeArtifactModal() {
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

        const processNameInput = document.getElementById('processNameInput');
        if (processNameInput && processNameInput.value.trim()) {
            formData.append('processName', processNameInput.value.trim());
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

    // Job Tracking
    const trackedJobs = JSON.parse(localStorage.getItem('processAce_jobs') || '[]');

    function addJobToTrack(jobId, filename, processName) {
        trackedJobs.unshift({ id: jobId, filename, processName, timestamp: Date.now(), status: 'pending' });
        // Keep last 10
        if (trackedJobs.length > 10) trackedJobs.pop();
        saveJobs();
        renderJobs();
    }

    function saveJobs() {
        localStorage.setItem('processAce_jobs', JSON.stringify(trackedJobs));
    }

    // Event Delegation for Delete
    jobsList.addEventListener('click', (e) => {
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

            renderModalContent(type, content);
        } catch (err) {
            modalBody.innerHTML = `<p style="color:var(--error)">Error loading artifact: ${err.message}</p>`;
        }
    }

    function renderModalContent(type, content) {
        if (type === 'sipoc') { // JSON Array
            if (!Array.isArray(content)) {
                modalBody.innerHTML = '<pre>' + JSON.stringify(content, null, 2) + '</pre>';
                return;
            }
            let html = '<table class="data-table"><thead><tr><th>Supplier</th><th>Input</th><th>Process</th><th>Output</th><th>Customer</th></tr></thead><tbody>';
            content.forEach(row => {
                html += `<tr>
                    <td>${row.supplier || ''}</td>
                    <td>${row.input || ''}</td>
                    <td>${row.process_step || ''}</td>
                    <td>${row.output || ''}</td>
                    <td>${row.customer || ''}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            modalBody.innerHTML = html;
        }
        else if (type === 'raci') { // JSON Array
            if (!Array.isArray(content)) {
                modalBody.innerHTML = '<pre>' + JSON.stringify(content, null, 2) + '</pre>';
                return;
            }
            let html = '<table class="data-table"><thead><tr><th>Activity</th><th>Responsible</th><th>Accountable</th><th>Consulted</th><th>Informed</th></tr></thead><tbody>';
            content.forEach(row => {
                html += `<tr>
                    <td>${row.activity || ''}</td>
                    <td>${row.responsible || ''}</td>
                    <td>${row.accountable || ''}</td>
                    <td>${row.consulted || ''}</td>
                    <td>${row.informed || ''}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            modalBody.innerHTML = html;
        }
        else if (type === 'doc') { // Markdown
            // Simple markdown-to-html for now (can use library later)
            // Replacing Headers and lists simply for basic view
            let html = content
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
                .replace(/^\- (.*$)/gim, '<li>$1</li>');

            html = `<div class="markdown-content">${html}</div>`;
            modalBody.innerHTML = html;
        }
        else {
            modalBody.textContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
        }
    }

    function deleteJob(jobId) {
        if (!confirm('Permanently delete this job and file?')) return;

        // Optimistically remove from UI
        const index = trackedJobs.findIndex(j => j.id === jobId);
        if (index > -1) {
            trackedJobs.splice(index, 1);
            saveJobs();
            renderJobs();
        }

        // Call backend to cleanup files
        fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
            .catch(err => console.error('Delete failed on server', err));
    }

    async function updateJobs() {
        let hasChanges = false;
        for (const job of trackedJobs) {
            if (job.status === 'completed' || job.status === 'failed' || job.status === 'lost') continue;

            try {
                const res = await fetch(`/api/jobs/${job.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.status !== job.status) {
                        job.status = data.status;
                        job.result = data.result;
                        job.error = data.error;
                        if (data.processName) job.processName = data.processName;
                        hasChanges = true;
                    } else if (data.processName && !job.processName) {
                        // Ensure processName is synced if missing locally
                        job.processName = data.processName;
                        hasChanges = true;
                    }
                } else if (res.status === 404) {
                    // Job no longer exists on server (likely restart)
                    job.status = 'lost';
                    hasChanges = true;
                }
            } catch (err) {
                console.error('Poll error', err);
            }
        }
        if (hasChanges) {
            saveJobs();
            renderJobs();
        }
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
                        <h4>${job.processName ? `${job.processName} <span style="font-size:0.8em; color:#666; font-weight:normal">(${job.filename})</span>` : job.filename}</h4>
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

                // View Button (only for text types)
                if (['sipoc', 'raci', 'doc'].includes(art.type)) {
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

    // Initial render and polling
    renderJobs();
    setInterval(updateJobs, 2000);
});
