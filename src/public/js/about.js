(function () {
  function setCurrentLanguageLabel() {
    const currentLangLabel = document.getElementById('currentLangLabel');
    const langCheckEn = document.getElementById('langCheckEn');
    const langCheckEs = document.getElementById('langCheckEs');
    const currentLang = window.i18n ? window.i18n.currentLang : 'en';

    if (currentLangLabel) {
      currentLangLabel.textContent = currentLang.toUpperCase();
    }

    if (langCheckEn) {
      langCheckEn.classList.toggle('hidden', currentLang !== 'en');
    }

    if (langCheckEs) {
      langCheckEs.classList.toggle('hidden', currentLang !== 'es');
    }
  }

  function setupLanguageSwitcher() {
    const langSwitcherBtn = document.getElementById('langSwitcherBtn');
    const langDropdown = document.getElementById('langDropdown');

    if (!langSwitcherBtn || !langDropdown) {
      return;
    }

    langSwitcherBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      langDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (event) => {
      if (!langSwitcherBtn.contains(event.target) && !langDropdown.contains(event.target)) {
        langDropdown.classList.add('hidden');
      }
    });

    langDropdown.querySelectorAll('.lang-option').forEach((option) => {
      option.addEventListener('click', async () => {
        if (window.i18n) {
          await window.i18n.setLanguage(option.dataset.lang);
        }
        langDropdown.classList.add('hidden');
      });
    });

    setCurrentLanguageLabel();
    document.addEventListener('languageChanged', setCurrentLanguageLabel);
  }

  function applyAppInfo() {
    const appInfo = window.ProcessAceAppInfo;
    if (!appInfo) {
      return;
    }

    document.querySelectorAll('[data-app-version]').forEach((element) => {
      element.textContent = appInfo.versionLabel;
    });

    const linkMap = {
      aboutWebsiteLink: appInfo.websiteUrl,
      aboutWebsiteEsLink: appInfo.websiteEsUrl,
      aboutRepoLink: appInfo.repoUrl,
      aboutChangelogLink: appInfo.changelogUrl,
      aboutLicenseLink: appInfo.licenseUrl,
    };

    Object.entries(linkMap).forEach(([elementId, href]) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.href = href;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.i18n) {
      await window.i18n.init();
    }

    setupLanguageSwitcher();
    applyAppInfo();
    window.renderAppFooter?.();
  });
})();
