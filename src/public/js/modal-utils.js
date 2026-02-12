// Function to inject modal HTML if not present
function ensureConfirmModalExists() {
  if (!document.getElementById('confirmModal')) {
    const modalHtml = `
    <div id="confirmModal" class="modal hidden">
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div class="modal-header" style="justify-content: center; border-bottom: none; padding-bottom: 0px; padding-top: 2rem;">
                <h3 id="confirmTitle" style="font-size: 1.5rem;">Confirm Action</h3>
            </div>
            <div class="modal-body" style="padding: 1rem 2rem 2rem 2rem;">
                <p id="confirmMessage" style="color: var(--text-muted); margin-bottom: 2rem; font-size: 1rem; white-space: pre-wrap;">Are you sure?</p>
                <div style="display: flex; gap: 1rem; justify-content: center;">
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
window.showConfirmModal = function (
  message,
  title = 'Confirm Action',
  yesLabel = 'Confirm',
  noLabel = 'Cancel',
) {
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
