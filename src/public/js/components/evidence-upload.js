/**
 * Evidence Upload
 * Handles drag and drop file uploads and form inputs.
 */
globalThis.EvidenceUpload = (function () {
  const t = () => (globalThis.i18n ? globalThis.i18n.t : (k) => k);
  let uploadZone, fileInput, browseBtn, processNameInput, providerSelect, modelSelect;
  let audioLanguageSelect;
  let currentTab = 'document'; // 'document' or 'audio'

  async function handleFiles(files) {
    const file = files[0]; // Process single file for now

    const processName = processNameInput ? processNameInput.value.trim() : '';
    const provider = providerSelect ? providerSelect.value : '';
    const model = modelSelect ? modelSelect.value.trim() : '';
    const language = audioLanguageSelect && currentTab === 'audio' ? audioLanguageSelect.value : '';

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
    const workspaceId = globalThis.WorkspaceManager ? globalThis.WorkspaceManager.getCurrentWorkspaceId() : null;
    if (workspaceId) formData.append('workspaceId', workspaceId);

    if (processName) formData.append('processName', processName);
    if (provider) formData.append('provider', provider);
    if (model) formData.append('model', model);
    if (language) formData.append('language', language);
    formData.append('uploadType', currentTab || 'document');
    formData.append('file', file);

    try {
      const response = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        if (globalThis.JobTracker) {
          globalThis.JobTracker.addJobToTrack(data.jobId, file.name, processName);
        }
      } else {
        if (typeof globalThis.showAlertModal === 'function') {
          await globalThis.showAlertModal('Upload failed: ' + (data.error || 'Unknown error'));
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
      if (typeof globalThis.showAlertModal === 'function') {
        await globalThis.showAlertModal('Upload error');
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
        // Re-attach event listeners since we replaced innerHTML
        setupEventListeners();
        if (fileInput) fileInput.value = '';
        if (processNameInput) processNameInput.value = '';
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

    const tabBtns = document.querySelectorAll('.tab-btn');
    const docDesc = document.querySelector('.format-desc-doc');
    const audioDesc = document.querySelector('.format-desc-audio');

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        tabBtns.forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');
        currentTab = e.target.dataset.tab;

        if (currentTab === 'audio') {
          if (docDesc) docDesc.classList.add('hidden');
          if (audioDesc) audioDesc.classList.remove('hidden');
          if (audioLanguageSelect) audioLanguageSelect.classList.remove('hidden');
          fileInput.accept = 'audio/*,video/mp4,video/webm,video/ogg';
        } else {
          if (docDesc) docDesc.classList.remove('hidden');
          if (audioDesc) audioDesc.classList.add('hidden');
          if (audioLanguageSelect) audioLanguageSelect.classList.add('hidden');
          fileInput.accept = '.pdf,.doc,.docx,.txt';
        }
      });
    });
  }

  function init() {
    uploadZone = document.getElementById('uploadZone');
    fileInput = document.getElementById('fileInput');
    browseBtn = document.getElementById('browseBtn');
    processNameInput = document.getElementById('processNameInput');
    providerSelect = document.getElementById('providerSelect');
    modelSelect = document.getElementById('modelSelect');
    audioLanguageSelect = document.getElementById('audioLanguageSelect');

    setupEventListeners();
  }

  return { init };
})();
