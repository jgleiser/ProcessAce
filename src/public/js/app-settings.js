/* global showConfirmModal */
document.addEventListener('DOMContentLoaded', async () => {
  const t = window.i18n ? window.i18n.t : (k) => k;
  const form = document.getElementById('appSettingsForm');
  const providerSelect = document.getElementById('providerSelect');
  const saveBtn = document.getElementById('saveBtn');
  const messageContainer = document.getElementById('messageContainer');

  const transcriptionForm = document.getElementById('transcriptionSettingsForm');
  const transcriptionProviderSelect = document.getElementById('transcriptionProviderSelect');
  const transcriptionModelInput = document.getElementById('transcriptionModelInput');
  const transcriptionMaxFileSizeInput = document.getElementById('transcriptionMaxFileSizeInput');
  const saveTranscriptionBtn = document.getElementById('saveTranscriptionBtn');

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
    providerSelect.innerHTML = `<option value="">${t('appSettings.selectConfiguredProvider')}</option>`;

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
    const changeBtn = document.querySelector(`button[data-action="change"][data-provider="${provider}"]`);
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
    const deleteBtn = document.querySelector(`button[data-action="delete"][data-provider="${provider}"]`);
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!(await showConfirmModal(t('appSettings.deleteKeyConfirm', { provider: providerDisplayNames[provider] })))) {
          return;
        }

        try {
          const res = await fetch('/api/settings', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: `${provider}.apiKey` }),
          });

          if (!res.ok) throw new Error(`Failed to delete ${providerDisplayNames[provider]} API key`);

          showApiKeyConfigured(provider, false);
          document.getElementById(`${provider}KeyInput`).value = '';
          showMessage('success', t('appSettings.keyDeletedSuccess', { provider: providerDisplayNames[provider] }));
        } catch (err) {
          console.error(err);
          showMessage('error', t('appSettings.keyDeleteFailed', { provider: providerDisplayNames[provider] }));
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
          showMessage('error', t('appSettings.enterValidKey', { provider: providerDisplayNames[provider] }));
          return;
        }

        saveKeyBtn.disabled = true;
        saveKeyBtn.textContent = t('appSettings.saving');

        try {
          const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: `${provider}.apiKey`, value: apiKey }),
          });

          if (!res.ok) throw new Error('Failed to save API key');

          showApiKeyConfigured(provider, true);
          input.value = '';
          showMessage('success', t('appSettings.keySavedSuccess', { provider: providerDisplayNames[provider] }));
        } catch (err) {
          console.error(err);
          showMessage('error', t('appSettings.keySaveFailed', { provider: providerDisplayNames[provider] }));
        } finally {
          saveKeyBtn.disabled = false;
          saveKeyBtn.textContent = t('appSettings.saveKeyBtn');
        }
      });
    }
  });

  // Searchable Combobox Elements
  const modelInput = document.getElementById('modelInput');
  const modelValue = document.getElementById('modelValue');
  const loadModelsBtn = document.getElementById('loadModelsBtn');
  const baseUrlInput = document.getElementById('baseUrlInput');

  const transcriptionModelValue = document.getElementById('transcriptionModelValue');
  const loadTranscriptionModelsBtn = document.getElementById('loadTranscriptionModelsBtn');

  let allModels = [];
  let allTranscriptionModels = [];
  const VALID_TRANSCRIPTION_MODELS = ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe-diarize'];

  // --- Generic Searchable Combobox Logic ---
  function initCombobox(containerId, inputId, valueId, dropdownId, getModels, onSelect) {
    const input = document.getElementById(inputId);
    const valueEl = document.getElementById(valueId);
    const dropdown = document.getElementById(dropdownId);
    let highlightedIndex = -1;

    function render(filter = '') {
      const models = getModels();
      if (models.length === 0) {
        dropdown.innerHTML = `<div class="combobox-no-results">${t('appSettings.noModelsLoaded')}</div>`;
        dropdown.classList.add('open');
        return;
      }

      const filtered = models.filter(
        (m) => (m.id || '').toLowerCase().includes(filter.toLowerCase()) || (m.name || '').toLowerCase().includes(filter.toLowerCase()),
      );

      dropdown.innerHTML = '';
      highlightedIndex = -1;

      if (filtered.length === 0) {
        dropdown.innerHTML = `<div class="combobox-no-results">${t('appSettings.noModelsFound')}</div>`;
      } else {
        filtered.forEach((model, index) => {
          const div = document.createElement('div');
          div.className = 'combobox-option';
          div.textContent = model.name || model.id;
          div.dataset.value = model.id;
          div.addEventListener('click', () => {
            input.value = model.name || model.id;
            valueEl.value = model.id;
            dropdown.classList.remove('open');
            if (onSelect) onSelect(model);
          });
          div.addEventListener('mouseenter', () => {
            highlightedIndex = index;
            updateHighlight();
          });
          dropdown.appendChild(div);
        });
      }
    }

    function updateHighlight() {
      const options = dropdown.querySelectorAll('.combobox-option');
      options.forEach((opt, i) => {
        opt.classList.toggle('highlighted', i === highlightedIndex);
      });
    }

    input.addEventListener('focus', () => {
      render(input.value);
      dropdown.classList.add('open');
    });

    input.addEventListener('input', () => {
      render(input.value);
      dropdown.classList.add('open');
    });

    input.addEventListener('keydown', (e) => {
      const options = dropdown.querySelectorAll('.combobox-option');
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
          const val = options[highlightedIndex].dataset.value;
          const model = getModels().find((m) => m.id === val);
          if (model) {
            input.value = model.name || model.id;
            valueEl.value = model.id;
            dropdown.classList.remove('open');
            if (onSelect) onSelect(model);
          }
        }
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('open');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest(`#${containerId}`)) {
        dropdown.classList.remove('open');
      }
    });

    return { render };
  }

  const llmCombobox = initCombobox('modelCombobox', 'modelInput', 'modelValue', 'modelDropdown', () => allModels);
  const sttCombobox = initCombobox(
    'transcriptionModelCombobox',
    'transcriptionModelInput',
    'transcriptionModelValue',
    'transcriptionModelDropdown',
    () => allTranscriptionModels,
  );

  // Load models function
  async function loadModels(type = 'llm') {
    const isLlm = type === 'llm';
    const provider = isLlm ? providerSelect.value : transcriptionProviderSelect.value;
    const btn = isLlm ? loadModelsBtn : loadTranscriptionModelsBtn;
    const baseUrl = isLlm ? baseUrlInput.value : '';

    if (!provider) {
      showMessage('error', t('appSettings.selectProviderFirst'));
      return;
    }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = t('appSettings.loadingModels');
    messageContainer.innerHTML = '';

    try {
      const res = await fetch('/api/settings/verify-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: '', baseUrl }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch models');
      }

      const data = await res.json();

      if (data.models && data.models.length > 0) {
        if (isLlm) {
          allModels = data.models.map((m) => ({ id: m.id, name: m.name || m.id }));
          modelInput.value = '';
          modelValue.value = '';
          llmCombobox.render('');
          showMessage('success', t('appSettings.modelsLoadedSuccess', { count: data.models.length }));
        } else {
          allTranscriptionModels = data.models
            .filter((m) => VALID_TRANSCRIPTION_MODELS.includes(m.id))
            .map((m) => ({ id: m.id, name: m.name || m.id }));

          if (allTranscriptionModels.length === 0) {
            showMessage('error', t('appSettings.noSupportedTranscriptionModels'));
            return;
          }

          transcriptionModelInput.value = '';
          transcriptionModelValue.value = '';
          sttCombobox.render('');
          showMessage('success', t('appSettings.modelsLoadedSuccess', { count: allTranscriptionModels.length }));
        }
      } else {
        showMessage('error', t('appSettings.noModelsForProvider'));
      }
    } catch (err) {
      console.error(err);
      showMessage('error', `Error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  // Load Models Handlers
  loadModelsBtn.addEventListener('click', () => loadModels('llm'));
  loadTranscriptionModelsBtn.addEventListener('click', () => loadModels('transcription'));

  // Provider select change handler
  providerSelect.addEventListener('change', async () => {
    allModels = [];
    modelInput.value = '';
    modelValue.value = '';
    llmCombobox.render('');

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
      document.body.innerHTML = '<div class="access-denied">' + t('common.accessDenied') + '</div>';
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

      // Transcription settings
      if (settings['transcription.provider']) {
        transcriptionProviderSelect.value = settings['transcription.provider'];
      }
      if (settings['transcription.model']) {
        if (!allTranscriptionModels.some((m) => m.id === settings['transcription.model'])) {
          allTranscriptionModels.push({ id: settings['transcription.model'], name: settings['transcription.model'] });
        }
        transcriptionModelInput.value = settings['transcription.model'];
        transcriptionModelValue.value = settings['transcription.model'];
      }
      if (settings['transcription.maxFileSizeMB']) {
        transcriptionMaxFileSizeInput.value = settings['transcription.maxFileSizeMB'];
      }
    }
  } catch (err) {
    console.error(err);
    showMessage('error', t('appSettings.loadSettingsFailed'));
  }

  // Save full defaults
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!providerSelect.value) {
      showMessage('error', t('appSettings.selectDefaultProvider'));
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = t('appSettings.saving');

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

      showMessage('success', t('appSettings.settingsSaved'));
    } catch (err) {
      console.error(err);
      showMessage('error', t('appSettings.settingsSaveFailed'));
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = t('appSettings.saveDefaultModel');
    }
  });

  // Save transcription settings
  if (transcriptionForm) {
    transcriptionForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      saveTranscriptionBtn.disabled = true;
      const originalText = saveTranscriptionBtn.textContent;
      saveTranscriptionBtn.textContent = t('appSettings.saving');

      try {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'transcription.provider', value: transcriptionProviderSelect.value }),
        });

        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'transcription.model',
            value: (transcriptionModelValue.value || transcriptionModelInput.value).trim(),
          }),
        });

        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'transcription.maxFileSizeMB', value: transcriptionMaxFileSizeInput.value.trim() }),
        });

        showMessage('success', t('appSettings.settingsSaved'));
      } catch (err) {
        console.error(err);
        showMessage('error', t('appSettings.settingsSaveFailed'));
      } finally {
        saveTranscriptionBtn.disabled = false;
        saveTranscriptionBtn.textContent = originalText;
      }
    });
  }

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
