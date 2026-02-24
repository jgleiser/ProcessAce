document.addEventListener('DOMContentLoaded', async () => {
  const t = window.i18n ? window.i18n.t : (k) => k;
  const form = document.getElementById('userSettingsForm');
  const nameInput = document.getElementById('nameInput');
  const currentPasswordInput = document.getElementById('currentPasswordInput');
  const passwordInput = document.getElementById('passwordInput');
  const confirmPasswordInput = document.getElementById('confirmPasswordInput');
  const saveBtn = document.getElementById('saveBtn');
  const messageContainer = document.getElementById('messageContainer');

  function showMessage(type, text) {
    messageContainer.innerHTML = `<div class="settings-message ${type === 'error' ? 'settings-message-error' : 'settings-message-success'}">${text}</div>`;
  }

  // Load current user data
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const user = await res.json();
      nameInput.value = user.name || '';
    } else {
      window.location.href = '/login.html';
    }
  } catch (err) {
    console.error(err);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const currentPassword = currentPasswordInput.value;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validation
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
    saveBtn.textContent = 'Saving...';

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
      } else {
        const errorData = await res.json();
        showMessage('error', errorData.error || t('userSettings.updateFailed'));
      }
    } catch {
      showMessage('error', 'An error occurred');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
});
