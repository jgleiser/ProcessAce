const sanitizeFilename = (name, fallbackName = 'download') => {
  const rawName = typeof name === 'string' ? name : '';
  const sanitized = [...rawName]
    .filter((character) => {
      const charCode = character.charCodeAt(0);
      return character !== '"' && character !== '\r' && character !== '\n' && !(charCode <= 31 || charCode === 127);
    })
    .join('')
    .trim();

  if (!sanitized) {
    return fallbackName;
  }

  return sanitized;
};

module.exports = { sanitizeFilename };
