/**
 * Admin Jobs Dashboard JavaScript
 * Handles fetching, displaying, and paginating jobs for admin users
 */

let currentPage = 1;
let currentLimit = 10;
let totalPages = 1;
let jobsData = []; // Store jobs for modal access

// DOM Elements
const loadingState = document.getElementById('loadingState');
const jobsTable = document.getElementById('jobsTable');
const jobsTableBody = document.getElementById('jobsTableBody');
const paginationContainer = document.getElementById('paginationContainer');
const paginationInfo = document.getElementById('paginationInfo');
const paginationControls = document.getElementById('paginationControls');
const limitSelect = document.getElementById('limitSelect');
const errorContainer = document.getElementById('errorContainer');

// Modal Elements
const jobModal = document.getElementById('jobModal');
const modalClose = document.getElementById('modalClose');
const modalProvider = document.getElementById('modalProvider');
const modalModel = document.getElementById('modalModel');
const modalArtifacts = document.getElementById('modalArtifacts');

// Artifact Viewer Modal Elements
const artifactModal = document.getElementById('artifactModal');
const artifactModalTitle = document.getElementById('artifactModalTitle');
const artifactModalBody = document.getElementById('artifactModalBody');
const closeArtifactModal = document.getElementById('closeArtifactModal');

// BPMN/Doc editor state
let bpmnInstance = null;
let easyMDEInstance = null;
let currentArtifactId = null;
let currentArtifactContent = null;
let currentArtifactType = null;
let isEditMode = false;

/**
 * Fetch jobs from the API
 */
async function loadJobs(page = 1, limit = 10) {
    try {
        showLoading();

        const response = await fetch(`/api/admin/jobs?page=${page}&limit=${limit}`, {
            credentials: 'include'
        });

        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        if (response.status === 403) {
            showError('Access denied. Admin privileges required.');
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to fetch jobs');
        }

        const data = await response.json();

        currentPage = data.pagination.page;
        currentLimit = data.pagination.limit;
        totalPages = data.pagination.totalPages;
        jobsData = data.jobs; // Store for modal access

        renderTable(data.jobs);
        renderPagination(data.pagination);

    } catch (error) {
        console.error('Error loading jobs:', error);
        showError('Failed to load jobs. Please try again.');
    }
}

/**
 * Show loading state
 */
function showLoading() {
    loadingState.style.display = 'block';
    jobsTable.style.display = 'none';
    paginationContainer.style.display = 'none';
    errorContainer.innerHTML = '';
}

/**
 * Show error message
 */
function showError(message) {
    loadingState.style.display = 'none';
    errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
}

/**
 * Render the jobs table (simplified)
 */
