const http = require('http');

const data = JSON.stringify({ key: 'dev_local_key_please_change' });

const options = {
  hostname: 'localhost',
  port: process.argv[2] || 4008,
  path: '/admin/upgrade',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'x-admin-token': process.env.ADMIN_TOKEN || 'dev_admin_token',
  },
};

// allow overriding key via argv[3]
const overrideKey = process.argv[3];
const bodyData = overrideKey ? JSON.stringify({ key: overrideKey }) : data;
options.headers['Content-Length'] = Buffer.byteLength(bodyData);

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log('HEADERS:', res.headers);
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    console.log('BODY:', body);
  });
});

req.on('error', (e) => {
  console.error('problem with request:', e.message);
});

req.write(bodyData);
req.end();
