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
