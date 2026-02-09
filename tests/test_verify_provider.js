const http = require('http');
const db = require('../src/services/db');
const authService = require('../src/services/authService');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const BASE_URL = 'http://localhost:3000'; // Assuming running on 3000 based on .env
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

// 1. Create Temp Admin
const tempAdminId = uuidv4();
const tempEmail = `test-admin-${Date.now()}@example.com`;

console.log('Creating temp admin user...', tempEmail);
// Manually insert to ensure 'admin' role regardless of other users
db.prepare('INSERT INTO users (id, name, email, password_hash, created_at, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    tempAdminId,
    'Temp Admin',
    tempEmail,
    'hash',
    new Date().toISOString(),
    'admin',
    'active'
);

// 2. Generate Token
const token = jwt.sign(
    { id: tempAdminId, email: tempEmail, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
);
console.log('Token generated.');

const request = (path, method = 'GET', body = null) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
};

const runTest = async () => {
    try {
        console.log('Testing /api/settings/verify-provider with invalid key (expecting failure or specific handling)...');
        // We use a fake key, OpenAI should reject it.
        const res = await request('/api/settings/verify-provider', 'POST', {
            provider: 'openai',
            apiKey: 'sk-invalid-key-for-testing'
        });

        console.log('Status:', res.status);
        console.log('Body:', JSON.stringify(res.body, null, 2));

        if (res.status === 500 && res.body.error && (res.body.error.includes('401') || res.body.error.includes('Incorrect API key'))) {
            console.log('✅ Correctly failed with invalid key (OpenAI rejected it)');
        } else if (res.status === 200) {
            console.warn('⚠️ Unexpected success with invalid key?');
        } else {
            console.log('ℹ️ Request failed as expected (or network issue)');
        }

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        console.log('Cleaning up temp admin...');
        db.prepare('DELETE FROM users WHERE id = ?').run(tempAdminId);
        console.log('Done.');
    }
};

runTest();
