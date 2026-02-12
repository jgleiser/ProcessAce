document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('userSettingsForm');
  const nameInput = document.getElementById('nameInput');
  const currentPasswordInput = document.getElementById('currentPasswordInput');
  const passwordInput = document.getElementById('passwordInput');
  const confirmPasswordInput = document.getElementById('confirmPasswordInput');
  const saveBtn = document.getElementById('saveBtn');
  const messageContainer = document.getElementById('messageContainer');

  function showMessage(type, text) {
    messageContainer.innerHTML = `<div style="padding: 1rem; margin-bottom: 1rem; border-radius: 8px; background: ${type === 'error' ? 'rgba(255, 82, 82, 0.1)' : 'rgba(0, 230, 118, 0.1)'}; color: ${type === 'error' ? 'var(--error)' : 'var(--success)'}; border: 1px solid ${type === 'error' ? 'var(--error)' : 'var(--success)'};">${text}</div>`;
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
        showMessage('error', 'Current password is required to set a new password');
        currentPasswordInput.focus();
        return;
      }
      if (password !== confirmPassword) {
        showMessage('error', 'New passwords do not match');
        return;
      }

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
      if (!passwordRegex.test(password)) {
        showMessage(
          'error',
          'Password must be at least 8 characters long and include uppercase, lowercase, and numbers.',
        );
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
        showMessage('success', 'Profile updated successfully');
        passwordInput.value = '';
        confirmPasswordInput.value = '';
        currentPasswordInput.value = '';
      } else {
        const data = await res.json();
        showMessage('error', data.error || 'Failed to update profile');
      }
    } catch (err) {
      showMessage('error', 'An error occurred');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
});
