require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const riskEngine = require('./riskEngine');
const {
  connectMongo,
  getApiKeyByHash,
  incrementApiKeyUsage,
  getNextScanId,
  getRecentScans,
  insertScan,
  deleteScanById,
  deleteScansByApiKeyId,
  closeMongo,
  setApiKeyUnlimitedById,
  revokeApiKeyById,
  listApiKeys,
  setQuotaForAll,
  setQuotaForApiKeyId,
} = require('./mongoStore');

function validateAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const adminToken = process.env.ADMIN_TOKEN || 'dev_admin_token';
  if (!token || token !== adminToken) {
    return res.status(403).json({ error: 'invalid_admin_token' });
  }
  return next();
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateState = new Map();

const app = express();
// capture raw request body for debugging (keeps JSON parsing)
app.use(express.json({
  verify: (req, _res, buf) => {
    try {
      req.rawBody = buf && buf.toString();
    } catch (e) {
      req.rawBody = undefined;
    }
  },
}));

// Simple CORS for dev: allow the frontend to call the API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Admin-Token'
  );
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function applyRateLimit(req, res, next) {
  const apiKeyId = req.apiKeyEntry?.id || 'anonymous';
  const clientIp = getClientIp(req);
  const bucketKey = `${apiKeyId}:${clientIp}`;
  const now = Date.now();
  const state = rateState.get(bucketKey) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > state.resetAt) {
    state.count = 0;
    state.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  state.count += 1;
  rateState.set(bucketKey, state);

  if (state.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
    return res.status(429).json({
      error: 'rate_limited',
      retryAfterSeconds: retryAfter,
      limit: RATE_LIMIT_MAX,
      windowSeconds: RATE_LIMIT_WINDOW_MS / 1000,
    });
  }

  next();
}

function resolvePythonExecutable() {
  const candidates = [
    process.env.PYTHON_BIN,
    path.resolve(__dirname, '..', '.venv', 'Scripts', 'python.exe'),
    path.resolve(__dirname, '..', '.venv', 'bin', 'python'),
    'python',
    'python3',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === 'python' || candidate === 'python3' || fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'python';
}

function validateApiKey(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'missing_authorization' });
  const key = m[1];
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  getApiKeyByHash(hashed)
    .then((entry) => {
      if (!entry) return res.status(403).json({ error: 'invalid_api_key' });
      if (entry.expires_at && new Date(entry.expires_at).getTime() <= Date.now()) {
        return res.status(403).json({ error: 'api_key_expired' });
      }
      if (entry.quota != null && (entry.usage_count || 0) >= entry.quota) {
        return res.status(429).json({ error: 'quota_exhausted' });
      }
      req.apiKeyEntry = entry;
      return next();
    })
    .catch((error) => {
      console.error('api_key_lookup_failed', error);
      return res.status(500).json({ error: 'api_key_lookup_failed' });
    });
}

function validateApiKeyWithoutQuota(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'missing_authorization' });
  const key = m[1];
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  getApiKeyByHash(hashed)
    .then((entry) => {
      if (!entry) return res.status(403).json({ error: 'invalid_api_key' });
      if (entry.expires_at && new Date(entry.expires_at).getTime() <= Date.now()) {
        return res.status(403).json({ error: 'api_key_expired' });
      }
      req.apiKeyEntry = entry;
      return next();
    })
    .catch((error) => {
      console.error('api_key_lookup_failed', error);
      return res.status(500).json({ error: 'api_key_lookup_failed' });
    });
}

// Try to validate API key but don't fail the request if missing/invalid.
function tryValidateApiKey(req) {
  return new Promise((resolve) => {
    const auth = req.headers['authorization'] || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return resolve(null);
    const key = m[1];
    const hashed = crypto.createHash('sha256').update(key).digest('hex');
    getApiKeyByHash(hashed)
      .then((entry) => {
        if (!entry) return resolve(null);
        if (entry.expires_at && new Date(entry.expires_at).getTime() <= Date.now()) return resolve(null);
        resolve(entry);
      })
      .catch(() => resolve(null));
  });
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/scans', async (req, res) => {
  try {
    // allow public read-only access to recent scans if API key is missing/expired
    const entry = await tryValidateApiKey(req);
    const limit = Math.min(parseInt(req.query.limit || '10', 10) || 10, 50);
    const scans = await getRecentScans(limit);
    // attach apiKeyInfo when a valid key is present (for UI usage info)
    if (entry) {
      return res.json({ scans, apiKey: { id: entry.id, usage_count: entry.usage_count ?? 0, quota: entry.quota ?? null } });
    }
    return res.json({ scans });
  } catch (error) {
    console.error('scan_history_fetch_failed', error);
    res.status(500).json({ error: 'scan_history_fetch_failed' });
  }
});

