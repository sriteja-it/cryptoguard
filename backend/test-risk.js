const assert = require('assert');
const { analyze } = require('./riskEngine');

function run() {
  const rsa2048 = analyze({ publicKeyType: 'RSA', keySize: 2048, tlsVersion: 'TLS 1.3' });
  const rsa4096 = analyze({ publicKeyType: 'RSA', keySize: 4096, tlsVersion: 'TLS 1.3' });
  const ecc256 = analyze({ publicKeyType: 'ECC', keySize: 256, tlsVersion: 'TLS 1.2' });
  const kyber = analyze({ publicKeyType: 'KYBER', keySize: 0, tlsVersion: 'TLS 1.3' });
  const rsa2048_tls10 = analyze({ publicKeyType: 'RSA', keySize: 2048, tlsVersion: 'TLS 1.0' });

  console.log('rsa2048', rsa2048.vulnerabilityScore, rsa2048.riskLevel);
  console.log('rsa4096', rsa4096.vulnerabilityScore, rsa4096.riskLevel);
  console.log('ecc256', ecc256.vulnerabilityScore, ecc256.riskLevel);
  console.log('kyber', kyber.vulnerabilityScore, kyber.riskLevel);
  console.log('rsa2048_tls1.0', rsa2048_tls10.vulnerabilityScore, rsa2048_tls10.riskLevel);

  // RSA-4096 should be lower risk than RSA-2048
  assert(rsa4096.vulnerabilityScore < rsa2048.vulnerabilityScore, 'RSA-4096 should be lower than RSA-2048');

  // PQC-ready (Kyber) should be very low urgency (lower than RSA-4096)
  assert(kyber.vulnerabilityScore < rsa4096.vulnerabilityScore, 'PQC (Kyber) should be lower than RSA-4096');

  // TLS 1.0 should be worse than TLS 1.3 for same key
  assert(rsa2048_tls10.vulnerabilityScore > rsa2048.vulnerabilityScore, 'TLS 1.0 should be worse than TLS 1.3');

  // ECC-256 should be different from RSA-2048 and generally between RSA-4096 and RSA-2048
  assert(ecc256.vulnerabilityScore < rsa2048.vulnerabilityScore, 'ECC-256 should be lower than RSA-2048');
  assert(ecc256.vulnerabilityScore > rsa4096.vulnerabilityScore, 'ECC-256 should be higher than RSA-4096');

  console.log('All risk assertions passed.');
}

try {
  run();
  process.exit(0);
} catch (err) {
  console.error('Risk assertions failed:', err && err.message);
  process.exit(2);
}
