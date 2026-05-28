const http = require('http');

const data = JSON.stringify({ url: 'https://example.com' });
const options = {
  hostname: 'localhost',
  port: process.argv[2] || 4000,
  path: '/api/audit',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Authorization': process.env.API_KEY ? `Bearer ${process.env.API_KEY}` : 'Bearer dev_local_key_please_change',
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
