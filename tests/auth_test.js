const http = require('http');

const BASE_URL = 'http://localhost:3001';
let cookie = null;

const request = (path, method = 'GET', body = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie || '',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.headers['set-cookie']) {
          cookie = res.headers['set-cookie'][0].split(';')[0];
        }
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
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

const runContext = async () => {
  const email = `test-${Date.now()}@example.com`;
  const password = 'password123';

  console.log('1. Registering User...');
  const regRes = await request('/api/auth/register', 'POST', { email, password });
  console.log('Register Status:', regRes.status);
  if (regRes.status !== 201) {
    console.error('Registration Failed:', regRes.body);
    process.exit(1);
  }

  console.log('2. Logging in...');
  const loginRes = await request('/api/auth/login', 'POST', { email, password });
  console.log('Login Status:', loginRes.status);
  if (loginRes.status !== 200) {
    console.error('Login Failed:', loginRes.body);
    process.exit(1);
  }
  console.log('Cookie received:', cookie);

  console.log('3. Accessing /api/auth/me...');
  const meRes = await request('/api/auth/me');
  console.log('Me Status:', meRes.status);
  console.log('Me Body:', meRes.body);
  if (meRes.status !== 200 || meRes.body.email !== email) {
    console.error('Me Check Failed');
    process.exit(1);
  }

  console.log('4. Accessing /api/workspaces...');
  const wsRes = await request('/api/workspaces');
  console.log('Workspaces Status:', wsRes.status);
  console.log('Workspaces:', wsRes.body);
  if (wsRes.status !== 200 || !Array.isArray(wsRes.body)) {
    console.error('Workspaces Check Failed');
    process.exit(1);
  }

  console.log('SUCCESS: Auth flow and Workspaces verified');
};

runContext().catch(console.error);