app.delete('/api/scans/:id', validateApiKeyWithoutQuota, async (req, res) => {
  try {
    const scanId = Number(req.params.id);
    if (!Number.isFinite(scanId)) return res.status(400).json({ error: 'invalid_scan_id' });

    const result = await deleteScanById(scanId, req.apiKeyEntry.id);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'scan_not_found' });
    }

    return res.json({ ok: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('scan_delete_failed', error);
    return res.status(500).json({ error: 'scan_delete_failed' });
  }
});

app.delete('/api/scans', validateApiKeyWithoutQuota, async (req, res) => {
  try {
    const result = await deleteScansByApiKeyId(req.apiKeyEntry.id);
    return res.json({ ok: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('scan_bulk_delete_failed', error);
    return res.status(500).json({ error: 'scan_bulk_delete_failed' });
  }
});

// Return usage/quota for the authenticated API key
app.get('/api/usage', validateApiKey, async (req, res) => {
  try {
    const entry = req.apiKeyEntry;
    return res.json({ usage_count: entry.usage_count ?? 0, quota: entry.quota ?? null });
  } catch (error) {
    console.error('usage_fetch_failed', error);
    return res.status(500).json({ error: 'usage_fetch_failed' });
  }
});

// POST /api/audit
app.post('/api/audit', validateApiKey, applyRateLimit, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'missing_url' });

  // call python scraper
  const scriptPath = path.join(__dirname, 'python', 'scrape_cert.py');
  const host = url.replace(/^https?:\/\//, '').split('/')[0];
  const pythonBin = resolvePythonExecutable();

  const py = spawn(pythonBin, [scriptPath, host], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  py.stdout.on('data', (d) => (out += d.toString()));
  py.stderr.on('data', (d) => (err += d.toString()));

  py.on('close', async (code) => {
    if (code !== 0) {
      console.error('scrape_cert error', err);
      return res.status(500).json({ error: 'ssl_scrape_failed', details: err });
    }
    let certInfo;
    try {
      certInfo = JSON.parse(out);
    } catch (e) {
      console.error('invalid json from scraper', out);
      return res.status(500).json({ error: 'invalid_scraper_output' });
    }

    if (certInfo.error) {
      return res.status(502).json({ error: 'ssl_scrape_failed', details: certInfo.error });
    }

    const analysis = riskEngine.analyze(certInfo);

    // store scan
    const scanId = await getNextScanId();
    const scan = {
      id: scanId,
      url,
      host,
      scannedAt: new Date().toISOString(),
      certInfo,
      analysis,
      apiKeyId: req.apiKeyEntry.id,
    };
    const storedScan = await insertScan(scan);

    // increment usage
    const usageUpdate = await incrementApiKeyUsage(req.apiKeyEntry.id);
    const updatedApiKey = usageUpdate.value || req.apiKeyEntry;

    res.json({ scan: storedScan, analysis, usage: { count: updatedApiKey.usage_count ?? 0, quota: updatedApiKey.quota ?? null } });
  });
});

const START_PORT = parseInt(process.env.PORT || '4000', 10);
const MAX_TRIES = 11;

function tryListen(startPort, tries) {
  let attempt = 0;
  function listenNext() {
    const p = startPort + attempt;
    const server = app.listen(p, () => console.log(`Backend running on http://localhost:${p}`));
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && attempt < tries - 1) {
        attempt += 1;
        console.warn(`Port ${p} in use, trying ${startPort + attempt}...`);
        setTimeout(listenNext, 200);
      } else {
        console.error('Failed to bind port', err);
        process.exit(1);
      }
    });
  }
  listenNext();
}

// Admin: upgrade API key to unlimited quota
app.post('/admin/upgrade', validateAdmin, express.json(), async (req, res) => {
  try {
    const { keyId } = req.body || {};
    if (keyId == null) return res.status(400).json({ error: 'missing_keyId' });
    const updated = await setApiKeyUnlimitedById(keyId);
    if (!updated) return res.status(404).json({ error: 'api_key_not_found' });
    return res.json({ ok: true, apiKey: updated });
  } catch (error) {
    console.error('admin_upgrade_failed', error);
    return res.status(500).json({ error: 'admin_upgrade_failed' });
  }
});

