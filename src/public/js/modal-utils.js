// Function to inject modal HTML if not present
function ensureConfirmModalExists() {
  if (!document.getElementById('confirmModal')) {
    const modalHtml = `
    <div id="confirmModal" class="modal hidden">
        <div class="modal-content modal-dialog">
            <div class="modal-header modal-dialog-header">
                <h3 id="confirmTitle" class="modal-dialog-title">Confirm Action</h3>
            </div>
            <div class="modal-body modal-dialog-body">
                <p id="confirmMessage" class="modal-dialog-message">Are you sure?</p>
                <div class="modal-dialog-actions">
                    <button id="confirmNo" class="btn-secondary">Cancel</button>
                    <button id="confirmYes" class="btn-danger">Confirm</button>
                </div>
            </div>
        </div>
    </div>
        `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }
}

// Global function to show confirm modal
window.showConfirmModal = function (message, title, yesLabel, noLabel) {
  const t = window.i18n ? window.i18n.t : (k) => k;
  title = title || t('modals.confirmTitle');
  yesLabel = yesLabel || t('modals.confirmYes');
  noLabel = noLabel || t('modals.confirmNo');
  ensureConfirmModalExists();

  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const msgEl = document.getElementById('confirmMessage');
    const titleEl = document.getElementById('confirmTitle');
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');

    if (msgEl) msgEl.textContent = message;
    if (titleEl) titleEl.textContent = title;
    if (yesBtn) yesBtn.textContent = yesLabel;
    if (noBtn) noBtn.textContent = noLabel;

    modal.classList.remove('hidden');

    // Force reflow for animation if needed
    void modal.offsetWidth;

    const cleanup = () => {
      modal.classList.add('hidden');
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      window.removeEventListener('keydown', onKey);
    };

    const onYes = () => {
      cleanup();
      resolve(true);
    };

    const onNo = () => {
      cleanup();
      resolve(false);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onNo();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onYes();
      }
    };

    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    window.addEventListener('keydown', onKey);

    // Focus confirm button for accessibility/convenience
    yesBtn.focus();
  });
};

// Function to inject alert modal HTML if not present
function ensureAlertModalExists() {
  if (!document.getElementById('alertModal')) {
    const modalHtml = `
    <div id="alertModal" class="modal hidden">
        <div class="modal-content modal-dialog">
            <div class="modal-header modal-dialog-header">
                <h3 id="alertTitle" class="modal-dialog-title">Alert</h3>
            </div>
            <div class="modal-body modal-dialog-body">
                <p id="alertMessage" class="modal-dialog-message"></p>
                <div class="modal-dialog-actions">
                    <button id="alertBtn" class="btn-primary">OK</button>
                </div>
            </div>
        </div>
    </div>
        `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }
}

// Global function to show alert modal
window.showAlertModal = function (message, title, btnLabel) {
  const t = window.i18n ? window.i18n.t : (k) => k;
  title = title || t('modals.alertTitle');
  btnLabel = btnLabel || t('modals.alertOk');
  ensureAlertModalExists();

  return new Promise((resolve) => {
    const modal = document.getElementById('alertModal');
    const msgEl = document.getElementById('alertMessage');
    const titleEl = document.getElementById('alertTitle');
    const btn = document.getElementById('alertBtn');

    if (msgEl) msgEl.textContent = message;
    if (titleEl) titleEl.textContent = title;
    if (btn) btn.textContent = btnLabel;

    modal.classList.remove('hidden');

    // Force reflow
    void modal.offsetWidth;

    const cleanup = () => {
      modal.classList.add('hidden');
      btn.removeEventListener('click', onBtn);
      window.removeEventListener('keydown', onKey);
    };

    const onBtn = () => {
      cleanup();
      resolve(true);
    };

    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        onBtn();
      }
    };

    btn.addEventListener('click', onBtn);
    window.addEventListener('keydown', onKey);

    btn.focus();
  });
};

// Function to inject unsaved changes modal HTML if not present
function ensureUnsavedChangesModalExists() {
  if (!document.getElementById('unsavedChangesModal')) {
    const modalHtml = `
    <div id="unsavedChangesModal" class="modal hidden">
        <div class="modal-content modal-dialog">
            <div class="modal-header modal-dialog-header">
                <h3 id="unsavedTitle" class="modal-dialog-title">Unsaved Changes</h3>
            </div>
            <div class="modal-body modal-dialog-body">
                <p id="unsavedMessage" class="modal-dialog-message">You have unsaved changes. Do you want to save them before leaving?</p>
                <div class="modal-dialog-actions">
                    <button id="unsavedCancel" class="btn-secondary">Cancel</button>
                    <button id="unsavedDiscard" class="btn-danger">Discard</button>
                    <button id="unsavedSave" class="btn-primary">Save</button>
                </div>
            </div>
        </div>
    </div>
        `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }
}

// Global function to show unsaved changes modal
window.showUnsavedChangesModal = function (message, title) {
  const t = window.i18n ? window.i18n.t : (k) => k;
  title = title || t('modals.unsavedTitle');
  message = message || t('modals.unsavedMessage');
  const saveLabel = t('modals.unsavedSave');
  const discardLabel = t('modals.unsavedDiscard');
  const cancelLabel = t('modals.unsavedCancel');
  ensureUnsavedChangesModalExists();

  return new Promise((resolve) => {
    const modal = document.getElementById('unsavedChangesModal');
    const msgEl = document.getElementById('unsavedMessage');
    const titleEl = document.getElementById('unsavedTitle');
    const saveBtn = document.getElementById('unsavedSave');
    const discardBtn = document.getElementById('unsavedDiscard');
    const cancelBtn = document.getElementById('unsavedCancel');

    if (msgEl) msgEl.textContent = message;
    if (titleEl) titleEl.textContent = title;
    if (saveBtn) saveBtn.textContent = saveLabel;
    if (discardBtn) discardBtn.textContent = discardLabel;
    if (cancelBtn) cancelBtn.textContent = cancelLabel;

    modal.classList.remove('hidden');

    // Force reflow
    void modal.offsetWidth;

    const cleanup = () => {
      modal.classList.add('hidden');
      saveBtn.removeEventListener('click', onSave);
      discardBtn.removeEventListener('click', onDiscard);
      cancelBtn.removeEventListener('click', onCancel);
      window.removeEventListener('keydown', onKey);
    };

    const onSave = () => {
      cleanup();
      resolve('save');
    };

    const onDiscard = () => {
      cleanup();
      resolve('discard');
    };

    const onCancel = () => {
      cleanup();
      resolve('cancel');
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onSave();
      }
    };

    saveBtn.addEventListener('click', onSave);
    discardBtn.addEventListener('click', onDiscard);
    cancelBtn.addEventListener('click', onCancel);
    window.addEventListener('keydown', onKey);

    saveBtn.focus();
  });
};
