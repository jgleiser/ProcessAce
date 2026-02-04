const app = require('../src/app');
const http = require('http');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { processEvidence } = require('../src/workers/evidenceWorker');

// Register the worker manually for the test instance of the app, 
// similar to index.js
const evidenceRoutes = require('../src/api/evidence');
if (evidenceRoutes.queue) {
    evidenceRoutes.queue.registerWorker('process_evidence', processEvidence);
}

const PORT = 3002;
const TEST_FILE_PATH = path.join(__dirname, 'test_upload.txt');

// Create a dummy file
fs.writeFileSync(TEST_FILE_PATH, 'This is a test evidence file content.');

const server = app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);

    const form = new FormData();
    form.append('file', fs.createReadStream(TEST_FILE_PATH));

    const options = {
        hostname: 'localhost',
        port: PORT,
        path: '/api/evidence/upload',
        method: 'POST',
        headers: form.getHeaders(),
    };

    const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            console.log('Response status:', res.statusCode);
            console.log('Response body:', data);

            const body = JSON.parse(data);
            if (res.statusCode === 202 && body.jobId) {
                console.log('UPLOAD ACCEPTED');
                console.log('Waiting for worker simulation...');

                // Wait 3 seconds to let worker finish (it sleeps 2s)
                setTimeout(() => {
                    console.log('Test complete. Check logs for worker output.');
                    server.close();
                    fs.unlinkSync(TEST_FILE_PATH);
                    process.exit(0);
                }, 3000);

            } else {
                console.error('TEST FAILED');
                server.close();
                process.exit(1);
            }
        });
    });

    form.pipe(req);

    req.on('error', (e) => {
        console.error(`TEST FAILED: ${e.message}`);
        server.close();
        process.exit(1);
    });
});
