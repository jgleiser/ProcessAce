(function () {
  const FOOTER_FALLBACKS = {
    'footer.communityVersion': 'ProcessAce Community {{version}}',
    'footer.visitWebsite': 'Visit ProcessAce.com',
    'footer.githubRepo': 'Github Repo',
    'footer.aboutProcessAce': 'About ProcessAce',
  };

  function interpolate(template, replacements) {
    if (!replacements) {
      return template;
    }

    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return key in replacements ? replacements[key] : `{{${key}}}`;
    });
  }

  function translate(key, replacements) {
    if (window.i18n && typeof window.i18n.t === 'function') {
      const translated = window.i18n.t(key, replacements);
      if (translated !== key) {
        return translated;
      }
    }

    const fallback = FOOTER_FALLBACKS[key] || key;
    return interpolate(fallback, replacements);
  }

  function renderFooter() {
    const footerMount = document.getElementById('app-footer');
    const appInfo = window.ProcessAceAppInfo;

    if (!footerMount || !appInfo) {
      return;
    }

    footerMount.innerHTML = `
      <footer class="page-footer" data-testid="app-footer">
        <div class="page-footer-content">
          <span class="page-footer-version">${translate('footer.communityVersion', { version: appInfo.versionLabel })}</span>
          <span class="page-footer-separator" aria-hidden="true">|</span>
          <a class="page-footer-link" href="${appInfo.websiteUrl}" target="_blank" rel="noopener noreferrer">${translate('footer.visitWebsite')}</a>
          <span class="page-footer-separator" aria-hidden="true">|</span>
          <a class="page-footer-link" href="${appInfo.repoUrl}" target="_blank" rel="noopener noreferrer">${translate('footer.githubRepo')}</a>
          <span class="page-footer-separator" aria-hidden="true">|</span>
          <a class="page-footer-link" href="/about.html">${translate('footer.aboutProcessAce')}</a>
        </div>
      </footer>
    `;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFooter, { once: true });
  } else {
    renderFooter();
  }

  document.addEventListener('languageChanged', renderFooter);
  window.renderAppFooter = renderFooter;
})();
