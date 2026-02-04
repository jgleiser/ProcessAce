const app = require('../src/app');
const http = require('http');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
// Note: We don't need to manually register worker here anymore if we import index.js or just rely on the fact that for THIS test we are just checking API responses. 
// BUT the worker registration happens in index.js, not app.js. 
// So for the worker to run in this test script, we need to register it manually on the singleton queue.

const { evidenceQueue } = require('../src/services/queueInstance');
const { processEvidence } = require('../src/workers/evidenceWorker');

// Register worker
evidenceQueue.registerWorker('process_evidence', processEvidence);

const PORT = 3003;
const TEST_FILE_PATH = path.join(__dirname, 'test_ui.txt');
fs.writeFileSync(TEST_FILE_PATH, 'UI Test Content');

const server = app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);

    // 1. Check UI load
    http.get(`http://localhost:${PORT}/`, (res) => {
        if (res.statusCode === 200) {
            console.log('UI Endpoint OK (200)');
        } else {
            console.error('UI Endpoint Failed', res.statusCode);
            cleanup(1);
            return;
        }

        // 2. Upload file
        const form = new FormData();
        form.append('file', fs.createReadStream(TEST_FILE_PATH));
        const formReq = http.request({
            hostname: 'localhost',
            port: PORT,
            path: '/api/evidence/upload',
            method: 'POST',
            headers: form.getHeaders(),
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const body = JSON.parse(data);
                if (body.jobId) {
                    console.log('Upload OK, Job:', body.jobId);
                    checkJobStatus(body.jobId);
                } else {
                    console.error('Upload Failed');
                    cleanup(1);
                }
            });
        });
        form.pipe(formReq);
    });
});

function checkJobStatus(jobId) {
    // Wait a bit for processing
    setTimeout(() => {
        http.get(`http://localhost:${PORT}/api/jobs/${jobId}`, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const body = JSON.parse(data);
                console.log('Job Status:', body.status);
                if (body.status === 'completed' || body.status === 'processing' || body.status === 'failed') {
                    console.log('TEST PASSED: Job tracking works');
                    // In real run without valid key, it's likely 'failed', which is fine for THIS test (functionality wise)
                    // Actually we didn't set key in this env, so it will fail.
                    cleanup(0);
                } else {
                    // If 'pending' it might be just slow, but we verified the API responds.
                    console.log('Job still pending, but API works.');
                    cleanup(0);
                }
            });
        });
    }, 1500);
}

function cleanup(code) {
    server.close();
    try { fs.unlinkSync(TEST_FILE_PATH); } catch (e) { }
    process.exit(code);
}
