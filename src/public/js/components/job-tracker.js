/**
 * Job Tracker
 * Handles polling, rendering the job list, editing job names, and deleting jobs.
 */
window.JobTracker = (function () {
  const t = () => (window.i18n ? window.i18n.t : (k) => k);
  let trackedJobs = [];
  const ACTIVE_STATUSES = ['pending', 'processing', 'in_progress', 'queued'];
  let pollTimeout = null;
  let originalTranscriptContent = null;
  let isHandlingPopState = false;

  // DOM Elements
  let jobsList, jobCount;

  async function loadJobsFromServer() {
    const workspaceId = window.WorkspaceManager ? window.WorkspaceManager.getCurrentWorkspaceId() : null;
    try {
      const url = workspaceId ? `/api/jobs?workspaceId=${encodeURIComponent(workspaceId)}` : '/api/jobs';
      const res = await fetch(url);
      if (res.ok) {
        trackedJobs = await res.json();
        renderJobs();
      }
    } catch (err) {
      console.error('Failed to load jobs', err);
      if (window.showToast) window.showToast(t()('jobs.updateFailed'), 'error');
    }
  }

  async function updateJobs() {
    await loadJobsFromServer();
    scheduleNextPoll();
  }

  function scheduleNextPoll() {
    if (pollTimeout) clearTimeout(pollTimeout);
    const hasActiveJobs = trackedJobs.some((job) => ACTIVE_STATUSES.includes(job.status));
    const interval = hasActiveJobs ? 5000 : 30000;
    pollTimeout = setTimeout(updateJobs, interval);
  }

  function addJobToTrack() {
    loadJobsFromServer();
  }

  async function deleteJob(jobId) {
    if (typeof window.showConfirmModal === 'function') {
      if (!(await window.showConfirmModal(t()('jobs.deleteConfirm')))) return;
    } else {
      if (!confirm('Permanently delete this job and file?')) return;
    }

    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        loadJobsFromServer();
      } else {
        console.error('Delete failed');
        if (window.showToast) window.showToast(t()('jobs.deleteFailed'), 'error');
      }
    } catch (err) {
      console.error('Delete failed on server', err);
    }
  }

  function renderJobs() {
    if (!jobCount || !jobsList) return;

    jobCount.textContent = trackedJobs.length;
    if (trackedJobs.length === 0) {
      jobsList.innerHTML = `<div class="empty-state"><p>${t()('dashboard.noJobs')}</p></div>`;
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
                             <input id="job-input-${job.id}" class="job-name-input" data-id="${job.id}" value="${(job.processName || '').replace(/"/g, '&quot;')}" data-i18n-placeholder="jobs.processNamePlaceholder" placeholder="${t()('jobs.processNamePlaceholder')}" />
                            <button class="btn-primary btn-sm job-name-save" data-id="${job.id}">${t()('jobs.save')}</button>
                            <button class="btn-secondary btn-sm job-name-cancel" data-id="${job.id}">${t()('jobs.cancel')}</button>
                        </div>
                        ${job.canDelete ? `<button class="delete-job-btn" data-id="${job.id}">&times;</button>` : ''}
                    </div>
                    <div class="job-meta">ID: ${job.id.substring(0, 8)}...</div>
                    ${renderArtifacts(job.result, job.canEdit)}
                    ${job.status === 'lost' ? `<div class="job-lost-message">${t()('jobs.jobLost')}</div>` : ''}
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

    if (result.artifactId && !result.artifacts) {
      html += `<a href="/api/artifacts/${result.artifactId}/content" class="btn-primary artifact-btn-download">Download BPMN</a>`;
    }

    if (result.artifacts && Array.isArray(result.artifacts)) {
      result.artifacts.forEach((art) => {
        const label = art.type.toUpperCase();
        html += `<div class="artifact-btn-group">`;

        if (art.type === 'transcript') {
          // Special case for transcript: only one button, same size as others
          html += `<button class="btn-primary review-transcript-btn artifact-btn-download" data-artifact-id="${art.id}" data-evidence-id="${result.evidenceId}">${t()('dashboard.reviewTranscript') || 'REVIEW'}</button>`;
        } else {
          html += `<a href="/api/artifacts/${art.id}/content" class="btn-primary artifact-btn-download grouped">${label}</a>`;

          if (['sipoc', 'raci', 'doc', 'bpmn'].includes(art.type)) {
            html += `<button class="btn-primary view-artifact-btn artifact-btn-view" data-id="${art.id}" data-type="${art.type}" data-can-edit="${canEdit}">👁️</button>`;
          } else {
            html = html.replace('artifact-btn-download grouped', 'artifact-btn-download');
          }
        }
        html += `</div>`;
      });
    }

    html += '</div>';
    return html;
  }

  function setupEventListeners() {
    if (!jobsList) return;

    jobsList.addEventListener('click', async (e) => {
      const reviewBtn = e.target.closest('.review-transcript-btn');
      if (reviewBtn) {
        e.preventDefault();
        const { artifactId, evidenceId } = reviewBtn.dataset;
        openTranscriptReview(artifactId, evidenceId);
        return;
      }

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

      const saveBtn = e.target.closest('.job-name-save');
      if (saveBtn) {
        const jobId = saveBtn.dataset.id;
        const input = document.getElementById(`job-input-${jobId}`);
        const newName = input.value.trim();

        try {
          const res = await fetch(`/api/jobs/${jobId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ processName: newName }),
          });
          if (res.ok) {
            loadJobsFromServer();
          } else if (newName) {
            if (typeof window.showAlertModal === 'function') await window.showAlertModal('Failed to update name');
          }
        } catch (err) {
          console.error('Error updating job name', err);
        }
        return;
      }

      const cancelBtn = e.target.closest('.job-name-cancel');
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

      const deleteBtn = e.target.closest('.delete-job-btn');
      if (deleteBtn) {
        const jobId = deleteBtn.dataset.id;
        deleteJob(jobId);
        return;
      }

      const viewBtn = e.target.closest('.view-artifact-btn');
      if (viewBtn) {
        e.preventDefault();
        const { id, type } = viewBtn.dataset;
        const canEdit = viewBtn.dataset.canEdit === 'true';
        if (window.ArtifactViewer) {
          window.ArtifactViewer.viewArtifact(id, type, canEdit);
        }
      }
    });

    // Listen for workspace changes to reload jobs
    document.addEventListener('workspaceChanged', () => {
      loadJobsFromServer();
    });
  }

  async function openTranscriptReview(artifactId, evidenceId) {
    const modal = document.getElementById('transcriptReviewModal');
    const textarea = document.getElementById('transcriptEditTextarea');
    const confirmBtn = document.getElementById('confirmProcessTranscriptBtn');

    if (!modal || !textarea || !confirmBtn) return;

    try {
      const res = await fetch(`/api/artifacts/${artifactId}/content?view=true`);
      if (!res.ok) throw new Error('Failed to load transcript');
      const text = await res.text();
      textarea.value = text;

      confirmBtn.dataset.evidenceId = evidenceId;
      confirmBtn.dataset.artifactId = artifactId;
      originalTranscriptContent = text;
      modal.classList.remove('hidden');
      history.pushState({ transcriptModalOpen: true }, '');
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Failed to load transcript', 'error');
    }
  }

  function hasUnsavedChanges() {
    const textarea = document.getElementById('transcriptEditTextarea');
    if (!textarea || originalTranscriptContent === null) return false;
    return textarea.value !== originalTranscriptContent;
  }

  function setupTranscriptModal() {
    const reviewModal = document.getElementById('transcriptReviewModal');
    if (!reviewModal) return;

    const closeBtn = reviewModal.querySelector('.close-transcript-modal');
    const confirmBtn = document.getElementById('confirmProcessTranscriptBtn');
    const saveBtn = document.getElementById('saveTranscriptBtn');
    const exportBtn = document.getElementById('exportTranscriptBtn');

    const closeReview = () => {
      if (!reviewModal.classList.contains('hidden')) {
        reviewModal.classList.add('hidden');
        originalTranscriptContent = null;
      }
    };

    const handleClosure = async () => {
      if (hasUnsavedChanges()) {
        if (window.showUnsavedChangesModal) {
          const choice = await window.showUnsavedChangesModal();
          if (choice === 'save') {
            const artifactId = confirmBtn.dataset.artifactId;
            const text = document.getElementById('transcriptEditTextarea').value;
            try {
              const res = await fetch(`/api/artifacts/${artifactId}/content`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text }),
              });
              if (res.ok) {
                if (window.showToast) window.showToast(t()('common.saveSuccess') || 'Changes saved', 'success');
                closeReview();
                history.back();
              } else {
                throw new Error('Save failed');
              }
            } catch (err) {
              console.error(err);
              if (window.showToast) window.showToast(t()('common.saveFailed') || 'Save failed', 'error');
            }
          } else if (choice === 'discard') {
            closeReview();
            history.back();
          }
          // if 'cancel', do nothing
        } else {
          closeReview();
          history.back();
        }
      } else {
        closeReview();
        history.back();
      }
    };

    if (closeBtn) closeBtn.addEventListener('click', handleClosure);

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const text = document.getElementById('transcriptEditTextarea').value;
        const artifactId = confirmBtn.dataset.artifactId;
        const filename = `transcript_${artifactId.substring(0, 8)}.txt`;

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (window.showToast) window.showToast(t()('common.exportSuccess') || 'Export successful', 'success');
      });
    }

    // Close on outside click
    reviewModal.addEventListener('click', (e) => {
      if (e.target === reviewModal) handleClosure();
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !reviewModal.classList.contains('hidden')) {
        handleClosure();
      }
    });

    // Handle back button
    window.addEventListener('popstate', () => {
      if (isHandlingPopState) {
        history.pushState({ transcriptModalOpen: true }, '');
        return;
      }

      if (!reviewModal.classList.contains('hidden')) {
        if (hasUnsavedChanges()) {
          isHandlingPopState = true;
          history.pushState({ transcriptModalOpen: true }, '');

          (async () => {
            if (window.showUnsavedChangesModal) {
              const choice = await window.showUnsavedChangesModal();
              isHandlingPopState = false;
              if (choice === 'save') {
                const artifactId = confirmBtn.dataset.artifactId;
                const text = document.getElementById('transcriptEditTextarea').value;
                try {
                  const res = await fetch(`/api/artifacts/${artifactId}/content`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: text }),
                  });
                  if (res.ok) {
                    if (window.showToast) window.showToast(t()('common.saveSuccess') || 'Changes saved', 'success');
                    closeReview();
                    history.back();
                  }
                } catch (err) {
                  console.error(err);
                }
              } else if (choice === 'discard') {
                closeReview();
                history.back();
              }
            } else {
              isHandlingPopState = false;
              closeReview();
            }
          })();
        } else {
          closeReview();
        }
      } else {
        // Just in case, clean up if modal is already hidden but popstate fired
        originalTranscriptContent = null;
      }
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const artifactId = confirmBtn.dataset.artifactId;
        const text = document.getElementById('transcriptEditTextarea').value;

        const originalText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = t()('common.saving') || 'Saving...';

        try {
          const res = await fetch(`/api/artifacts/${artifactId}/content`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text }),
          });

          if (!res.ok) throw new Error('Save failed');

          originalTranscriptContent = text;
          if (window.showToast) window.showToast(t()('common.saveSuccess') || 'Changes saved', 'success');
        } catch (err) {
          console.error(err);
          if (window.showToast) window.showToast(t()('common.saveFailed') || 'Save failed', 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = originalText;
        }
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const evidenceId = confirmBtn.dataset.evidenceId;
        const text = document.getElementById('transcriptEditTextarea').value;
        const workspaceId = window.WorkspaceManager ? window.WorkspaceManager.getCurrentWorkspaceId() : null;

        const originalText = confirmBtn.textContent;
        confirmBtn.disabled = true;
        confirmBtn.textContent = t()('dashboard.processing') || 'Processing...';

        try {
          const res = await fetch(`/api/evidence/${evidenceId}/process-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, workspaceId }),
          });

          if (!res.ok) throw new Error('Failed to start processing');

          // Successful processing means changes are effectively "saved" and modal should close
          originalTranscriptContent = text;
          history.back();
          if (window.showToast) window.showToast('Processing started', 'success');
          loadJobsFromServer();
        } catch (err) {
          console.error(err);
          if (window.showToast) window.showToast('Error starting process', 'error');
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = originalText;
        }
      });
    }
  }

  function init() {
    jobsList = document.getElementById('jobsList');
    jobCount = document.getElementById('jobCount');

    setupEventListeners();
    setupTranscriptModal();

    // Initial load happens after workspace manager loads and fires event,
    // but if it's already fired before we init, or we just load it anyway:
    // loadJobsFromServer() uses currentWorkspaceId if available.
    updateJobs();
  }

  return {
    init,
    addJobToTrack,
    refresh: loadJobsFromServer,
  };
})();
