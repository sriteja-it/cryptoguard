const http = require('http');

const key = process.argv[2];
const port = process.argv[3] || 4000;
if (!key) {
  console.error('Usage: node testAuditWithKey.js <plaintext-key> [port]');
  process.exit(1);
}

const data = JSON.stringify({ url: 'https://example.com' });
const options = {
  hostname: 'localhost',
  port,
  path: '/api/audit',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Authorization': `Bearer ${key}`,
  },
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log('HEADERS:', res.headers);
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => console.log('BODY:', body));
});

req.on('error', (e) => console.error('problem with request:', e.message));

req.write(data);
req.end();
