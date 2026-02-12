const app = require('../src/app');
const http = require('http');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { evidenceQueue } = require('../src/services/queueInstance');
const { processEvidence } = require('../src/workers/evidenceWorker');

// Enable Mock LLM
process.env.MOCK_LLM = 'true';

// Register worker
evidenceQueue.registerWorker('process_evidence', processEvidence);

const PORT = 3004;
const TEST_FILE_PATH = path.join(__dirname, 'process.txt');
fs.writeFileSync(TEST_FILE_PATH, 'This is a process description.');

const server = app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);

  // Upload file
  const form = new FormData();
  form.append('file', fs.createReadStream(TEST_FILE_PATH));

  const formReq = http.request(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/evidence/upload',
      method: 'POST',
      headers: form.getHeaders(),
    },
    (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
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
    },
  );
  form.pipe(formReq);
});

function checkJobStatus(jobId) {
  const interval = setInterval(() => {
    http.get(`http://localhost:${PORT}/api/jobs/${jobId}`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const body = JSON.parse(data);
        console.log('Job Status:', body.status);

        if (body.status === 'completed') {
          clearInterval(interval);
          if (body.result.artifactId) {
            console.log('Artifact Generated:', body.result.artifactId);
            downloadArtifact(body.result.artifactId);
          } else {
            console.error('Job completed but no artifactId');
            cleanup(1);
          }
        } else if (body.status === 'failed') {
          clearInterval(interval);
          console.error('Job Failed:', body.error);
          cleanup(1);
        }
      });
    });
  }, 1000);
}

function downloadArtifact(artifactId) {
  http.get(`http://localhost:${PORT}/api/artifacts/${artifactId}/content`, (res) => {
    if (res.statusCode === 200) {
      console.log('TEST PASSED: Artifact downloaded OK');
      cleanup(0);
    } else {
      console.error('Artifact Download Failed', res.statusCode);
      cleanup(1);
    }
  });
}

function cleanup(code) {
  server.close();
  try {
    fs.unlinkSync(TEST_FILE_PATH);
  } catch (e) {}
  process.exit(code);
}