function renderTable(jobs) {
    loadingState.style.display = 'none';
    jobsTable.style.display = 'table';
    paginationContainer.style.display = 'flex';

    if (jobs.length === 0) {
        jobsTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">No jobs found</td>
            </tr>
        `;
        return;
    }

    jobsTableBody.innerHTML = jobs.map((job, index) => `
        <tr data-job-index="${index}">
            <td>
                <div class="user-name">${escapeHtml(job.user.name)}</div>
                <div class="user-email">${escapeHtml(job.user.email)}</div>
            </td>
            <td>
                <span class="workspace-name">${escapeHtml(job.workspace.name)}</span>
            </td>
            <td>
                <span class="process-name">${escapeHtml(job.processName || 'N/A')}</span>
            </td>
            <td>
                <span class="filename" title="${escapeHtml(job.originalName || '')}">${escapeHtml(job.originalName || 'N/A')}</span>
            </td>
            <td>
                <span class="status-badge status-${job.status}">${job.status}</span>
            </td>
        </tr>
    `).join('');

    // Add click handlers to rows
    jobsTableBody.querySelectorAll('tr[data-job-index]').forEach(row => {
        row.addEventListener('click', () => {
            const index = parseInt(row.dataset.jobIndex);
            openJobModal(jobsData[index]);
        });
    });
}

/**
 * Open modal with job details
 */
function openJobModal(job) {
    // Set provider
    modalProvider.textContent = job.llm_provider || 'N/A';

    // Set model
    modalModel.textContent = job.llm_model || 'N/A';

    // Set artifacts
    if (job.artifacts && job.artifacts.length > 0) {
        modalArtifacts.innerHTML = job.artifacts.map(artifact => {
            const label = artifact.type.toUpperCase();
            return `<button class="modal-artifact-btn view-artifact-btn" data-id="${artifact.id}" data-type="${artifact.type}">${label} 👁</button>`;
        }).join('');
    } else {
        modalArtifacts.innerHTML = '<span class="modal-no-artifacts">No artifacts available</span>';
    }

    // Push state so back button can close modal
    history.pushState({ modalOpen: true }, '', window.location.pathname);

    // Show modal
    jobModal.classList.add('active');
}

/**
 * Close modal
 */
function closeJobModal(fromPopstate = false) {
    if (!jobModal.classList.contains('active')) return;

    jobModal.classList.remove('active');

    // If not triggered by popstate, go back in history
    if (!fromPopstate) {
        history.back();
    }
}

// Handle browser back button


/**
 * Render pagination controls
 */
function renderPagination(pagination) {
    const { page, limit, total, totalPages } = pagination;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    paginationInfo.textContent = `Showing ${start}-${end} of ${total} jobs`;

    // Build page buttons
    let buttonsHtml = '';

    // Previous button
    buttonsHtml += `
        <button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="goToPage(${page - 1})">
            ← Prev
        </button>
    `;

    // Page numbers
    const maxButtons = 5;
    let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (startPage > 1) {
        buttonsHtml += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
            buttonsHtml += `<span style="color: var(--text-muted);">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        buttonsHtml += `
            <button class="page-btn ${i === page ? 'active' : ''}" onclick="goToPage(${i})">
                ${i}
            </button>
        `;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            buttonsHtml += `<span style="color: var(--text-muted);">...</span>`;
        }
        buttonsHtml += `<button class="page-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }

    // Next button
    buttonsHtml += `
        <button class="page-btn" ${page >= totalPages ? 'disabled' : ''} onclick="goToPage(${page + 1})">
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
    loadJobs(currentPage, currentLimit);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event Listeners
limitSelect.addEventListener('change', (e) => {
    currentLimit = parseInt(e.target.value);
    currentPage = 1; // Reset to first page when changing limit
    loadJobs(currentPage, currentLimit);
});

// Modal close handlers
modalClose.addEventListener('click', closeJobModal);
jobModal.addEventListener('click', (e) => {
    if (e.target === jobModal) {
        closeJobModal();
    }
});

// Artifact button click handler (event delegation)
modalArtifacts.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-artifact-btn');
    if (btn) {
        const { id, type } = btn.dataset;
        viewArtifact(id, type);
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!artifactModal.classList.contains('hidden')) {
            closeArtifactModalFn();
        } else if (jobModal.classList.contains('active')) {
            closeJobModal();
        }
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadJobs(currentPage, currentLimit);
});

// ============================================
// ARTIFACT VIEWER FUNCTIONS
// ============================================

/**
 * View an artifact in the modal
 */
async function viewArtifact(id, type) {
    // Toggle expanded class based on type
    const modalContent = artifactModal.querySelector('.modal-content');
    if (type === 'bpmn') {
        modalContent.classList.add('modal-content-expanded');
    } else {
        modalContent.classList.remove('modal-content-expanded');
    }

    openArtifactModalFn();
    artifactModalBody.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
    artifactModalTitle.textContent = `Viewing ${type.toUpperCase()}`;

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

        renderArtifactContent(type, content, id);
    } catch (err) {
        artifactModalBody.innerHTML = `<p style="color:var(--error)">Error loading artifact: ${err.message}</p>`;
    }
}

function openArtifactModalFn() {
    artifactModal.classList.remove('hidden');
    history.pushState({ artifactModalOpen: true }, '');
}

function closeArtifactModalFn(fromPopstate = false) {
    if (!fromPopstate) {
        history.back();
    } else {
        destroyBpmn();
        destroyDocEditor();
        artifactModal.classList.add('hidden');
    }
}

