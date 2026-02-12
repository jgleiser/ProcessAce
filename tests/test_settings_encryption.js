const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// 1. Ensure ENCRYPTION_KEY is in .env or add it
const envPath = path.resolve(process.cwd(), '.env');
let envContent = fs.readFileSync(envPath, 'utf8');

if (!envContent.includes('ENCRYPTION_KEY=')) {
  console.log('Adding ENCRYPTION_KEY to .env...');
  const key = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync(envPath, `\nENCRYPTION_KEY="${key}"\n`);
  envContent = fs.readFileSync(envPath, 'utf8'); // Reload
}

// Manually load env for this process (since dotenv might not be used or reload issues)
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    process.env[match[1].trim()] = value;
  }
});

console.log('ENCRYPTION_KEY loaded:', process.env.ENCRYPTION_KEY ? 'Yes' : 'No');

// 2. Require settingsService
const settingsService = require('../src/services/settingsService');

// TEST 1: Encryption/Decryption
console.log('\n--- Test 1: Internal Encrypt/Decrypt ---');
const plain = 'super-secret-key-123';
const encrypted = settingsService.encrypt(plain);
console.log('Plain:', plain);
console.log('Encrypted:', encrypted);
const decrypted = settingsService.decrypt(encrypted);
console.log('Decrypted:', decrypted);

if (plain === decrypted && plain !== encrypted) {
  console.log('✅ Encrypt/Decrypt Assert Passed');
} else {
  console.error('❌ Encrypt/Decrypt Assert Failed');
  process.exit(1);
}

// TEST 2: Update Setting (Mock DB interaction via service)
console.log('\n--- Test 2: Update Setting (Encryption) ---');
const testKey = 'openai.apiKey';
const testValue = 'sk-test-key-encryption';

// Update
settingsService.updateSetting(testKey, testValue);
console.log('Updated setting:', testKey);

// Verify raw value in DB is encrypted
const db = require('../src/services/db');
const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(testKey);
console.log('Raw DB Value:', row.value);

if (row.value === testValue) {
  console.error('❌ Raw DB Value should NOT match plain text value');
  process.exit(1);
} else if (row.value.includes(':')) {
  console.log('✅ Raw DB Value appears encrypted (contains IV separator)');
} else {
  console.warn('⚠️ Raw DB Value format uncertain');
}

// TEST 3: Get Settings (Masking)
console.log('\n--- Test 3: Get Settings (Masking) ---');
const allSettings = settingsService.getSettings();
console.log('Retrieved Value via getSettings:', allSettings[testKey]);

if (allSettings[testKey] === '********') {
  console.log('✅ Value is masked correctly');
} else {
  console.error('❌ Value is NOT masked:', allSettings[testKey]);
  process.exit(1);
}

// TEST 4: Get LLM Config (Decryption)
console.log('\n--- Test 4: Get Encrypted Setting (Decryption) ---');
const decryptedFromDb = settingsService.getEncryptedSetting(testKey);
console.log('Decrypted from DB:', decryptedFromDb);

if (decryptedFromDb === testValue) {
  console.log('✅ Decryption from DB works');
} else {
  console.error('❌ Decryption from DB failed');
  process.exit(1);
}

console.log('\n✅ ALL TESTS PASSED');
