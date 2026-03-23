const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { marked } = require('marked');

const sanitizerScript = fs.readFileSync(path.resolve(__dirname, '../../src/public/js/utils/markdown-sanitizer.js'), 'utf8');

const buildRenderer = ({ withDomPurify }) => {
  const context = {
    marked,
    globalThis: null,
  };

  if (withDomPurify) {
    context.DOMPurify = {
      sanitize: (html) =>
        html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/\s+on\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
          .replace(/javascript:/gi, ''),
    };
  }

  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(sanitizerScript, context);
  return context.renderSafeMarkdown;
};

describe('markdown-sanitizer utility', () => {
  it('sanitizes markdown render output using the configured sanitizer', () => {
    const renderSafeMarkdown = buildRenderer({ withDomPurify: true });
    const html = renderSafeMarkdown(
      `# Title

<script>alert(1)</script>

[click](javascript:alert(1))

<img src="x" onerror="alert(1)" />`,
    );

    assert.ok(!/<script/i.test(html));
    assert.ok(!/javascript:/i.test(html));
    assert.ok(!/onerror=/i.test(html));
  });

  it('falls back to escaped plaintext when sanitizer is unavailable', () => {
    const renderSafeMarkdown = buildRenderer({ withDomPurify: false });
    const html = renderSafeMarkdown('<script>alert(1)</script> **text**');

    assert.ok(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(html));
    assert.ok(!/<script/i.test(html));
  });

  it('handles non-string inputs safely', () => {
    const renderSafeMarkdown = buildRenderer({ withDomPurify: true });
    const html = renderSafeMarkdown({ foo: 'bar' });

    assert.strictEqual(typeof html, 'string');
    assert.ok(html.length > 0);
  });
});
