/**
 * Evidence Upload
 * Handles drag and drop file uploads and form inputs.
 */
window.EvidenceUpload = (function () {
  const t = () => (window.i18n ? window.i18n.t : (k) => k);
  let uploadZone, fileInput, browseBtn, processNameInput, providerSelect, modelSelect;

  async function handleFiles(files) {
    const file = files[0]; // Process single file for now

    const processName = processNameInput ? processNameInput.value.trim() : '';
    const provider = providerSelect ? providerSelect.value : '';
    const model = modelSelect ? modelSelect.value.trim() : '';

    // Show loading state
    const originalContent = uploadZone.innerHTML;
    uploadZone.innerHTML = `
            <div class="upload-progress">
                <div class="spinner"></div>
                <p id="uploadProgressText"></p>
            </div>
        `;
    const progressText = document.getElementById('uploadProgressText');
    if (progressText) {
      progressText.textContent = t()('jobs.uploadingFile', { fileName: file.name });
    }

    const formData = new FormData();
    const workspaceId = window.WorkspaceManager
      ? window.WorkspaceManager.getCurrentWorkspaceId()
      : null;
    formData.append('workspaceId', workspaceId);

    if (processName) formData.append('processName', processName);
    if (provider) formData.append('provider', provider);
    if (model) formData.append('model', model);
    formData.append('file', file);

    try {
      const response = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        if (window.JobTracker) {
          window.JobTracker.addJobToTrack(data.jobId, file.name, processName);
        }
      } else {
        if (typeof window.showAlertModal === 'function') {
          await window.showAlertModal('Upload failed: ' + (data.error || 'Unknown error'));
        } else {
          if (progressText) {
            progressText.textContent = t()('jobs.uploadFailed') + (data.error || 'Unknown error');
          } else {
            alert('Upload failed: ' + (data.error || 'Unknown error'));
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      if (typeof window.showAlertModal === 'function') {
        await window.showAlertModal('Upload error');
      } else {
        if (progressText) {
          progressText.textContent = t()('jobs.uploadError');
        } else {
          alert('Upload error');
        }
      }
    } finally {
      setTimeout(() => {
        uploadZone.innerHTML = originalContent;
        window.location.reload();
      }, 1000);
    }
  }

  function setupEventListeners() {
    if (!uploadZone || !fileInput || !browseBtn) return;

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

    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) handleFiles(fileInput.files);
    });
  }

  function init() {
    uploadZone = document.getElementById('uploadZone');
    fileInput = document.getElementById('fileInput');
    browseBtn = document.getElementById('browseBtn');
    processNameInput = document.getElementById('processNameInput');
    providerSelect = document.getElementById('providerSelect');
    modelSelect = document.getElementById('modelSelect');

    setupEventListeners();
  }

  return { init };
})();
