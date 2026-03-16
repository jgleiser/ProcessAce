/* global showConfirmModal, showToast */
document.addEventListener('DOMContentLoaded', async () => {
  const t = window.i18n ? window.i18n.t : (key) => key;
  const DEFAULT_OLLAMA_URL = 'http://ollama:11434/v1';
  const ACTIVE_PULL_JOB_STORAGE_KEY = 'ollamaModelPullJobId';
  const ACTIVE_PULL_MODEL_STORAGE_KEY = 'ollamaModelPullModelId';

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
  const checkModelStatusBtn = document.getElementById('checkModelStatusBtn');

  const localModelManagerCard = document.getElementById('localModelManagerCard');
  const modelCatalogSummary = document.getElementById('modelCatalogSummary');
  const modelCatalogList = document.getElementById('modelCatalogList');
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
  let ollamaInstalledModelIds = new Set();
  let ollamaStatusResolved = false;
  let isCatalogActionPending = false;
  let pullPollTimeout = null;
  let activePullJobId = sessionStorage.getItem(ACTIVE_PULL_JOB_STORAGE_KEY);
  let activePullModelId = sessionStorage.getItem(ACTIVE_PULL_MODEL_STORAGE_KEY);

  const showMessage = (type, text) => {
    const maxLength = 180;
    const displayText = text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
    const message = document.createElement('div');
    const messageText = document.createElement('div');
    const dismissButton = document.createElement('button');

    message.className = `settings-message ${type === 'error' ? 'settings-message-error' : 'settings-message-success'}`;
    messageText.className = 'settings-message-content';
    messageText.textContent = displayText;

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
  };

  const notifyModelChange = (message, type = 'success') => {
    showMessage(type === 'error' ? 'error' : 'success', message);
  };

  const saveSettingOrThrow = async (key, value) => {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });

    if (!response.ok) {
      throw new Error(t('appSettings.settingsSaveFailed'));
    }
  };

  const setActivePullJobId = (jobId) => {
    activePullJobId = jobId;
    if (jobId) {
      sessionStorage.setItem(ACTIVE_PULL_JOB_STORAGE_KEY, jobId);
    } else {
      sessionStorage.removeItem(ACTIVE_PULL_JOB_STORAGE_KEY);
    }
  };

  const setActivePullModelId = (modelId) => {
    activePullModelId = modelId;
    if (modelId) {
      sessionStorage.setItem(ACTIVE_PULL_MODEL_STORAGE_KEY, modelId);
    } else {
      sessionStorage.removeItem(ACTIVE_PULL_MODEL_STORAGE_KEY);
    }
  };

  const getActiveOllamaBaseUrl = () => baseUrlInput.value.trim() || getStoredBaseUrl('ollama');

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
    isCatalogActionPending = disabled;
    renderModelCatalog();
  };

  const syncInstalledOllamaModels = (models = []) => {
    ollamaInstalledModelIds = new Set(models.map((model) => model.id));
    ollamaStatusResolved = true;
  };

  const upsertModelOption = (modelId) => {
    if (!allModels.some((model) => model.id === modelId)) {
      allModels.push({ id: modelId, name: modelId });
    }
  };

  const applySelectedLlmModel = async (selectedModel, options = {}) => {
    const provider = options.provider || providerSelect.value;
    const isOllama = provider === 'ollama';
    const modelToSave = (selectedModel || '').trim();

    if (!provider) {
      throw new Error(t('appSettings.selectDefaultProvider'));
    }

    if (isOllama && !modelToSave) {
      throw new Error(t('appSettings.selectOllamaModelFirst'));
    }

    await saveSettingOrThrow('llm.provider', provider);
    await saveSettingOrThrow('llm.model', modelToSave);

    if (isOllama) {
      const nextOllamaUrl = baseUrlInput.value.trim() || getStoredBaseUrl('ollama');
      await saveSettingOrThrow('ollama.baseUrl', nextOllamaUrl);
      currentSettings['ollama.baseUrl'] = nextOllamaUrl;
    } else if (provider === 'openai') {
      const nextOpenAiUrl = baseUrlInput.value.trim();
      await saveSettingOrThrow('openai.baseUrl', nextOpenAiUrl);
      currentSettings['openai.baseUrl'] = nextOpenAiUrl;
    }

    currentSettings['llm.provider'] = provider;
    currentSettings['llm.model'] = modelToSave;
    providerSelect.value = provider;
    modelInput.value = modelToSave;
    modelValue.value = modelToSave;
  };

  const handleUseOllamaModel = async (modelId) => {
    upsertModelOption(modelId);
    modelInput.value = modelId;
    modelValue.value = modelId;
    llmCombobox.render('');

    try {
      await applySelectedLlmModel(modelId, { provider: 'ollama' });
      const notificationMessage = t('appSettings.activeModelNotification', {
        provider: t('appSettings.ollamaProvider'),
        model: modelId,
      });
      notifyModelChange(notificationMessage);
    } catch (err) {
      console.error(err);
      notifyModelChange(err.message || t('appSettings.settingsSaveFailed'), 'error');
    }
  };

  const updateCatalogSummary = () => {
    if (!ollamaStatusResolved) {
      modelCatalogSummary.textContent = t('appSettings.modelCatalogSummary');
      return;
    }

    const installedCount = ollamaInstalledModelIds.size;
    modelCatalogSummary.textContent =
      installedCount > 0 ? t('appSettings.modelCatalogInstalledSummary', { count: installedCount }) : t('appSettings.noInstalledOllamaModels');
  };

  const renderModelCatalog = () => {
    modelCatalogList.innerHTML = '';
    updateCatalogSummary();

    if (ollamaModelCatalog.length === 0) {
      modelCatalogList.innerHTML = `<div class="text-muted">${t('appSettings.modelCatalogLoadFailed')}</div>`;
      return;
    }

    ollamaModelCatalog.forEach((model) => {
      const installed = ollamaInstalledModelIds.has(model.id);
      const badgeText = installed
        ? t('appSettings.modelStatusInstalled')
        : ollamaStatusResolved
          ? t('appSettings.modelStatusAvailable')
          : t('appSettings.modelStatusUnknown');
      const hardwareRequirements = model.hardwareRequirements || {};
      const hardwareItems = [
        hardwareRequirements.ram ? `<li><strong>${t('appSettings.hardwareRamLabel')}</strong> ${hardwareRequirements.ram}</li>` : '',
        hardwareRequirements.cpu ? `<li><strong>${t('appSettings.hardwareCpuLabel')}</strong> ${hardwareRequirements.cpu}</li>` : '',
        hardwareRequirements.gpu ? `<li><strong>${t('appSettings.hardwareGpuLabel')}</strong> ${hardwareRequirements.gpu}</li>` : '',
      ]
        .filter(Boolean)
        .join('');
      const metaItems = [
        `<span>${model.id}</span>`,
        `<span>${model.sizeLabel}</span>`,
        model.parameterSize ? `<span>${t('appSettings.parameterSizeLabel')} ${model.parameterSize}</span>` : '',
        model.contextWindow ? `<span>${t('appSettings.contextWindowLabel')} ${model.contextWindow}</span>` : '',
      ]
        .filter(Boolean)
        .join('');

      const card = document.createElement('div');
      card.className = 'ollama-model-card';
      card.innerHTML = `
        <div class="ollama-model-header">
          <div>
            <h3 class="ollama-model-title">${model.label}</h3>
            <div class="ollama-model-meta">${metaItems}</div>
          </div>
          <span class="ollama-model-badge ${installed ? 'is-installed' : 'is-available'}">${badgeText}</span>
        </div>
        <p class="ollama-model-description">${model.description}</p>
        ${
          hardwareItems
            ? `
          <div class="ollama-model-hardware">
            <div class="ollama-model-hardware-title">${t('appSettings.hardwareRequirementsTitle')}</div>
            <ul class="ollama-model-hardware-list">
              ${hardwareItems}
            </ul>
          </div>
        `
            : ''
        }
        <div class="ollama-model-actions"></div>
      `;

      const actions = card.querySelector('.ollama-model-actions');

      if (installed) {
        const useButton = document.createElement('button');
        useButton.type = 'button';
        useButton.className = 'btn-secondary btn-sm';
        useButton.textContent = t('appSettings.useModelBtn');
        useButton.disabled = isCatalogActionPending;
        useButton.addEventListener('click', () => handleUseOllamaModel(model.id));
        actions.appendChild(useButton);

        const uninstallButton = document.createElement('button');
        uninstallButton.type = 'button';
        uninstallButton.className = 'btn-danger btn-sm';
        uninstallButton.textContent = t('appSettings.uninstallModelBtn');
        uninstallButton.disabled = isCatalogActionPending;
        uninstallButton.addEventListener('click', () => uninstallOllamaModel(model.id));
        actions.appendChild(uninstallButton);
      } else {
        const downloadButton = document.createElement('button');
        downloadButton.type = 'button';
        const isActiveDownload = isCatalogActionPending && activePullModelId === model.id;
        downloadButton.className = `btn-primary btn-sm${isActiveDownload ? ' is-loading' : ''}`;
        downloadButton.textContent = isActiveDownload ? t('appSettings.modelPullInProgress') : t('appSettings.downloadInstallBtn');
        downloadButton.disabled = isCatalogActionPending;
        downloadButton.setAttribute('aria-disabled', String(isCatalogActionPending));
        if (isActiveDownload) {
          downloadButton.setAttribute('aria-busy', 'true');
        }
        downloadButton.addEventListener('click', () => downloadOllamaModel(model.id));
        actions.appendChild(downloadButton);
      }

      modelCatalogList.appendChild(card);
    });
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

    if (
      currentSettings['llm.provider'] === providerSelect.value &&
      currentSettings['llm.model'] &&
      (providerSelect.value !== 'ollama' || ollamaInstalledModelIds.has(currentSettings['llm.model']))
    ) {
      allModels.push({ id: currentSettings['llm.model'], name: currentSettings['llm.model'] });
      modelInput.value = currentSettings['llm.model'];
      modelValue.value = currentSettings['llm.model'];
    }
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

  const loadModels = async (type = 'llm', triggerButton = null) => {
    const isLlm = type === 'llm';
    const provider = isLlm ? providerSelect.value : transcriptionProviderSelect.value;
    const btn = triggerButton || (isLlm ? loadModelsBtn : loadTranscriptionModelsBtn);
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
          if (provider === 'ollama') {
            syncInstalledOllamaModels(allModels);
            if (
              currentSettings['llm.provider'] === 'ollama' &&
              currentSettings['llm.model'] &&
              ollamaInstalledModelIds.has(currentSettings['llm.model']) &&
              !modelValue.value
            ) {
              modelInput.value = currentSettings['llm.model'];
              modelValue.value = currentSettings['llm.model'];
            }
            renderModelCatalog();
          }
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
        if (isLlm && provider === 'ollama') {
          allModels = [];
          syncInstalledOllamaModels([]);
          renderModelCatalog();
          llmCombobox.render('');
          showMessage('success', t('appSettings.noInstalledOllamaModels'));
        } else {
          showMessage('error', t('appSettings.noModelsForProvider'));
        }
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
        setActivePullModelId(null);
        setModelPullControlsDisabled(false);
        await loadModels('llm');
        return;
      }

      if (data.status === 'failed') {
        modelDownloadStatus.textContent = data.error || t('appSettings.modelPullFailed');
        modelDownloadProgressBar.classList.add('is-error');
        setActivePullJobId(null);
        setActivePullModelId(null);
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
      setActivePullModelId(null);
      setModelPullControlsDisabled(false);
    }
  };

  const startModelPullPolling = (jobId, modelId = activePullModelId) => {
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
    setActivePullModelId(modelId);
    setModelPullControlsDisabled(true);
    pollModelPullJob(jobId);
  };

  const downloadOllamaModel = async (modelId) => {
    try {
      setModelPullControlsDisabled(true);
      modelDownloadStatus.textContent = t('appSettings.modelPullStarting');
      downloadProgressContainer.classList.remove('hidden');

      const res = await fetch('/api/settings/llm/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: modelId, baseUrl: getActiveOllamaBaseUrl() }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('appSettings.modelPullFailed'));
      }

      startModelPullPolling(data.jobId, modelId);
    } catch (err) {
      console.error(err);
      modelDownloadStatus.textContent = err.message || t('appSettings.modelPullFailed');
      modelDownloadProgressBar.classList.add('is-error');
      setActivePullModelId(null);
      setModelPullControlsDisabled(false);
    }
  };

  const uninstallOllamaModel = async (modelId) => {
    if (!(await showConfirmModal(t('appSettings.uninstallModelConfirm', { model: modelId })))) {
      return;
    }

    try {
      setModelPullControlsDisabled(true);
      const res = await fetch('/api/settings/llm/model', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: modelId, baseUrl: getActiveOllamaBaseUrl() }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('appSettings.uninstallModelFailed'));
      }

      allModels = Array.isArray(data.installedModels) ? data.installedModels.map((model) => ({ id: model.id, name: model.name || model.id })) : [];
      syncInstalledOllamaModels(allModels);
      renderModelCatalog();
      llmCombobox.render('');

      if (modelValue.value === modelId) {
        modelInput.value = '';
        modelValue.value = '';
      }

      showMessage('success', t('appSettings.uninstallModelSuccess', { model: modelId }));
    } catch (err) {
      console.error(err);
      showMessage('error', err.message || t('appSettings.uninstallModelFailed'));
    } finally {
      setModelPullControlsDisabled(false);
    }
  };

  loadModelsBtn.addEventListener('click', () => loadModels('llm', loadModelsBtn));
  checkModelStatusBtn?.addEventListener('click', () => loadModels('llm', checkModelStatusBtn));
  loadTranscriptionModelsBtn.addEventListener('click', () => loadModels('transcription'));

  providerSelect.addEventListener('change', () => {
    restoreModelForProvider();
    updateBaseUrlUi();
    updateModelManagerVisibility();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    saveBtn.disabled = true;
    saveBtn.textContent = t('appSettings.saving');

    try {
      const selectedModel = (modelValue.value || modelInput.value || '').trim();
      await applySelectedLlmModel(selectedModel);
      notifyModelChange(
        t('appSettings.activeModelNotification', {
          provider: providerSelect.options[providerSelect.selectedIndex]?.textContent || providerSelect.value,
          model: selectedModel,
        }),
      );
    } catch (err) {
      console.error(err);
      notifyModelChange(err.message || t('appSettings.settingsSaveFailed'), 'error');
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
      await saveSettingOrThrow('transcription.provider', transcriptionProviderSelect.value);
      await saveSettingOrThrow('transcription.model', (transcriptionModelValue.value || transcriptionModelInput.value).trim());
      await saveSettingOrThrow('transcription.maxFileSizeMB', transcriptionMaxFileSizeInput.value.trim());

      notifyModelChange(
        t('appSettings.activeTranscriptionModelNotification', {
          provider: transcriptionProviderSelect.options[transcriptionProviderSelect.selectedIndex]?.textContent || transcriptionProviderSelect.value,
          model: (transcriptionModelValue.value || transcriptionModelInput.value).trim(),
        }),
      );
    } catch (err) {
      console.error(err);
      notifyModelChange(t('appSettings.settingsSaveFailed'), 'error');
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

    const settingsRes = await fetch('/api/settings');
    if (!settingsRes.ok) {
      throw new Error(t('appSettings.loadSettingsFailed'));
    }

    currentSettings = await settingsRes.json();
    try {
      await loadCatalog();
    } catch (catalogError) {
      console.error(catalogError);
      showMessage('error', catalogError.message || t('appSettings.modelCatalogLoadFailed'));
    }

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
      startModelPullPolling(activePullJobId, activePullModelId);
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
