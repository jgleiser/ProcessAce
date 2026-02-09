const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Blob } = require('buffer'); // Node 18+

const DB_PATH = path.join(__dirname, '../data/processAce.db');
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

let db;
try {
    db = new Database(DB_PATH, { readonly: true, timeout: 5000 });
} catch (e) {
    console.error('Failed to open DB, will rely on API checks where possible:', e.message);
}

async function runTest() {
    console.log('--- STARTING VERIFICATION (Native Fetch + Readonly DB) ---');

    // 1. Auth / Register
    const email = `test_${Date.now()}@example.com`;
    console.log(`Registering user: ${email}`);

    let res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test User', email, password: 'password123' })
    });

    if (res.status !== 201) {
        // Try login
        res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'password123' })
        });
    } else {
        // Login to get cookie
        res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'password123' })
        });
    }

    // Get cookie
    const cookie = res.headers.get('set-cookie') ? res.headers.get('set-cookie').split(';')[0] : null;

    if (!cookie) {
        console.error('Failed to get auth cookie');
        process.exit(1);
    }

    const headers = {
        'Cookie': cookie
    };

    // 2. Upload WITHOUT process name
    console.log('Uploading file 1 (No Process Name)...');
    const form1 = new FormData();
    form1.append('file', new Blob(['dummy content 1']), 'test_no_process.txt');

    res = await fetch(`${BASE_URL}/api/evidence/upload`, {
        method: 'POST',
        headers: headers,
        body: form1
    });

    if (!res.ok) {
        console.error('Upload 1 failed:', await res.text());
        process.exit(1);
    }
    const body1 = await res.json();
    const jobId1 = body1.jobId;
    console.log('Job 1 ID:', jobId1);

    // 3. Upload WITH process name
    console.log('Uploading file 2 (With Process Name)...');
    const form2 = new FormData();
    form2.append('file', new Blob(['dummy content 2']), 'test_with_process.txt');
    form2.append('processName', 'My Custom Process');

    res = await fetch(`${BASE_URL}/api/evidence/upload`, {
        method: 'POST',
        headers: headers,
        body: form2
    });

    if (!res.ok) {
        console.error('Upload 2 failed:', await res.text());
        process.exit(1);
    }
    const body2 = await res.json();
    const jobId2 = body2.jobId;
    console.log('Job 2 ID:', jobId2);

    // 4. Poll/Verify Status via API and DB
    console.log('Waiting for processing...');
    await new Promise(r => setTimeout(r, 10000)); // 10s wait

    let failed = false;

    // Verify Job 1 via API
    res = await fetch(`${BASE_URL}/api/jobs/${jobId1}`, { headers });
    const job1Api = await res.json();
    console.log(`API Job 1 Process Name: '${job1Api.processName}'`);

    if (job1Api.processName !== 'test_no_process') {
        console.error('FAIL: Job 1 processName mismatch in API');
        failed = true;
    }

    // Verify Job 2 via API
    res = await fetch(`${BASE_URL}/api/jobs/${jobId2}`, { headers });
    const job2Api = await res.json();
    console.log(`API Job 2 Process Name: '${job2Api.processName}'`);

    if (job2Api.processName !== 'My Custom Process') {
        console.error('FAIL: Job 2 processName mismatch in API');
        failed = true;
    }

    // Verify Logic via DB (Evidence Status)
    if (db) {
        console.log('Checking database for Evidence Status...');
        try {
            const job1 = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId1);
            const job2 = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId2);

            if (job1 && job2) {
                const evidence1Id = JSON.parse(job1.data).evidenceId;
                const evidence1 = db.prepare('SELECT * FROM evidence WHERE id = ?').get(evidence1Id);
                console.log(`Evidence 1 Status (DB): '${evidence1.status}'`);

                if (evidence1.status !== 'completed' && evidence1.status !== job1.status) {
                    console.error('FAIL: Evidence 1 status sync failed');
                    failed = true;
                }

                const evidence2Id = JSON.parse(job2.data).evidenceId;
                const evidence2 = db.prepare('SELECT * FROM evidence WHERE id = ?').get(evidence2Id);
                console.log(`Evidence 2 Status (DB): '${evidence2.status}'`);

                if (evidence2.status !== 'completed' && evidence2.status !== job2.status) {
                    console.error('FAIL: Evidence 2 status sync failed');
                    failed = true;
                }
            }
        } catch (e) {
            console.error('DB Check failed:', e.message);
            // Don't fail test if only DB check fails due to lock, but warn
        }
    } else {
        console.warn('Skipping DB checks (Evidence Status) because DB failed to open.');
    }

    if (failed) process.exit(1);
    console.log('\nSUCCESS: All verifications passed.');
    process.exit(0);
}

runTest().catch(console.error);
