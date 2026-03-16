const normalizeOllamaModelId = (value) => {
  const trimmed = String(value || '').trim();

  if (trimmed === '') {
    return '';
  }

  return trimmed.replace(/:latest$/i, '');
};

module.exports = {
  normalizeOllamaModelId,
};
