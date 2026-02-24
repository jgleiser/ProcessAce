/**
 * i18n – Lightweight internationalization module for ProcessAce
 *
 * Provides:
 *   window.i18n.init()           – detect locale, load translations, translate page
 *   window.i18n.t(key)           – look up a dot-notation key (e.g. 'header.logout')
 *   window.i18n.setLanguage(lang)– switch language, persist, re-translate
 *   window.i18n.translatePage()  – scan DOM for data-i18n* attributes and translate
 *   window.i18n.currentLang      – current active language code
 */
window.i18n = (function () {
  const SUPPORTED_LANGS = ['en', 'es'];
  const FALLBACK_LANG = 'en';
  const COOKIE_NAME = 'processAce_lang';

  let currentLang = FALLBACK_LANG;
  let translations = {};

  // ── Cookie helpers ──────────────────────────────────────────────────
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  function setCookie(name, value) {
    document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Strict`;
  }

  // ── Language detection ──────────────────────────────────────────────
  function detectLanguage() {
    // 1. Saved cookie preference
    const saved = getCookie(COOKIE_NAME);
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved;

    // 2. Browser locale
    const browserLang = (navigator.language || navigator.userLanguage || '')
      .split('-')[0]
      .toLowerCase();
    if (SUPPORTED_LANGS.includes(browserLang)) return browserLang;

    // 3. Fallback
    return FALLBACK_LANG;
  }

  // ── Translation lookup ──────────────────────────────────────────────
  function t(key, replacements) {
    const keys = key.split('.');
    let value = translations;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Key not found – return the key itself as fallback
        return key;
      }
    }

    if (typeof value !== 'string') return key;

    // Simple placeholder replacement: {{name}} → replacements.name
    if (replacements && typeof replacements === 'object') {
      return value.replace(/\{\{(\w+)\}\}/g, (_, k) =>
        k in replacements ? replacements[k] : `{{${k}}}`,
      );
    }
    return value;
  }

  // ── DOM translation ─────────────────────────────────────────────────
  function translatePage() {
    // textContent
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });

    // placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = t(key);
    });

    // title attribute
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.title = t(key);
    });

    // aria-label attribute
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', t(key));
    });

    // Update <html lang>
    document.documentElement.lang = currentLang;
  }

  // ── Load translations ───────────────────────────────────────────────
  async function loadTranslations(lang) {
    try {
      const res = await fetch(`/locales/${lang}.json`);
      if (!res.ok) throw new Error(`Failed to load locale: ${lang}`);
      translations = await res.json();
    } catch (err) {
      console.error(`[i18n] Error loading locale "${lang}":`, err);
      // Fallback to English if Spanish fails
      if (lang !== FALLBACK_LANG) {
        currentLang = FALLBACK_LANG;
        return loadTranslations(FALLBACK_LANG);
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────
  async function setLanguage(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) lang = FALLBACK_LANG;
    currentLang = lang;
    setCookie(COOKIE_NAME, lang);
    await loadTranslations(lang);
    translatePage();

    // Notify other components that the language changed
    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  }

  async function init() {
    currentLang = detectLanguage();
    await loadTranslations(currentLang);
    translatePage();
  }

  return {
    init,
    t,
    setLanguage,
    translatePage,
    get currentLang() {
      return currentLang;
    },
    SUPPORTED_LANGS,
  };
})();
