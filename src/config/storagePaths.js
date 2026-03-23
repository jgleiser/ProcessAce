const path = require('path');

const resolveUploadsDirectory = (env = process.env, cwd = process.cwd()) => path.resolve(cwd, env.UPLOADS_DIR || 'uploads');

const UPLOADS_DIR = resolveUploadsDirectory();

module.exports = {
  resolveUploadsDirectory,
  UPLOADS_DIR,
};
