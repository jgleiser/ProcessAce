const { describe, it } = require('node:test');
const assert = require('node:assert');

const { sanitizeFilename } = require('../../src/utils/sanitizeFilename');

describe('sanitizeFilename', () => {
  it('removes quotes and ASCII control characters', () => {
    const filename = sanitizeFilename('quarterly"\r\nreport\x00.txt');

    assert.strictEqual(filename, 'quarterlyreport.txt');
  });

  it('returns the fallback when sanitization produces an empty filename', () => {
    const filename = sanitizeFilename('"\r\n\x00', 'evidence-download');

    assert.strictEqual(filename, 'evidence-download');
  });
});
