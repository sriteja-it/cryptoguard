// Very small risk engine - maps cert info to a simple risk profile

function pqcAlgosSome(algo, sigAlgo) {
  const pqcAlgos = ['KYBER', 'DILITHIUM', 'FALCON', 'SABER', 'SPHINCS', 'NEWHOPE', 'PQC'];
  return pqcAlgos.some((a) => (algo || '').includes(a) || (sigAlgo || '').includes(a));
}

function analyze(cert) {
  const algo = (cert.publicKeyType || '').toUpperCase();
  const keySize = cert.keySize || cert.publicKeySize || 0;
  const tls = (cert.tlsVersion || '').toUpperCase();
  const sigAlgo = (cert.signatureAlgorithm || '').toUpperCase();

  const reasons = [];
  const recommendations = [];

  // Allow runtime tuning via env vars for testing/ops
  const weights = {
    quantum: parseFloat(process.env.RISK_WEIGHT_QUANTUM) || 0.60,
    classical: parseFloat(process.env.RISK_WEIGHT_CLASSICAL) || 0.25,
    tls: parseFloat(process.env.RISK_WEIGHT_TLS) || 0.10,
    expiry: parseFloat(process.env.RISK_WEIGHT_EXPIRY) || 0.05,
  };

  const thresholds = {
    CRITICAL: parseInt(process.env.RISK_THRESHOLD_CRITICAL) || 90,
    HIGH: parseInt(process.env.RISK_THRESHOLD_HIGH) || 60,
    MEDIUM: parseInt(process.env.RISK_THRESHOLD_MEDIUM) || 40,
  };

  // Classical strength score (0-100) where 100 = very strong for classical security
  function classicalStrength() {
    if (algo.includes('RSA')) {
      if (!keySize) return 60;
      if (keySize >= 8192) return 99;
      if (keySize >= 4096) return 95;
      if (keySize >= 3072) return 80;
      if (keySize >= 2048) return 60;
      return 30;
    }

    if (algo.includes('ECC') || algo.includes('ECDSA')) {
      if (keySize >= 521) return 99;
      if (keySize >= 384) return 95;
      if (keySize >= 256) return 88;
      return 70;
    }

    if (algo.includes('ED25519') || algo.includes('ED448') || algo.includes('ED')) return 95;
    if (algo.includes('DSA')) return 50;
    if (pqcAlgosSome(algo, sigAlgo)) return 70;
    return 70;
  }

  // Quantum migration urgency (0-100)
  function quantumUrgency() {
    if (pqcAlgosSome(algo, sigAlgo)) {
      reasons.push('PQC-capable or hybrid algorithm detected');
      return 5; // very low urgency
    }

    if (algo.includes('RSA')) {
      if (!keySize) return 95;
      if (keySize >= 8192) return 40;
      if (keySize >= 4096) return 55;
      if (keySize >= 3072) return 80;
      if (keySize >= 2048) return 95;
      return 98;
    }

    if (algo.includes('ECC') || algo.includes('ECDSA')) {
      if (!keySize) return 88;
      if (keySize >= 521) return 70;
      if (keySize >= 384) return 76;
      if (keySize >= 256) return 82;
      return 90;
    }

    if (algo.includes('ED25519') || algo.includes('ED448') || algo.includes('ED')) return 82;
    if (algo.includes('DSA')) return 95;
    return 50;
  }

  function tlsPenaltyScore() {
    if (!tls) return 0;
    if (tls.includes('1.0') || tls.includes('1.1') || tls.includes('SSL')) {
      reasons.push('Very old TLS/SSL version');
      return 100;
    }
    if (tls.includes('1.2')) return 10;
    if (tls.includes('1.3')) return 0;
    return 20;
  }

  function expiryPenaltyScore() {
    if (!cert.notAfter) return 0;
    try {
      const notAfter = new Date(cert.notAfter);
      const now = new Date();
      const days = Math.max(0, Math.ceil((notAfter - now) / (1000 * 60 * 60 * 24)));
      if (days <= 30) return 20;
      if (days <= 90) return 10;
      return 0;
    } catch (e) {
      return 0;
    }
  }

  const classicalScore = classicalStrength();
  const quantumScore = quantumUrgency();
  const tlsPenalty = tlsPenaltyScore();
  const expiryPenalty = expiryPenaltyScore();

  // Hash/signature nudges
  if (sigAlgo.includes('SHA1')) reasons.push('Weak signature hash (SHA-1)');
  if (sigAlgo.includes('MD5')) reasons.push('Weak signature hash (MD5)');

  // Recommendations
  if (quantumScore > 80) {
    if (algo.includes('RSA')) recommendations.push('Migrate to CRYSTALS-Kyber (hybrid recommended)');
    else if (algo.includes('ECC') || algo.includes('ECDSA') || algo.includes('ED')) recommendations.push('Consider hybrid PQC (Kyber + Dilithium)');
    else recommendations.push('Consider migration to PQC algorithms');
  } else if (quantumScore > 50) {
    recommendations.push('Plan migration to PQC/hybrid solutions');
  } else {
    recommendations.push('PQC adoption recommended when convenient; low urgency');
  }

  const classicalGap = 100 - classicalScore;
  let vulnerabilityScore = Math.round(
    quantumScore * weights.quantum +
    classicalGap * weights.classical +
    tlsPenalty * weights.tls +
    expiryPenalty * weights.expiry
  );
  vulnerabilityScore = Math.max(0, Math.min(100, vulnerabilityScore));

  if (process.env.DEBUG_RISK === '1' || process.env.NODE_ENV !== 'production') {
    try {
      console.debug('[riskEngine] analyze breakdown', {
        algo,
        keySize,
        tls,
        sigAlgo,
        classicalScore,
        quantumScore,
        tlsPenalty,
        expiryPenalty,
        vulnerabilityScore,
        thresholds,
        weights,
      });
    } catch (e) {}
  }

  let riskLevel = 'LOW';
  if (vulnerabilityScore >= thresholds.CRITICAL) riskLevel = 'CRITICAL';
  else if (vulnerabilityScore >= thresholds.HIGH) riskLevel = 'HIGH';
  else if (vulnerabilityScore >= thresholds.MEDIUM) riskLevel = 'MEDIUM';

  return {
    riskLevel,
    quantumVulnerable: quantumScore > 10 && !pqcAlgosSome(algo, sigAlgo),
    reasons,
    recommendations,
    vulnerabilityScore,
    breakdown: {
      classicalScore,
      quantumScore,
      tlsPenalty,
      expiryPenalty,
    },
  };
}

module.exports = { analyze };
