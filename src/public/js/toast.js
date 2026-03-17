const DEFAULT_NOTIFICATION_CONFIG = Object.freeze({
  durationMs: 3000,
  exitDurationMs: 300,
});

window.APP_NOTIFICATION_CONFIG = {
  ...DEFAULT_NOTIFICATION_CONFIG,
  ...(window.APP_NOTIFICATION_CONFIG || {}),
};

function getToastContainer() {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function createDismissButton(onDismiss) {
  const button = document.createElement('button');
  const t = window.i18n ? window.i18n.t.bind(window.i18n) : (key) => key;

  button.type = 'button';
  button.className = 'notification-dismiss';
  button.setAttribute('aria-label', t('common.close'));
  button.innerHTML = '&times;';
  button.addEventListener('click', onDismiss);
  return button;
}

/**
 * Show toast notification
 * @param {string} message
 * @param {string} type 'success' | 'error' | 'info'
 * @param {object} options
 */
/* eslint-disable no-unused-vars */
function showToast(message, type = 'success', options = {}) {
  const config = {
    ...window.APP_NOTIFICATION_CONFIG,
    ...options,
  };
  const container = getToastContainer();
  const toast = document.createElement('div');
  const body = document.createElement('div');
  const icon = document.createElement('span');
  let dismissTimeout = null;

  const removeToast = () => {
    if (!toast.isConnected) {
      return;
    }

    if (dismissTimeout) {
      clearTimeout(dismissTimeout);
      dismissTimeout = null;
    }

    toast.classList.add('is-leaving');
    setTimeout(() => {
      if (toast.isConnected) {
        toast.remove();
      }
      if (!container.children.length) {
        container.remove();
      }
    }, config.exitDurationMs);
  };

  toast.className = `toast ${type}`;
  body.className = 'toast-body';

  if (type === 'success') {
    icon.textContent = '✓';
  } else if (type === 'error') {
    icon.textContent = '!';
  } else {
    icon.textContent = 'i';
  }

  icon.className = 'toast-icon';
  body.append(icon, document.createTextNode(message));
  toast.append(body, createDismissButton(removeToast));
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  if (config.durationMs > 0) {
    dismissTimeout = setTimeout(removeToast, config.durationMs);
  }

  return toast;
}
