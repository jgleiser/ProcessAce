/* global DOMPurify, marked */
(function attachSafeMarkdownRenderer(globalScope) {
  const escapeHtml = (value) =>
    String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  const createMarkedRenderer = () => {
    if (typeof marked === 'undefined' || typeof marked.Renderer !== 'function') {
      return null;
    }

    const renderer = new marked.Renderer();
    // Rendering raw HTML from markdown is blocked to reduce scriptable surface area before sanitization.
    renderer.html = () => '';
    return renderer;
  };

  const markedRenderer = createMarkedRenderer();

  const parseMarkdown = (markdownText) => {
    if (typeof marked === 'undefined' || typeof marked.parse !== 'function') {
      return escapeHtml(markdownText);
    }

    return marked.parse(markdownText, {
      breaks: false,
      gfm: true,
      renderer: markedRenderer || undefined,
    });
  };

  globalScope.renderSafeMarkdown = (markdownText) => {
    const normalizedMarkdown = typeof markdownText === 'string' ? markdownText : String(markdownText || '');
    const rawHtml = parseMarkdown(normalizedMarkdown);

    if (typeof DOMPurify === 'undefined' || typeof DOMPurify.sanitize !== 'function') {
      return escapeHtml(normalizedMarkdown);
    }

    return DOMPurify.sanitize(rawHtml, {
      FORBID_ATTR: ['style'],
      FORBID_TAGS: ['embed', 'form', 'iframe', 'object', 'script', 'style'],
      USE_PROFILES: {
        html: true,
      },
    });
  };
})(globalThis);
