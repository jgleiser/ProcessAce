const crypto = require('crypto');
const connection = require('../config/redis');

const isTestEnvironment = process.env.NODE_ENV === 'test';
const testRevocations = new Map();
const JTI_PREFIX = 'auth:revoked:';
const LEGACY_PREFIX = 'auth:revoked:legacy:';

const getRemainingTokenTtlSeconds = (exp) => {
  if (!Number.isFinite(exp)) {
    return 0;
  }

  return Math.max(0, exp - Math.floor(Date.now() / 1000));
};

const getLegacyTokenHash = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const getRevocationKey = (decodedToken, rawToken) => {
  if (decodedToken?.jti) {
    return `${JTI_PREFIX}${decodedToken.jti}`;
  }

  if (!rawToken) {
    return null;
  }

  return `${LEGACY_PREFIX}${getLegacyTokenHash(rawToken)}`;
};

const purgeExpiredTestRevocations = () => {
  const now = Date.now();

  for (const [key, expiresAt] of testRevocations.entries()) {
    if (expiresAt <= now) {
      testRevocations.delete(key);
    }
  }
};

const revokeToken = async (decodedToken, rawToken) => {
  const key = getRevocationKey(decodedToken, rawToken);
  const ttlSeconds = getRemainingTokenTtlSeconds(decodedToken?.exp);

  if (!key || ttlSeconds <= 0) {
    return false;
  }

  if (isTestEnvironment) {
    testRevocations.set(key, Date.now() + ttlSeconds * 1000);
    return true;
  }

  await connection.set(key, '1', 'EX', ttlSeconds);
  return true;
};

const isTokenRevoked = async (decodedToken, rawToken) => {
  const key = getRevocationKey(decodedToken, rawToken);
  if (!key) {
    return false;
  }

  if (isTestEnvironment) {
    purgeExpiredTestRevocations();
    return testRevocations.has(key);
  }

  const exists = await connection.exists(key);
  return exists === 1;
};

const resetTokenBlocklistForTests = () => {
  if (isTestEnvironment) {
    testRevocations.clear();
  }
};

module.exports = {
  getRemainingTokenTtlSeconds,
  revokeToken,
  isTokenRevoked,
  __resetForTests: resetTokenBlocklistForTests,
};
