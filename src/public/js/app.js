document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const jobsList = document.getElementById('jobsList');
    const jobCount = document.getElementById('jobCount');

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

        try {
            const response = await fetch('/api/evidence/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (response.ok) {
                addJobToTrack(data.jobId, file.name);
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

    function addJobToTrack(jobId, filename) {
        trackedJobs.unshift({ id: jobId, filename, timestamp: Date.now(), status: 'pending' });
        // Keep last 10
        if (trackedJobs.length > 10) trackedJobs.pop();
        saveJobs();
        renderJobs();
    }

    function saveJobs() {
        localStorage.setItem('processAce_jobs', JSON.stringify(trackedJobs));
    }

    async function updateJobs() {
        let hasChanges = false;
        for (const job of trackedJobs) {
            if (job.status === 'completed' || job.status === 'failed') continue;

            try {
                const res = await fetch(`/api/jobs/${job.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.status !== job.status) {
                        job.status = data.status;
                        job.result = data.result;
                        job.error = data.error;
                        hasChanges = true;
                    }
                }
            } catch (ignore) { }
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
                    <h4>${job.filename}</h4>
                    <div class="job-meta">ID: ${job.id.substring(0, 8)}...</div>
                    ${job.result && job.result.llmResponse ? `<div style="font-size:0.8rem; margin-top:5px; color:white; opacity:0.7">LLM: "${job.result.llmResponse}"</div>` : ''}
                </div>
                <div class="job-status status-${job.status}">
                    <span class="status-dot"></span>
                    ${job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </div>
            </div>
        `).join('');
    }

    // Initial render and polling
    renderJobs();
    setInterval(updateJobs, 2000);
});
