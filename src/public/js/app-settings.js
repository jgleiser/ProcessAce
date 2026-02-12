/* global showConfirmModal */
document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('appSettingsForm');
  const providerSelect = document.getElementById('providerSelect');
  const saveBtn = document.getElementById('saveBtn');
  const messageContainer = document.getElementById('messageContainer');

  function showMessage(type, text) {
    // Truncate long error messages
    const maxLength = 150;
    const displayText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    messageContainer.innerHTML = `<div style="padding: 1rem; margin-bottom: 1rem; border-radius: 8px; background: ${type === 'error' ? 'rgba(255, 82, 82, 0.1)' : 'rgba(0, 230, 118, 0.1)'}; color: ${type === 'error' ? 'var(--error)' : 'var(--success)'}; border: 1px solid ${type === 'error' ? 'var(--error)' : 'var(--success)'}; word-break: break-word; overflow-wrap: break-word;">${displayText}</div>`;
  }

  // API Key Elements
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiKeyInputContainer = document.getElementById('apiKeyInputContainer');
  const apiKeyConfigured = document.getElementById('apiKeyConfigured');
  const changeApiKeyBtn = document.getElementById('changeApiKeyBtn');
  const deleteApiKeyBtn = document.getElementById('deleteApiKeyBtn');
  const loadModelsBtn = document.getElementById('loadModelsBtn');
  const loadModelsBtnConfigured = document.getElementById('loadModelsBtnConfigured');
  const baseUrlInput = document.getElementById('baseUrlInput');

  // Show/hide API key states
  function showApiKeyConfigured(configured) {
    if (configured) {
      apiKeyConfigured.classList.remove('hidden');
      apiKeyInputContainer.classList.add('hidden');
    } else {
      apiKeyConfigured.classList.add('hidden');
      apiKeyInputContainer.classList.remove('hidden');
    }
  }

  // Change button handler
  changeApiKeyBtn.addEventListener('click', () => {
    showApiKeyConfigured(false);
    apiKeyInput.focus();
  });

  // Delete button handler
  deleteApiKeyBtn.addEventListener('click', async () => {
    if (
      !(await showConfirmModal(
        'Are you sure you want to delete the API key? This cannot be undone.',
      ))
    ) {
      return;
    }

    const provider = providerSelect.value;
    try {
      const res = await fetch('/api/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `${provider}.apiKey` }),
      });

      if (!res.ok) {
        throw new Error('Failed to delete API key');
      }

      showApiKeyConfigured(false);
      showMessage('success', 'API key deleted successfully');
    } catch (err) {
      console.error(err);
      showMessage('error', 'Failed to delete API key');
    }
  });

  // Searchable Combobox Elements
  const modelInput = document.getElementById('modelInput');
  const modelValue = document.getElementById('modelValue');
  const modelDropdown = document.getElementById('modelDropdown');

  // Store all models for filtering
  let allModels = [];
  let highlightedIndex = -1;

  // Render dropdown options
  function renderDropdown(filter = '') {
    // If no models loaded, show prompt
    if (allModels.length === 0) {
      modelDropdown.innerHTML =
        '<div class="combobox-no-results">No models loaded. Click "Load Models" to fetch available models.</div>';
      modelDropdown.classList.add('open');
      return;
    }

    const filtered = allModels.filter(
      (m) =>
        m.id.toLowerCase().includes(filter.toLowerCase()) ||
        m.name.toLowerCase().includes(filter.toLowerCase()),
    );

    modelDropdown.innerHTML = '';
    highlightedIndex = -1;

    if (filtered.length === 0) {
      modelDropdown.innerHTML = '<div class="combobox-no-results">No models found</div>';
    } else {
      filtered.forEach((model, index) => {
        const div = document.createElement('div');
        div.className = 'combobox-option';
        div.textContent = model.name || model.id;
        div.dataset.value = model.id;
        div.dataset.index = index;
        div.addEventListener('click', () => selectModel(model));
        div.addEventListener('mouseenter', () => {
          highlightedIndex = index;
          updateHighlight();
        });
        modelDropdown.appendChild(div);
      });
    }
  }

  // Select a model
  function selectModel(model) {
    modelInput.value = model.name || model.id;
    modelValue.value = model.id;
    modelDropdown.classList.remove('open');
  }

  // Update highlight on keyboard navigation
  function updateHighlight() {
    const options = modelDropdown.querySelectorAll('.combobox-option');
    options.forEach((opt, i) => {
      opt.classList.toggle('highlighted', i === highlightedIndex);
    });
  }

  // Open dropdown on focus
  modelInput.addEventListener('focus', () => {
    renderDropdown(modelInput.value);
    modelDropdown.classList.add('open');
  });

  // Filter on input
  modelInput.addEventListener('input', () => {
    renderDropdown(modelInput.value);
    modelDropdown.classList.add('open');
  });

  // Keyboard navigation
  modelInput.addEventListener('keydown', (e) => {
    const options = modelDropdown.querySelectorAll('.combobox-option');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, options.length - 1);
      updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      updateHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && options[highlightedIndex]) {
        const value = options[highlightedIndex].dataset.value;
        const model = allModels.find((m) => m.id === value);
        if (model) selectModel(model);
      }
    } else if (e.key === 'Escape') {
      modelDropdown.classList.remove('open');
    }
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#modelCombobox')) {
      modelDropdown.classList.remove('open');
    }
  });

  // Load models function (shared by both buttons)
  async function loadModels(button) {
    const provider = providerSelect.value;
    const apiKey = apiKeyInput.value; // May be empty if using configured key

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'Loading...';
    messageContainer.innerHTML = '';

    try {
      const res = await fetch('/api/settings/verify-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, baseUrl: baseUrlInput.value }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch models');
      }

      const data = await res.json();

      if (data.models && data.models.length > 0) {
        allModels = data.models.map((m) => ({ id: m.id, name: m.name || m.id }));
        // Clear the current model selection
        modelInput.value = '';
        modelValue.value = '';
        renderDropdown('');
        showMessage('success', `Successfully loaded ${data.models.length} models.`);
      } else {
        showMessage('error', 'No models found for this provider/key.');
      }
    } catch (err) {
      console.error(err);
      showMessage('error', `Error: ${err.message}`);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  // Verify Admin and Load Settings
  try {
    const authRes = await fetch('/api/auth/me');
    if (!authRes.ok) {
      window.location.href = '/login.html';
      return;
    }
    const user = await authRes.json();
    if (user.role !== 'admin') {
      document.body.innerHTML =
        '<div style="color:white; text-align:center; padding:2rem;">Access Denied</div>';
      return;
    }

    const settingsRes = await fetch('/api/settings');
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      if (settings['llm.provider']) providerSelect.value = settings['llm.provider'];
      if (settings['llm.model']) {
        if (!allModels.some((m) => m.id === settings['llm.model'])) {
          allModels.push({ id: settings['llm.model'], name: settings['llm.model'] });
        }
        modelInput.value = settings['llm.model'];
        modelValue.value = settings['llm.model'];
      }

      // Check if API key is configured for the selected provider
      const apiKeyKey = `${settings['llm.provider'] || 'openai'}.apiKey`;
      if (settings[apiKeyKey] === '********') {
        showApiKeyConfigured(true);
      } else {
        showApiKeyConfigured(false);
      }

      // Load base URL if configured
      if (settings['llm.baseUrl']) {
        baseUrlInput.value = settings['llm.baseUrl'];
      }
    }
  } catch (err) {
    console.error(err);
    showMessage('error', 'Failed to load settings');
  }

  // Load Models Handlers
  loadModelsBtn.addEventListener('click', () => loadModels(loadModelsBtn));
  loadModelsBtnConfigured.addEventListener('click', () => loadModels(loadModelsBtnConfigured));

  // Provider change handler - check if API key is configured for new provider
  providerSelect.addEventListener('change', async () => {
    const provider = providerSelect.value;
    try {
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        const apiKeyKey = `${provider}.apiKey`;
        if (settings[apiKeyKey] === '********') {
          showApiKeyConfigured(true);
        } else {
          showApiKeyConfigured(false);
          apiKeyInput.value = '';
        }
        // Clear models when switching providers
        allModels = [];

        // If switching to the saved provider, restore the saved model
        if (settings['llm.provider'] === provider && settings['llm.model']) {
          allModels.push({ id: settings['llm.model'], name: settings['llm.model'] });
          modelInput.value = settings['llm.model'];
          modelValue.value = settings['llm.model'];
        } else {
          modelInput.value = '';
          modelValue.value = '';
        }
        renderDropdown('');
      }
    } catch (err) {
      console.error('Failed to check API key status:', err);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      // Save Provider
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'llm.provider', value: providerSelect.value }),
      });

      // Save Model
      const selectedModel = modelValue.value || modelInput.value;
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'llm.model', value: selectedModel }),
      });

      // Save API Key if entered
      if (apiKeyInput.value) {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: `${providerSelect.value}.apiKey`, value: apiKeyInput.value }),
        });
        // After saving, show configured state
        showApiKeyConfigured(true);
        apiKeyInput.value = '';
      }

      // Save Base URL
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'llm.baseUrl', value: baseUrlInput.value }),
      });

      showMessage('success', 'Settings saved successfully');
    } catch (err) {
      console.error(err);
      showMessage('error', 'Failed to save settings');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
});