// Admin: create a new API key (returns plaintext key)
app.post('/admin/create-key', validateAdmin, express.json(), async (req, res) => {
  try {
    const { plain, name, quota } = req.body || {};
    const plaintext = plain || `pqc_${crypto.randomBytes(12).toString('hex')}`;
    const hashed = crypto.createHash('sha256').update(plaintext).digest('hex');
    const database = await connectMongo();

    // generate unique id
    let id = Math.floor(Math.random() * 1000000) + 100;
    // ensure uniqueness
    // eslint-disable-next-line no-await-in-loop
    while (await database.collection('api_keys').findOne({ id })) {
      id = Math.floor(Math.random() * 1000000) + 100;
    }

    const doc = {
      id,
      name: name || 'generated-via-api',
      hashed_key: hashed,
      quota: quota != null ? quota : 5,
      usage_count: 0,
      expires_at: null,
    };

    await database.collection('api_keys').insertOne(doc);
    // Do not return plaintext in API responses. Return key metadata and fingerprint only.
    const keyFingerprint = hashed.slice(0, 16);
    const safeDoc = { ...doc };
    delete safeDoc.hashed_key;
    return res.json({ ok: true, apiKey: safeDoc, keyFingerprint });
  } catch (error) {
    console.error('create_key_failed', error);
    return res.status(500).json({ error: 'create_key_failed' });
  }
});

// Admin: set quota for a key by key ID
app.post('/admin/set-quota', validateAdmin, express.json(), async (req, res) => {
  try {
    const { keyId, quota } = req.body || {};
    if (quota == null) return res.status(400).json({ error: 'missing_quota' });
    const q = Number(quota);
    if (!Number.isFinite(q) || q < 0) return res.status(400).json({ error: 'invalid_quota' });

    if (keyId == null) return res.status(400).json({ error: 'missing_keyId' });

    const updated = await setQuotaForApiKeyId(keyId, quota);
    if (!updated) return res.status(404).json({ error: 'api_key_not_found' });
    return res.json({ ok: true, apiKey: updated });
  } catch (error) {
    console.error('set_quota_failed', error);
    return res.status(500).json({ error: 'set_quota_failed' });
  }
});

// Admin: list all API keys (no hashed_key included)
app.get('/admin/keys', validateAdmin, async (req, res) => {
  try {
    const all = await listApiKeys();
    return res.json({ keys: all });
  } catch (error) {
    console.error('list_api_keys_failed', error);
    return res.status(500).json({ error: 'list_api_keys_failed' });
  }
});

// Admin: set quota for all API keys to a specific value
app.post('/admin/set-quota-all', validateAdmin, express.json(), async (req, res) => {
  try {
    const { quota } = req.body || {};
    if (quota == null) return res.status(400).json({ error: 'missing_quota' });
    const result = await setQuotaForAll(quota);
    return res.json({ ok: true, result });
  } catch (error) {
    console.error('set_quota_all_failed', error);
    return res.status(500).json({ error: 'set_quota_all_failed', details: error.message || String(error) });
  }
});

// Admin: revoke or delete a key by key ID
app.post('/admin/revoke-key', validateAdmin, express.json(), async (req, res) => {
  try {
    const { keyId, action } = req.body || {};
    if (keyId == null) return res.status(400).json({ error: 'missing_keyId' });
    const result = await revokeApiKeyById(keyId, action);
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('revoke_key_failed', error);
    return res.status(500).json({ error: 'revoke_key_failed' });
  }
});

async function start() {
  const MAX_RETRIES = 5;
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    try {
      await connectMongo();
      console.log('MongoDB connected');
      // Ensure all existing keys have a default quota of 5
      try {
        await setQuotaForAll(5);
        console.log('Applied default quota=5 to all API keys');
      } catch (e) {
        console.warn('Could not apply default quota to all keys:', e && e.message ? e.message : e);
      }
      tryListen(START_PORT, MAX_TRIES);
      return;
    } catch (error) {
      attempt += 1;
      const delay = Math.min(16000, 1000 * Math.pow(2, attempt - 1));
      console.error(`MongoDB connection attempt ${attempt} failed:`, error.message || error);
      if (attempt > MAX_RETRIES) {
        console.error('Exceeded MongoDB connection retries. Exiting.');
        process.exit(1);
      }
      console.log(`Retrying MongoDB connection in ${delay}ms...`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

process.on('SIGINT', async () => {
  await closeMongo();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeMongo();
  process.exit(0);
});

start();
