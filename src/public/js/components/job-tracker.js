/**
 * Job Tracker
 * Handles polling, rendering the job list, editing job names, and deleting jobs.
 */
globalThis.JobTracker = (function () {
  const t = () => (globalThis.i18n ? globalThis.i18n.t : (k) => k);
  let trackedJobs = [];
  const ACTIVE_STATUSES = new Set(['pending', 'processing', 'in_progress', 'queued']);
  let pollTimeout = null;
  let originalTranscriptContent = null;
  let isHandlingPopState = false;

  // DOM Elements
  let jobsList, jobCount;

  async function loadJobsFromServer() {
    const workspaceId = globalThis.WorkspaceManager ? globalThis.WorkspaceManager.getCurrentWorkspaceId() : null;
    try {
      const url = workspaceId ? `/api/jobs?workspaceId=${encodeURIComponent(workspaceId)}` : '/api/jobs';
      const res = await fetch(url);
      if (res.ok) {
        trackedJobs = await res.json();
        renderJobs();
      }
    } catch (err) {
      console.error('Failed to load jobs', err);
      if (globalThis.showToast) globalThis.showToast(t()('jobs.updateFailed'), 'error');
    }
  }

  async function updateJobs() {
    await loadJobsFromServer();
    scheduleNextPoll();
  }

  function scheduleNextPoll() {
    if (pollTimeout) clearTimeout(pollTimeout);
    const hasActiveJobs = trackedJobs.some((job) => ACTIVE_STATUSES.has(job.status));
    const interval = hasActiveJobs ? 5000 : 30000;
    pollTimeout = setTimeout(updateJobs, interval);
  }

  function resetTranscriptAudioPlayer() {
    const audioPlayer = document.getElementById('transcriptAudioPlayer');
    if (!audioPlayer) return;
    audioPlayer.pause();
    audioPlayer.removeAttribute('src');
    audioPlayer.load();
    audioPlayer.classList.add('is-hidden');
  }

  function setTranscriptAudioSource(evidenceId) {
    const audioPlayer = document.getElementById('transcriptAudioPlayer');
    if (!audioPlayer) return;
    if (!evidenceId) {
      resetTranscriptAudioPlayer();
      return;
    }
    audioPlayer.src = `/api/evidence/${evidenceId}/file`;
    audioPlayer.classList.remove('is-hidden');
    audioPlayer.load();
  }

  function handleTranscriptAudioSeek(e, reviewModal, audioPlayer) {
    if (!reviewModal || reviewModal.classList.contains('hidden')) return;
    if (!audioPlayer || audioPlayer.classList.contains('is-hidden')) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT' || activeElement.isContentEditable)) {
      return;
    }

    if (Number.isNaN(audioPlayer.duration) || audioPlayer.duration === 0) return;

    const direction = e.key === 'ArrowRight' ? 1 : -1;
    const targetTime = audioPlayer.currentTime + direction * 5;
    const clampedTime = Math.max(0, Math.min(targetTime, audioPlayer.duration));
    audioPlayer.currentTime = clampedTime;
    e.preventDefault();
  }

  function addJobToTrack() {
    loadJobsFromServer();
  }

  async function deleteJob(jobId) {
    if (typeof globalThis.showConfirmModal === 'function') {
      if (!(await globalThis.showConfirmModal(t()('jobs.deleteConfirm')))) return;
    } else if (!confirm('Permanently delete this job and file?')) {
      return;
    }

    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        loadJobsFromServer();
      } else {
        console.error('Delete failed');
        if (globalThis.showToast) globalThis.showToast(t()('jobs.deleteFailed'), 'error');
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
                            <input id="job-input-${job.id}" class="job-name-input" data-id="${job.id}" value="${(job.processName || '').replaceAll('"', '&quot;')}" data-i18n-placeholder="jobs.processNamePlaceholder" placeholder="${t()('jobs.processNamePlaceholder')}" />
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
      html += `<button class="btn-primary view-artifact-btn artifact-btn-view" data-id="${result.artifactId}" data-type="bpmn" data-can-edit="${canEdit}">BPMN</button>`;
    }

    if (result.artifacts && Array.isArray(result.artifacts)) {
      result.artifacts.forEach((art) => {
        const label = art.type.toUpperCase();

        if (art.type === 'transcript') {
          // Special case for transcript: only one button, same size as others
          html += `<button class="btn-primary review-transcript-btn artifact-btn-download" data-artifact-id="${art.id}" data-evidence-id="${result.evidenceId}">${t()('dashboard.reviewTranscript') || 'REVIEW'}</button>`;
        } else if (['sipoc', 'raci', 'doc', 'bpmn'].includes(art.type)) {
          html += `<button class="btn-primary view-artifact-btn artifact-btn-view" data-id="${art.id}" data-type="${art.type}" data-can-edit="${canEdit}">${label}</button>`;
        }
      });
    }

    html += '</div>';
    return html;
  }

  function startJobNameEdit(jobId) {
    const container = document.getElementById(`job-title-container-${jobId}`);
    const editContainer = document.getElementById(`job-edit-container-${jobId}`);
    if (!container || !editContainer) return;
    container.classList.add('hidden');
    editContainer.classList.remove('hidden');
    editContainer.querySelector('input').focus();
  }

  function cancelJobNameEdit(jobId) {
    const container = document.getElementById(`job-title-container-${jobId}`);
    const editContainer = document.getElementById(`job-edit-container-${jobId}`);
    if (!container || !editContainer) return;
    container.classList.remove('hidden');
    editContainer.classList.add('hidden');
  }

  async function saveJobName(jobId) {
    const input = document.getElementById(`job-input-${jobId}`);
    if (!input) return;
    const newName = input.value.trim();

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processName: newName }),
      });
      if (res.ok) {
        loadJobsFromServer();
        return;
      }
      if (newName && typeof globalThis.showAlertModal === 'function') {
        await globalThis.showAlertModal('Failed to update name');
      }
    } catch (err) {
      console.error('Error updating job name', err);
    }
  }

  async function handleJobsListClick(e) {
    const reviewBtn = e.target.closest('.review-transcript-btn');
    if (reviewBtn) {
      e.preventDefault();
      const { artifactId, evidenceId } = reviewBtn.dataset;
      openTranscriptReview(artifactId, evidenceId);
      return;
    }

    const editBtn = e.target.closest('.edit-job-btn');
    if (editBtn) {
      startJobNameEdit(editBtn.dataset.id);
      return;
    }

    const saveBtn = e.target.closest('.job-name-save');
    if (saveBtn) {
      await saveJobName(saveBtn.dataset.id);
      return;
    }

    const cancelBtn = e.target.closest('.job-name-cancel');
    if (cancelBtn) {
      cancelJobNameEdit(cancelBtn.dataset.id);
      return;
    }

    const deleteBtn = e.target.closest('.delete-job-btn');
    if (deleteBtn) {
      deleteJob(deleteBtn.dataset.id);
      return;
    }

    const viewBtn = e.target.closest('.view-artifact-btn');
    if (viewBtn) {
      e.preventDefault();
      const { id, type } = viewBtn.dataset;
      const canEdit = viewBtn.dataset.canEdit === 'true';
      if (globalThis.ArtifactViewer) {
        globalThis.ArtifactViewer.viewArtifact(id, type, canEdit);
      }
    }
  }

  function setupEventListeners() {
    if (!jobsList) return;

    jobsList.addEventListener('click', handleJobsListClick);

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
      setTranscriptAudioSource(evidenceId);
      modal.classList.remove('hidden');
      history.pushState({ transcriptModalOpen: true }, '');
    } catch (err) {
      console.error(err);
      resetTranscriptAudioPlayer();
      if (globalThis.showToast) globalThis.showToast('Failed to load transcript', 'error');
    }
  }

  function hasUnsavedChanges() {
    const textarea = document.getElementById('transcriptEditTextarea');
    if (!textarea || originalTranscriptContent === null) return false;
    return textarea.value !== originalTranscriptContent;
  }

  function isTranscriptModalOpen(reviewModal) {
    return !!reviewModal && !reviewModal.classList.contains('hidden');
  }

  function closeTranscriptReview(reviewModal) {
    if (!isTranscriptModalOpen(reviewModal)) return;
    reviewModal.classList.add('hidden');
    originalTranscriptContent = null;
    resetTranscriptAudioPlayer();
  }

  function getTranscriptText() {
    const textarea = document.getElementById('transcriptEditTextarea');
    return textarea ? textarea.value : '';
  }

  async function persistTranscriptEdits(artifactId, text) {
    const res = await fetch(`/api/artifacts/${artifactId}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });

    if (!res.ok) throw new Error('Save failed');
    originalTranscriptContent = text;
  }

  async function handleTranscriptClose(reviewModal, confirmBtn) {
    if (!hasUnsavedChanges()) {
      closeTranscriptReview(reviewModal);
      history.back();
      return;
    }

    if (typeof globalThis.showUnsavedChangesModal !== 'function') {
      closeTranscriptReview(reviewModal);
      history.back();
      return;
    }

    const choice = await globalThis.showUnsavedChangesModal();
    if (choice === 'save') {
      const artifactId = confirmBtn.dataset.artifactId;
      const text = getTranscriptText();
      try {
        await persistTranscriptEdits(artifactId, text);
        if (globalThis.showToast) globalThis.showToast(t()('common.saveSuccess') || 'Changes saved', 'success');
        closeTranscriptReview(reviewModal);
        history.back();
      } catch (err) {
        console.error(err);
        if (globalThis.showToast) globalThis.showToast(t()('common.saveFailed') || 'Save failed', 'error');
      }
      return;
    }

    if (choice === 'discard') {
      closeTranscriptReview(reviewModal);
      history.back();
    }
  }

  async function handleTranscriptPopState(reviewModal, confirmBtn) {
    if (isHandlingPopState) {
      history.pushState({ transcriptModalOpen: true }, '');
      return;
    }

    if (!isTranscriptModalOpen(reviewModal)) {
      originalTranscriptContent = null;
      return;
    }

    if (!hasUnsavedChanges()) {
      closeTranscriptReview(reviewModal);
      return;
    }

    isHandlingPopState = true;
    history.pushState({ transcriptModalOpen: true }, '');

    try {
      if (typeof globalThis.showUnsavedChangesModal !== 'function') {
        closeTranscriptReview(reviewModal);
        return;
      }

      const choice = await globalThis.showUnsavedChangesModal();
      if (choice === 'save') {
        const artifactId = confirmBtn.dataset.artifactId;
        const text = getTranscriptText();
        await persistTranscriptEdits(artifactId, text);
        if (globalThis.showToast) globalThis.showToast(t()('common.saveSuccess') || 'Changes saved', 'success');
        closeTranscriptReview(reviewModal);
        history.back();
        return;
      }

      if (choice === 'discard') {
        closeTranscriptReview(reviewModal);
        history.back();
      }
    } catch (err) {
      console.error(err);
    } finally {
      isHandlingPopState = false;
    }
  }

  function handleTranscriptKeydown(e, reviewModal, audioPlayer, confirmBtn) {
    const isOpen = isTranscriptModalOpen(reviewModal);
    if (e.key === 'Escape' && isOpen) {
      handleTranscriptClose(reviewModal, confirmBtn);
    }
    handleTranscriptAudioSeek(e, reviewModal, audioPlayer);
  }

  function setupTranscriptModal() {
    const reviewModal = document.getElementById('transcriptReviewModal');
    if (!reviewModal) return;

    const closeBtn = reviewModal.querySelector('.close-transcript-modal');
    const confirmBtn = document.getElementById('confirmProcessTranscriptBtn');
    const saveBtn = document.getElementById('saveTranscriptBtn');
    const exportBtn = document.getElementById('exportTranscriptBtn');
    const audioPlayer = document.getElementById('transcriptAudioPlayer');

    if (closeBtn) closeBtn.addEventListener('click', () => handleTranscriptClose(reviewModal, confirmBtn));
    if (audioPlayer) audioPlayer.addEventListener('error', () => resetTranscriptAudioPlayer());

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const text = getTranscriptText();
        const artifactId = confirmBtn.dataset.artifactId;
        const filename = `transcript_${artifactId.substring(0, 8)}.txt`;

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        if (globalThis.showToast) globalThis.showToast(t()('common.exportSuccess') || 'Export successful', 'success');
      });
    }

    // Close on outside click
    reviewModal.addEventListener('click', (e) => {
      if (e.target === reviewModal) handleTranscriptClose(reviewModal, confirmBtn);
    });

    // Close on Escape key
    globalThis.addEventListener('keydown', (e) => {
      handleTranscriptKeydown(e, reviewModal, audioPlayer, confirmBtn);
    });

    // Handle back button
    globalThis.addEventListener('popstate', () => {
      handleTranscriptPopState(reviewModal, confirmBtn);
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const artifactId = confirmBtn.dataset.artifactId;
        const text = getTranscriptText();

        const originalText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = t()('common.saving') || 'Saving...';

        try {
          await persistTranscriptEdits(artifactId, text);
          if (globalThis.showToast) globalThis.showToast(t()('common.saveSuccess') || 'Changes saved', 'success');
        } catch (err) {
          console.error(err);
          if (globalThis.showToast) globalThis.showToast(t()('common.saveFailed') || 'Save failed', 'error');
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
        const workspaceId = globalThis.WorkspaceManager ? globalThis.WorkspaceManager.getCurrentWorkspaceId() : null;

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
          if (globalThis.showToast) globalThis.showToast('Processing started', 'success');
          loadJobsFromServer();
        } catch (err) {
          console.error(err);
          if (globalThis.showToast) globalThis.showToast('Error starting process', 'error');
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
