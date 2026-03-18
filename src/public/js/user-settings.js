/* global showConfirmModal, showToast */
document.addEventListener('DOMContentLoaded', async () => {
  const t = window.i18n ? window.i18n.t : (k) => k;
  const form = document.getElementById('userSettingsForm');
  const deactivateForm = document.getElementById('deactivateAccountForm');
  const nameInput = document.getElementById('nameInput');
  const currentPasswordInput = document.getElementById('currentPasswordInput');
  const passwordInput = document.getElementById('passwordInput');
  const confirmPasswordInput = document.getElementById('confirmPasswordInput');
  const saveBtn = document.getElementById('saveBtn');
  const messageContainer = document.getElementById('messageContainer');
  const accountCreatedValue = document.getElementById('accountCreatedValue');
  const lastLoginValue = document.getElementById('lastLoginValue');
  const consentHistoryList = document.getElementById('consentHistoryList');
  const exportDataBtn = document.getElementById('exportDataBtn');
  const deactivateBtn = document.getElementById('deactivateBtn');
  const deactivatePasswordInput = document.getElementById('deactivatePasswordInput');

  const formatDate = (value) => {
    if (!value) {
      return t('userSettings.neverLoggedIn');
    }

    return new Date(value).toLocaleString();
  };

  function showMessage(type, text) {
    const message = document.createElement('div');
    const messageText = document.createElement('div');
    const dismissButton = document.createElement('button');

    message.className = `settings-message ${type === 'error' ? 'settings-message-error' : 'settings-message-success'}`;
    messageText.className = 'settings-message-content';
    messageText.textContent = text;

    dismissButton.type = 'button';
    dismissButton.className = 'notification-dismiss';
    dismissButton.setAttribute('aria-label', t('common.close'));
    dismissButton.innerHTML = '&times;';
    dismissButton.addEventListener('click', () => message.remove());

    message.append(messageText, dismissButton);
    messageContainer.innerHTML = '';
    messageContainer.appendChild(message);

    if (typeof showToast === 'function') {
      showToast(text, type === 'error' ? 'error' : 'success');
    }
  }

  function renderConsentHistory(consentHistory = []) {
    if (!consentHistory.length) {
      consentHistoryList.textContent = t('userSettings.noConsentHistory');
      return;
    }

    consentHistoryList.innerHTML = consentHistory
      .map((record) => {
        const consentTypeLabel = t(`userSettings.consentTypes.${record.consent_type}`);
        const grantedLabel = record.granted ? t('userSettings.consentGranted') : t('userSettings.consentRevoked');
        const ipAddress = record.ip_address || t('userSettings.ipUnavailable');
        const statusClass = record.granted ? 'is-granted' : 'is-revoked';

        return `
          <div class="consent-history-item">
            <div class="consent-history-heading">
              <strong class="consent-history-title">${escapeHtml(consentTypeLabel)}</strong>
              <span class="consent-history-status ${statusClass}">${escapeHtml(grantedLabel)}</span>
            </div>
            <div class="consent-history-meta">${escapeHtml(formatDate(record.timestamp))}</div>
            <div class="consent-history-meta">${escapeHtml(ipAddress)}</div>
          </div>
        `;
      })
      .join('');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function loadPrivacyData() {
    const [profileRes, consentRes] = await Promise.all([fetch('/api/auth/me'), fetch('/api/auth/me/consent')]);

    if (!profileRes.ok) {
      window.location.href = '/login.html';
      return;
    }

    if (!consentRes.ok) {
      throw new Error(t('userSettings.consentLoadFailed'));
    }

    const user = await profileRes.json();
    const consentData = await consentRes.json();

    nameInput.value = user.name || '';
    accountCreatedValue.textContent = formatDate(user.created_at);
    lastLoginValue.textContent = formatDate(user.last_login_at);
    renderConsentHistory(consentData.consentHistory || []);
  }

  try {
    await loadPrivacyData();
  } catch (err) {
    console.error(err);
    showMessage('error', err.message || t('common.errorOccurred'));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const currentPassword = currentPasswordInput.value;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (password) {
      if (!currentPassword) {
        showMessage('error', t('userSettings.currentPasswordRequired'));
        currentPasswordInput.focus();
        return;
      }
      if (password !== confirmPassword) {
        showMessage('error', t('userSettings.passwordMismatch'));
        return;
      }

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
      if (!passwordRegex.test(password)) {
        showMessage('error', t('userSettings.passwordRequirements'));
        return;
      }
    }

    saveBtn.disabled = true;
    saveBtn.textContent = t('common.saving');

    try {
      const body = {};
      if (name) body.name = name;
      if (password) {
        body.password = password;
        body.currentPassword = currentPassword;
      }

      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showMessage('success', t('userSettings.profileUpdated'));
        passwordInput.value = '';
        confirmPasswordInput.value = '';
        currentPasswordInput.value = '';
        await loadPrivacyData();
      } else {
        const errorData = await res.json();
        showMessage('error', errorData.error || t('userSettings.updateFailed'));
      }
    } catch {
      showMessage('error', t('common.errorOccurred'));
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = t('userSettings.saveChanges');
    }
  });

  exportDataBtn?.addEventListener('click', async () => {
    exportDataBtn.disabled = true;
    exportDataBtn.textContent = t('common.loading');

    try {
      const res = await fetch('/api/auth/me/data-export');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || t('userSettings.exportFailed'));
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const disposition = res.headers.get('content-disposition') || '';
      const filenameMatch = /filename="?([^"]+)"?/.exec(disposition);

      link.href = url;
      link.download = filenameMatch ? filenameMatch[1] : 'processace-data-export.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showMessage('success', t('userSettings.exportReady'));
    } catch (error) {
      showMessage('error', error.message || t('userSettings.exportFailed'));
    } finally {
      exportDataBtn.disabled = false;
      exportDataBtn.textContent = t('userSettings.exportDataBtn');
    }
  });

  deactivateForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const currentPassword = deactivatePasswordInput.value;
    if (!currentPassword) {
      showMessage('error', t('userSettings.deactivatePasswordRequired'));
      deactivatePasswordInput.focus();
      return;
    }

    if (!(await showConfirmModal(t('userSettings.deactivateConfirm')))) {
      return;
    }

    deactivateBtn.disabled = true;
    deactivateBtn.textContent = t('common.saving');

    try {
      const res = await fetch('/api/auth/me/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || t('userSettings.deactivateFailed'));
      }

      window.location.href = '/login.html';
    } catch (error) {
      showMessage('error', error.message || t('userSettings.deactivateFailed'));
    } finally {
      deactivateBtn.disabled = false;
      deactivateBtn.textContent = t('userSettings.deactivateBtn');
    }
  });

  document.querySelectorAll('.card-header-collapsible').forEach((header) => {
    header.addEventListener('click', () => {
      const card = header.closest('.card');
      if (card) {
        card.classList.toggle('collapsed');
      }
    });
  });
});
