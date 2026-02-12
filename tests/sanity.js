const app = require('../src/app');
const http = require('http');

const PORT = 3001; // Use a different port for testing

const server = app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);

  const req = http.get(`http://localhost:${PORT}/health`, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('Response status:', res.statusCode);
      console.log('Response body:', data);

      const body = JSON.parse(data);
      if (body.status === 'UP') {
        console.log('TEST PASSED');
        server.close(() => process.exit(0));
      } else {
        console.error('TEST FAILED: Status is not UP');
        server.close(() => process.exit(1));
      }
    });
  });

  req.on('error', (e) => {
    console.error(`TEST FAILED: ${e.message}`);
    server.close(() => process.exit(1));
  });
});
