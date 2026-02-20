/* global showConfirmModal */
document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('appSettingsForm');
  const providerSelect = document.getElementById('providerSelect');
  const saveBtn = document.getElementById('saveBtn');
  const messageContainer = document.getElementById('messageContainer');

  const providers = ['openai', 'google', 'anthropic'];
  const providerDisplayNames = {
    openai: 'OpenAI',
    google: 'Google GenAI',
    anthropic: 'Anthropic',
  };

  let configuredProviders = new Set();

  function showMessage(type, text) {
    const maxLength = 150;
    const displayText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    messageContainer.innerHTML = `<div class="settings-message ${type === 'error' ? 'settings-message-error' : 'settings-message-success'}">${displayText}</div>`;
  }

  function showApiKeyConfigured(provider, configured) {
    const configuredDiv = document.getElementById(`${provider}KeyConfigured`);
    const inputContainer = document.getElementById(`${provider}KeyInputContainer`);

    if (configured) {
      configuredDiv.classList.remove('hidden');
      inputContainer.classList.add('hidden');
      configuredProviders.add(provider);

      const cancelBtn = document.querySelector(`.btn-cancel-key[data-provider="${provider}"]`);
      if (cancelBtn) cancelBtn.classList.add('hidden');
    } else {
      configuredDiv.classList.add('hidden');
      inputContainer.classList.remove('hidden');
      configuredProviders.delete(provider);
    }
    updateProviderSelect();
  }

  function updateProviderSelect() {
    const currentValue = providerSelect.value;
    providerSelect.innerHTML = '<option value="">-- Select a Configured Provider --</option>';

    providers.forEach((p) => {
      if (configuredProviders.has(p)) {
        const option = document.createElement('option');
        option.value = p;
        option.textContent = providerDisplayNames[p];
        providerSelect.appendChild(option);
      }
    });

    if (configuredProviders.has(currentValue)) {
      providerSelect.value = currentValue;
    }
  }

  // Handle Change/Delete/Save actions for each provider
  providers.forEach((provider) => {
    // Change
    const changeBtn = document.querySelector(
      `button[data-action="change"][data-provider="${provider}"]`,
    );
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        showApiKeyConfigured(provider, false);
        const cancelBtn = document.querySelector(`.btn-cancel-key[data-provider="${provider}"]`);
        if (cancelBtn) cancelBtn.classList.remove('hidden');
        const input = document.getElementById(`${provider}KeyInput`);
        if (input) input.focus();
      });
    }

    // Cancel
    const cancelBtn = document.querySelector(`.btn-cancel-key[data-provider="${provider}"]`);
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        showApiKeyConfigured(provider, true);
        const input = document.getElementById(`${provider}KeyInput`);
        if (input) input.value = '';
      });
    }

    // Delete
    const deleteBtn = document.querySelector(
      `button[data-action="delete"][data-provider="${provider}"]`,
    );
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (
          !(await showConfirmModal(
            `Are you sure you want to delete the ${providerDisplayNames[provider]} API key?`,
          ))
        ) {
          return;
        }

        try {
          const res = await fetch('/api/settings', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: `${provider}.apiKey` }),
          });

          if (!res.ok)
            throw new Error(`Failed to delete ${providerDisplayNames[provider]} API key`);

          showApiKeyConfigured(provider, false);
          document.getElementById(`${provider}KeyInput`).value = '';
          showMessage('success', `${providerDisplayNames[provider]} API key deleted successfully`);
        } catch (err) {
          console.error(err);
          showMessage('error', `Failed to delete ${providerDisplayNames[provider]} API key`);
        }
      });
    }

    // Save
    const saveKeyBtn = document.querySelector(`button.btn-save-key[data-provider="${provider}"]`);
    if (saveKeyBtn) {
      saveKeyBtn.addEventListener('click', async () => {
        const input = document.getElementById(`${provider}KeyInput`);
        const apiKey = input.value.trim();

        if (!apiKey) {
          showMessage(
            'error',
            `Please enter a valid API key for ${providerDisplayNames[provider]}`,
          );
          return;
        }

        saveKeyBtn.disabled = true;
        saveKeyBtn.textContent = 'Saving...';

        try {
          const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: `${provider}.apiKey`, value: apiKey }),
          });

          if (!res.ok) throw new Error('Failed to save API key');

          showApiKeyConfigured(provider, true);
          input.value = '';
          showMessage('success', `${providerDisplayNames[provider]} API key saved successfully`);
        } catch (err) {
          console.error(err);
          showMessage('error', `Failed to save ${providerDisplayNames[provider]} API key`);
        } finally {
          saveKeyBtn.disabled = false;
          saveKeyBtn.textContent = 'Save Key';
        }
      });
    }
  });

  // Searchable Combobox Elements
  const modelInput = document.getElementById('modelInput');
  const modelValue = document.getElementById('modelValue');
  const modelDropdown = document.getElementById('modelDropdown');
  const loadModelsBtn = document.getElementById('loadModelsBtn');
  const baseUrlInput = document.getElementById('baseUrlInput');

  let allModels = [];
  let highlightedIndex = -1;

  function renderDropdown(filter = '') {
    if (allModels.length === 0) {
      modelDropdown.innerHTML =
        '<div class="combobox-no-results">No models loaded. Click "Load Models" to fetch models.</div>';
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

  function selectModel(model) {
    modelInput.value = model.name || model.id;
    modelValue.value = model.id;
    modelDropdown.classList.remove('open');
  }

  function updateHighlight() {
    const options = modelDropdown.querySelectorAll('.combobox-option');
    options.forEach((opt, i) => {
      opt.classList.toggle('highlighted', i === highlightedIndex);
    });
  }

  modelInput.addEventListener('focus', () => {
    renderDropdown(modelInput.value);
    modelDropdown.classList.add('open');
  });

  modelInput.addEventListener('input', () => {
    renderDropdown(modelInput.value);
    modelDropdown.classList.add('open');
  });

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

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#modelCombobox')) {
      modelDropdown.classList.remove('open');
    }
  });

  // Load models function
  async function loadModels() {
    const provider = providerSelect.value;
    if (!provider) {
      showMessage('error', 'Please select a configured provider first.');
      return;
    }

    loadModelsBtn.disabled = true;
    const originalText = loadModelsBtn.textContent;
    loadModelsBtn.textContent = 'Loading...';
    messageContainer.innerHTML = '';

    try {
      const res = await fetch('/api/settings/verify-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: '', baseUrl: baseUrlInput.value }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch models');
      }

      const data = await res.json();

      if (data.models && data.models.length > 0) {
        allModels = data.models.map((m) => ({ id: m.id, name: m.name || m.id }));
        modelInput.value = '';
        modelValue.value = '';
        renderDropdown('');
        showMessage('success', `Successfully loaded ${data.models.length} models.`);
      } else {
        showMessage('error', 'No models found for this provider.');
      }
    } catch (err) {
      console.error(err);
      showMessage('error', `Error: ${err.message}`);
    } finally {
      loadModelsBtn.disabled = false;
      loadModelsBtn.textContent = originalText;
    }
  }

  // Load Models Handler
  loadModelsBtn.addEventListener('click', loadModels);

  // Provider select change handler
  providerSelect.addEventListener('change', async () => {
    allModels = [];
    modelInput.value = '';
    modelValue.value = '';
    renderDropdown('');

    // If switching back to the globally saved provider, restore its model and base URL
    try {
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (settings['llm.provider'] === providerSelect.value) {
          if (settings['llm.model']) {
            allModels.push({ id: settings['llm.model'], name: settings['llm.model'] });
            modelInput.value = settings['llm.model'];
            modelValue.value = settings['llm.model'];
          }
        }
      }
    } catch (err) {
      console.error('Failed to update models on provider change', err);
    }
  });

  // Fetch init settings
  try {
    const authRes = await fetch('/api/auth/me');
    if (!authRes.ok) {
      window.location.href = '/login.html';
      return;
    }
    const user = await authRes.json();
    if (user.role !== 'admin') {
      document.body.innerHTML = '<div class="access-denied">Access Denied</div>';
      return;
    }

    const settingsRes = await fetch('/api/settings');
    if (settingsRes.ok) {
      const settings = await settingsRes.json();

      // Determine which are configured
      providers.forEach((p) => {
        if (settings[`${p}.apiKey`] === '********') {
          showApiKeyConfigured(p, true);
        } else {
          showApiKeyConfigured(p, false);
        }
      });

      if (settings['llm.provider'] && configuredProviders.has(settings['llm.provider'])) {
        providerSelect.value = settings['llm.provider'];
      }

      if (settings['llm.model']) {
        if (!allModels.some((m) => m.id === settings['llm.model'])) {
          allModels.push({ id: settings['llm.model'], name: settings['llm.model'] });
        }
        modelInput.value = settings['llm.model'];
        modelValue.value = settings['llm.model'];
      }

      if (settings['llm.baseUrl']) {
        baseUrlInput.value = settings['llm.baseUrl'];
      }
    }
  } catch (err) {
    console.error(err);
    showMessage('error', 'Failed to load settings');
  }

  // Save full defaults
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!providerSelect.value) {
      showMessage('error', 'Please select a default provider.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'llm.provider', value: providerSelect.value }),
      });

      const selectedModel = modelValue.value || modelInput.value;
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'llm.model', value: selectedModel }),
      });

      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'llm.baseUrl', value: baseUrlInput.value }),
      });

      showMessage('success', 'Default Model Settings saved successfully');
    } catch (err) {
      console.error(err);
      showMessage('error', 'Failed to save default settings');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Default Model';
    }
  });

  // Collapsible cards feature
  const collapsibleHeaders = document.querySelectorAll('.card-header-collapsible');
  collapsibleHeaders.forEach((header) => {
    header.addEventListener('click', () => {
      const card = header.closest('.card');
      if (card) {
        card.classList.toggle('collapsed');
      }
    });
  });
});