// Update popstate handler to handle both modals based on state
window.addEventListener('popstate', (e) => {
    // 1. Artifact Modal State
    if (e.state && e.state.artifactModalOpen) {
        artifactModal.classList.remove('hidden');
        jobModal.classList.add('active');
        return;
    }

    // 2. Job Modal State (Artifact closed, Job open)
    if (e.state && e.state.modalOpen) {
        if (!artifactModal.classList.contains('hidden')) {
            closeArtifactModalFn(true); // Hide artifact
        }
        jobModal.classList.add('active'); // Show job
        return;
    }

    // 3. Initial State (Both closed)
    closeArtifactModalFn(true);
    closeJobModal(true);
});

// Artifact modal close handlers
closeArtifactModal.addEventListener('click', () => closeArtifactModalFn());
artifactModal.addEventListener('click', (e) => {
    if (e.target === artifactModal) {
        closeArtifactModalFn();
    }
});

/**
 * Render artifact content based on type (VIEW ONLY - no editing in admin)
 */
function renderArtifactContent(type, content, artifactId) {
    currentArtifactId = artifactId;
    currentArtifactContent = content;
    currentArtifactType = type;

    if (type === 'bpmn') {
        artifactModalBody.innerHTML = `
            <div class="bpmn-controls">
                <div id="viewControls" style="display:flex; gap:10px;">
                    <button class="bpmn-btn" id="resetZoom">Fit to View</button>
                    <button class="bpmn-btn" id="downloadSvg">Download SVG</button>
                </div>
            </div>
            <div id="bpmn-canvas"></div>
        `;
        loadBpmnViewer(content);
    }
    else if (type === 'sipoc' || type === 'raci') {
        if (!Array.isArray(content)) {
            artifactModalBody.innerHTML = '<pre>' + JSON.stringify(content, null, 2) + '</pre>';
            return;
        }

        const isSipoc = type === 'sipoc';
        const headers = isSipoc
            ? ['Supplier', 'Input', 'Process', 'Output', 'Customer']
            : ['Activity', 'Responsible', 'Accountable', 'Consulted', 'Informed'];

        const keys = isSipoc
            ? ['supplier', 'input', 'process_step', 'output', 'customer']
            : ['activity', 'responsible', 'accountable', 'consulted', 'informed'];

        let html = `<div id="table-container">`;
        html += `<table class="data-table" id="viewTable"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;

        content.forEach(row => {
            html += '<tr>';
            keys.forEach(key => html += `<td>${row[key] || ''}</td>`);
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        artifactModalBody.innerHTML = html;
    }
    else if (type === 'doc') {
        if (typeof marked === 'undefined') {
            artifactModalBody.innerHTML = '<p style="color:var(--error)">Error: Marked library not loaded.</p>';
            return;
        }
        artifactModalBody.innerHTML = `
            <div id="markdown-content" class="markdown-content">${marked.parse(content)}</div>
        `;
    }
    else {
        artifactModalBody.textContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
    }
}

// BPMN Helper Functions
function loadBpmnViewer(xml) {
    destroyBpmn();
    bpmnInstance = new BpmnJS({
        container: '#bpmn-canvas',
        height: 600
    });

    bpmnInstance.importXML(xml)
        .then(() => {
            const canvas = bpmnInstance.get('canvas');
            canvas.zoom('fit-viewport');

            const palette = document.querySelector('.djs-palette');
            if (palette) palette.style.display = 'none';

            document.getElementById('resetZoom')?.addEventListener('click', () => canvas.zoom('fit-viewport'));
            document.getElementById('downloadSvg')?.addEventListener('click', downloadSvg);
        })
        .catch(err => {
            console.error('BPMN Import Error', err);
            document.getElementById('bpmn-canvas').innerHTML = `<p style="color:var(--error); padding:20px;">Error rendering BPMN: ${err.message}</p>`;
        });
}



async function downloadSvg() {
    try {
        const { svg } = await bpmnInstance.saveSVG();
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'process.svg';
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



function destroyDocEditor() {
    if (easyMDEInstance) {
        easyMDEInstance.toTextArea();
        easyMDEInstance = null;
    }
}
