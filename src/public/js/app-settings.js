/* global showConfirmModal */
document.addEventListener('DOMContentLoaded', async () => {
  const t = window.i18n ? window.i18n.t : (key) => key;
  const DEFAULT_OLLAMA_URL = 'http://localhost:11434/v1';
  const ACTIVE_PULL_JOB_STORAGE_KEY = 'ollamaModelPullJobId';
  const OLLAMA_DEFAULT_MODEL = 'llama3.2';

  const keyManagedProviders = ['openai', 'google', 'anthropic'];
  const generationProviders = [...keyManagedProviders, 'ollama'];
  const providerDisplayNames = {
    openai: 'OpenAI',
    google: 'Google GenAI',
    anthropic: 'Anthropic',
    ollama: 'Ollama (Local)',
  };

  const form = document.getElementById('appSettingsForm');
  const providerSelect = document.getElementById('providerSelect');
  const saveBtn = document.getElementById('saveBtn');
  const messageContainer = document.getElementById('messageContainer');
  const baseUrlGroup = document.getElementById('baseUrlGroup');
  const baseUrlLabel = document.getElementById('baseUrlLabel');
  const baseUrlInput = document.getElementById('baseUrlInput');
  const baseUrlHelp = document.getElementById('baseUrlHelp');

  const modelInput = document.getElementById('modelInput');
  const modelValue = document.getElementById('modelValue');
  const loadModelsBtn = document.getElementById('loadModelsBtn');

  const localModelManagerCard = document.getElementById('localModelManagerCard');
  const modelDownloadSelect = document.getElementById('modelDownloadSelect');
  const btnDownloadModel = document.getElementById('btnDownloadModel');
  const downloadProgressContainer = document.getElementById('downloadProgressContainer');
  const modelDownloadStatus = document.getElementById('modelDownloadStatus');
  const modelDownloadProgressBar = document.getElementById('modelDownloadProgressBar');

  const transcriptionForm = document.getElementById('transcriptionSettingsForm');
  const transcriptionProviderSelect = document.getElementById('transcriptionProviderSelect');
  const transcriptionModelInput = document.getElementById('transcriptionModelInput');
  const transcriptionModelValue = document.getElementById('transcriptionModelValue');
  const transcriptionMaxFileSizeInput = document.getElementById('transcriptionMaxFileSizeInput');
  const loadTranscriptionModelsBtn = document.getElementById('loadTranscriptionModelsBtn');
  const saveTranscriptionBtn = document.getElementById('saveTranscriptionBtn');

  const VALID_TRANSCRIPTION_MODELS = ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe-diarize'];

  let configuredProviders = new Set();
  let currentSettings = {};
  let allModels = [];
  let allTranscriptionModels = [];
  let ollamaModelCatalog = [];
  let pullPollTimeout = null;
  let activePullJobId = sessionStorage.getItem(ACTIVE_PULL_JOB_STORAGE_KEY);

  const showMessage = (type, text) => {
    const maxLength = 180;
    const displayText = text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
    messageContainer.innerHTML = `<div class="settings-message ${type === 'error' ? 'settings-message-error' : 'settings-message-success'}">${displayText}</div>`;
  };

  const setActivePullJobId = (jobId) => {
    activePullJobId = jobId;
    if (jobId) {
      sessionStorage.setItem(ACTIVE_PULL_JOB_STORAGE_KEY, jobId);
    } else {
      sessionStorage.removeItem(ACTIVE_PULL_JOB_STORAGE_KEY);
    }
  };

  const getStoredBaseUrl = (provider, settings = currentSettings) => {
    if (provider === 'ollama') {
      return settings['ollama.baseUrl'] || DEFAULT_OLLAMA_URL;
    }

    if (provider === 'openai') {
      if (Object.prototype.hasOwnProperty.call(settings, 'openai.baseUrl')) {
        return settings['openai.baseUrl'] || '';
      }
      return settings['llm.baseUrl'] || '';
    }

    return '';
  };

  const updateProviderSelect = () => {
    const currentValue = providerSelect.value;
    providerSelect.innerHTML = `<option value="">${t('appSettings.selectProvider')}</option>`;

    generationProviders.forEach((provider) => {
      if (provider === 'ollama' || configuredProviders.has(provider)) {
        const option = document.createElement('option');
        option.value = provider;
        option.textContent = provider === 'ollama' ? t('appSettings.ollamaProvider') : providerDisplayNames[provider];
        providerSelect.appendChild(option);
      }
    });

    if ([...generationProviders, ''].includes(currentValue)) {
      providerSelect.value = currentValue;
    }
  };

  const showApiKeyConfigured = (provider, configured) => {
    const configuredDiv = document.getElementById(`${provider}KeyConfigured`);
    const inputContainer = document.getElementById(`${provider}KeyInputContainer`);

    if (configured) {
      configuredDiv.classList.remove('hidden');
      inputContainer.classList.add('hidden');
      configuredProviders.add(provider);

      const cancelBtn = document.querySelector(`.btn-cancel-key[data-provider="${provider}"]`);
      if (cancelBtn) {
        cancelBtn.classList.add('hidden');
      }
    } else {
      configuredDiv.classList.add('hidden');
      inputContainer.classList.remove('hidden');
      configuredProviders.delete(provider);
    }

    updateProviderSelect();
  };

  keyManagedProviders.forEach((provider) => {
    const changeBtn = document.querySelector(`button[data-action="change"][data-provider="${provider}"]`);
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        showApiKeyConfigured(provider, false);
        const cancelBtn = document.querySelector(`.btn-cancel-key[data-provider="${provider}"]`);
        if (cancelBtn) {
          cancelBtn.classList.remove('hidden');
        }
        const input = document.getElementById(`${provider}KeyInput`);
        if (input) {
          input.focus();
        }
      });
    }

    const cancelBtn = document.querySelector(`.btn-cancel-key[data-provider="${provider}"]`);
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        showApiKeyConfigured(provider, true);
        const input = document.getElementById(`${provider}KeyInput`);
        if (input) {
          input.value = '';
        }
      });
    }

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

          if (!res.ok) {
            throw new Error(`Failed to delete ${providerDisplayNames[provider]} API key`);
          }

          showApiKeyConfigured(provider, false);
          document.getElementById(`${provider}KeyInput`).value = '';
          showMessage('success', t('appSettings.keyDeletedSuccess', { provider: providerDisplayNames[provider] }));
        } catch (err) {
          console.error(err);
          showMessage('error', t('appSettings.keyDeleteFailed', { provider: providerDisplayNames[provider] }));
        }
      });
    }

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

          if (!res.ok) {
            throw new Error('Failed to save API key');
          }

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

  function initCombobox(containerId, inputId, valueId, dropdownId, getModels) {
    const input = document.getElementById(inputId);
    const valueEl = document.getElementById(valueId);
    const dropdown = document.getElementById(dropdownId);
    let highlightedIndex = -1;

    const render = (filter = '') => {
      const models = getModels();
      if (models.length === 0) {
        dropdown.innerHTML = `<div class="combobox-no-results">${t('appSettings.noModelsLoaded')}</div>`;
        dropdown.classList.add('open');
        return;
      }

      const filtered = models.filter(
        (model) => (model.id || '').toLowerCase().includes(filter.toLowerCase()) || (model.name || '').toLowerCase().includes(filter.toLowerCase()),
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
          });
          div.addEventListener('mouseenter', () => {
            highlightedIndex = index;
            updateHighlight();
          });
          dropdown.appendChild(div);
        });
      }
    };

    const updateHighlight = () => {
      const options = dropdown.querySelectorAll('.combobox-option');
      options.forEach((option, index) => {
        option.classList.toggle('highlighted', index === highlightedIndex);
      });
    };

    input.addEventListener('focus', () => {
      render(input.value);
      dropdown.classList.add('open');
    });

    input.addEventListener('input', () => {
      render(input.value);
      dropdown.classList.add('open');
    });

    input.addEventListener('keydown', (event) => {
      const options = dropdown.querySelectorAll('.combobox-option');
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        highlightedIndex = Math.min(highlightedIndex + 1, options.length - 1);
        updateHighlight();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        highlightedIndex = Math.max(highlightedIndex - 1, 0);
        updateHighlight();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (highlightedIndex >= 0 && options[highlightedIndex]) {
          const selectedId = options[highlightedIndex].dataset.value;
          const selectedModel = getModels().find((model) => model.id === selectedId);
          if (selectedModel) {
            input.value = selectedModel.name || selectedModel.id;
            valueEl.value = selectedModel.id;
            dropdown.classList.remove('open');
          }
        }
      } else if (event.key === 'Escape') {
        dropdown.classList.remove('open');
      }
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest(`#${containerId}`)) {
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

  const resetModelPullUi = () => {
    downloadProgressContainer.classList.add('hidden');
    modelDownloadStatus.textContent = t('appSettings.modelPullIdle');
    modelDownloadProgressBar.style.width = '0%';
    modelDownloadProgressBar.textContent = '0%';
    modelDownloadProgressBar.setAttribute('aria-valuenow', '0');
    modelDownloadProgressBar.classList.remove('is-complete', 'is-error');
  };

  const setModelPullControlsDisabled = (disabled) => {
    modelDownloadSelect.disabled = disabled;
    btnDownloadModel.disabled = disabled || !modelDownloadSelect.value;
  };

  const updateModelManagerVisibility = () => {
    const isOllama = providerSelect.value === 'ollama';
    localModelManagerCard.classList.toggle('hidden', !isOllama);

    if (!isOllama) {
      if (pullPollTimeout) {
        clearTimeout(pullPollTimeout);
        pullPollTimeout = null;
      }
      resetModelPullUi();
      setModelPullControlsDisabled(false);
    }
  };

  const updateBaseUrlUi = () => {
    const provider = providerSelect.value;
    const usesBaseUrl = provider === 'openai' || provider === 'ollama';
    baseUrlGroup.classList.toggle('hidden', !usesBaseUrl);

    if (!usesBaseUrl) {
      baseUrlInput.value = '';
      return;
    }

    if (provider === 'ollama') {
      baseUrlLabel.textContent = t('appSettings.baseUrlLabelOllama');
      baseUrlInput.placeholder = t('appSettings.baseUrlPlaceholderOllama');
      baseUrlHelp.textContent = t('appSettings.baseUrlHelpOllama');
      baseUrlInput.value = getStoredBaseUrl('ollama');
      return;
    }

    baseUrlLabel.textContent = t('appSettings.baseUrlLabelOpenai');
    baseUrlInput.placeholder = t('appSettings.baseUrlPlaceholderOpenai');
    baseUrlHelp.textContent = t('appSettings.baseUrlHelpOpenai');
    baseUrlInput.value = getStoredBaseUrl('openai');
  };

  const restoreModelForProvider = () => {
    allModels = [];
    modelInput.value = '';
    modelValue.value = '';
    llmCombobox.render('');

    if (currentSettings['llm.provider'] === providerSelect.value && currentSettings['llm.model']) {
      allModels.push({ id: currentSettings['llm.model'], name: currentSettings['llm.model'] });
      modelInput.value = currentSettings['llm.model'];
      modelValue.value = currentSettings['llm.model'];
      return;
    }

    if (providerSelect.value === 'ollama') {
      allModels.push({ id: OLLAMA_DEFAULT_MODEL, name: OLLAMA_DEFAULT_MODEL });
      modelInput.value = OLLAMA_DEFAULT_MODEL;
      modelValue.value = OLLAMA_DEFAULT_MODEL;
    }
  };

  const renderModelCatalog = () => {
    modelDownloadSelect.innerHTML = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    placeholderOption.textContent = t('appSettings.selectModelToInstall');
    modelDownloadSelect.appendChild(placeholderOption);

    ollamaModelCatalog.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.label} (${model.sizeLabel})`;
      modelDownloadSelect.appendChild(option);
    });

    btnDownloadModel.disabled = true;
  };

  const loadCatalog = async () => {
    const res = await fetch('/api/settings/llm/catalog');
    if (!res.ok) {
      throw new Error(t('appSettings.modelCatalogLoadFailed'));
    }

    const data = await res.json();
    ollamaModelCatalog = Array.isArray(data.models) ? data.models : [];
    renderModelCatalog();
  };

  const loadModels = async (type = 'llm') => {
    const isLlm = type === 'llm';
    const provider = isLlm ? providerSelect.value : transcriptionProviderSelect.value;
    const btn = isLlm ? loadModelsBtn : loadTranscriptionModelsBtn;
    const baseUrl = isLlm && (provider === 'openai' || provider === 'ollama') ? baseUrlInput.value.trim() : '';

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
          allModels = data.models.map((model) => ({ id: model.id, name: model.name || model.id }));
          llmCombobox.render('');
          showMessage('success', t('appSettings.modelsLoadedSuccess', { count: data.models.length }));
        } else {
          allTranscriptionModels = data.models
            .filter((model) => VALID_TRANSCRIPTION_MODELS.includes(model.id))
            .map((model) => ({ id: model.id, name: model.name || model.id }));

          if (allTranscriptionModels.length === 0) {
            showMessage('error', t('appSettings.noSupportedTranscriptionModels'));
            return;
          }

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
  };

  const pollModelPullJob = async (jobId) => {
    try {
      const res = await fetch(`/api/settings/llm/pull/${jobId}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('appSettings.modelPullStatusFailed'));
      }

      downloadProgressContainer.classList.remove('hidden');
      modelDownloadStatus.textContent = data.progressMessage || t('appSettings.modelPullInProgress');
      modelDownloadProgressBar.style.width = `${data.progress}%`;
      modelDownloadProgressBar.textContent = `${data.progress}%`;
      modelDownloadProgressBar.setAttribute('aria-valuenow', String(data.progress));

      if (data.status === 'completed') {
        modelDownloadStatus.textContent = t('appSettings.modelPullComplete');
        modelDownloadProgressBar.classList.add('is-complete');
        setActivePullJobId(null);
        setModelPullControlsDisabled(false);
        await loadModels('llm');
        return;
      }

      if (data.status === 'failed') {
        modelDownloadStatus.textContent = data.error || t('appSettings.modelPullFailed');
        modelDownloadProgressBar.classList.add('is-error');
        setActivePullJobId(null);
        setModelPullControlsDisabled(false);
        return;
      }

      pullPollTimeout = setTimeout(() => {
        pollModelPullJob(jobId);
      }, 2000);
    } catch (err) {
      console.error(err);
      modelDownloadStatus.textContent = err.message || t('appSettings.modelPullStatusFailed');
      modelDownloadProgressBar.classList.add('is-error');
      setActivePullJobId(null);
      setModelPullControlsDisabled(false);
    }
  };

  const startModelPullPolling = (jobId) => {
    if (pullPollTimeout) {
      clearTimeout(pullPollTimeout);
      pullPollTimeout = null;
    }

    downloadProgressContainer.classList.remove('hidden');
    modelDownloadProgressBar.classList.remove('is-complete', 'is-error');
    modelDownloadStatus.textContent = t('appSettings.modelPullInProgress');
    modelDownloadProgressBar.style.width = '0%';
    modelDownloadProgressBar.textContent = '0%';
    modelDownloadProgressBar.setAttribute('aria-valuenow', '0');
    setActivePullJobId(jobId);
    setModelPullControlsDisabled(true);
    pollModelPullJob(jobId);
  };

  loadModelsBtn.addEventListener('click', () => loadModels('llm'));
  loadTranscriptionModelsBtn.addEventListener('click', () => loadModels('transcription'));

  providerSelect.addEventListener('change', () => {
    restoreModelForProvider();
    updateBaseUrlUi();
    updateModelManagerVisibility();
  });

  modelDownloadSelect.addEventListener('change', () => {
    btnDownloadModel.disabled = !modelDownloadSelect.value;
  });

  btnDownloadModel.addEventListener('click', async (event) => {
    event.preventDefault();
    if (!modelDownloadSelect.value) {
      return;
    }

    try {
      setModelPullControlsDisabled(true);
      modelDownloadStatus.textContent = t('appSettings.modelPullStarting');
      downloadProgressContainer.classList.remove('hidden');

      const res = await fetch('/api/settings/llm/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: modelDownloadSelect.value }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('appSettings.modelPullFailed'));
      }

      startModelPullPolling(data.jobId);
    } catch (err) {
      console.error(err);
      modelDownloadStatus.textContent = err.message || t('appSettings.modelPullFailed');
      modelDownloadProgressBar.classList.add('is-error');
      setModelPullControlsDisabled(false);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

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

      const selectedModel = (modelValue.value || modelInput.value || '').trim();
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'llm.model', value: selectedModel || (providerSelect.value === 'ollama' ? OLLAMA_DEFAULT_MODEL : '') }),
      });

      if (providerSelect.value === 'ollama') {
        const nextOllamaUrl = baseUrlInput.value.trim() || getStoredBaseUrl('ollama');
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'ollama.baseUrl', value: nextOllamaUrl }),
        });
        currentSettings['ollama.baseUrl'] = nextOllamaUrl;
      } else if (providerSelect.value === 'openai') {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'openai.baseUrl', value: baseUrlInput.value.trim() }),
        });
        currentSettings['openai.baseUrl'] = baseUrlInput.value.trim();
      }

      currentSettings['llm.provider'] = providerSelect.value;
      currentSettings['llm.model'] = selectedModel || (providerSelect.value === 'ollama' ? OLLAMA_DEFAULT_MODEL : '');
      showMessage('success', t('appSettings.settingsSaved'));
    } catch (err) {
      console.error(err);
      showMessage('error', t('appSettings.settingsSaveFailed'));
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = t('appSettings.saveDefaultModel');
    }
  });

  transcriptionForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

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

  try {
    const authRes = await fetch('/api/auth/me');
    if (!authRes.ok) {
      window.location.href = '/login.html';
      return;
    }

    const user = await authRes.json();
    if (user.role !== 'admin') {
      document.body.innerHTML = `<div class="access-denied">${t('common.accessDenied')}</div>`;
      return;
    }

    const [settingsRes, catalogLoad] = await Promise.all([fetch('/api/settings'), loadCatalog()]);
    if (!settingsRes.ok) {
      throw new Error(t('appSettings.loadSettingsFailed'));
    }

    currentSettings = await settingsRes.json();
    await catalogLoad;

    keyManagedProviders.forEach((provider) => {
      showApiKeyConfigured(provider, currentSettings[`${provider}.apiKey`] === '********');
    });

    const selectedProvider =
      currentSettings['llm.provider'] && generationProviders.includes(currentSettings['llm.provider']) ? currentSettings['llm.provider'] : 'openai';
    providerSelect.value = selectedProvider;

    restoreModelForProvider();
    updateBaseUrlUi();
    updateModelManagerVisibility();

    if (currentSettings['transcription.provider']) {
      transcriptionProviderSelect.value = currentSettings['transcription.provider'];
    }

    if (currentSettings['transcription.model']) {
      allTranscriptionModels.push({ id: currentSettings['transcription.model'], name: currentSettings['transcription.model'] });
      transcriptionModelInput.value = currentSettings['transcription.model'];
      transcriptionModelValue.value = currentSettings['transcription.model'];
    }

    if (currentSettings['transcription.maxFileSizeMB']) {
      transcriptionMaxFileSizeInput.value = currentSettings['transcription.maxFileSizeMB'];
    }

    if (activePullJobId && providerSelect.value === 'ollama') {
      startModelPullPolling(activePullJobId);
    } else {
      resetModelPullUi();
    }
  } catch (err) {
    console.error(err);
    showMessage('error', err.message || t('appSettings.loadSettingsFailed'));
  }

  window.addEventListener('beforeunload', () => {
    if (pullPollTimeout) {
      clearTimeout(pullPollTimeout);
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
