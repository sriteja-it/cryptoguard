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

// ─── Admin Auth ───────────────────────────────────────────────────────────────
function validateAdmin(req, res, next) {
  const token =
    req.headers['x-admin-token'] ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const adminToken = process.env.ADMIN_TOKEN || 'dev_admin_token';
  if (!token || token !== adminToken) {
    return res.status(403).json({ error: 'invalid_admin_token' });
  }
  return next();
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateState = new Map();

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();

// Capture raw request body for debugging (keeps JSON parsing)
app.use(
  express.json({
    verify: (req, _res, buf) => {
      try {
        req.rawBody = buf && buf.toString();
      } catch (e) {
        req.rawBody = undefined;
      }
    },
  })
);

// CORS – allow frontend to call the API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://cryptoguard-drab.vercel.app/');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Admin-Token'
  );
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
  const state = rateState.get(bucketKey) || {
    count: 0,
    resetAt: now + RATE_LIMIT_WINDOW_MS,
  };

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
    if (
      candidate === 'python' ||
      candidate === 'python3' ||
      fs.existsSync(candidate)
    ) {
      return candidate;
    }
  }

  return 'python';
}

// ─── API Key Middleware ───────────────────────────────────────────────────────
function validateApiKey(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'missing_authorization' });
  const key = m[1];
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  getApiKeyByHash(hashed)
    .then((entry) => {
      if (!entry) return res.status(403).json({ error: 'invalid_api_key' });
      if (
        entry.expires_at &&
        new Date(entry.expires_at).getTime() <= Date.now()
      ) {
        return res.status(403).json({ error: 'api_key_expired' });
      }
      if (
        entry.quota != null &&
        (entry.usage_count || 0) >= entry.quota
      ) {
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
      if (
        entry.expires_at &&
        new Date(entry.expires_at).getTime() <= Date.now()
      ) {
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
        if (
          entry.expires_at &&
          new Date(entry.expires_at).getTime() <= Date.now()
        )
          return resolve(null);
        resolve(entry);
      })
      .catch(() => resolve(null));
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/scans', async (req, res) => {
  try {
    const entry = await tryValidateApiKey(req);
    const limit = Math.min(parseInt(req.query.limit || '10', 10) || 10, 50);
    const scans = await getRecentScans(limit);
    if (entry) {
      return res.json({
        scans,
        apiKey: {
          id: entry.id,
          usage_count: entry.usage_count ?? 0,
          quota: entry.quota ?? null,
        },
      });
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
    if (!Number.isFinite(scanId))
      return res.status(400).json({ error: 'invalid_scan_id' });

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

app.get('/api/usage', validateApiKey, async (req, res) => {
  try {
    const entry = req.apiKeyEntry;
    return res.json({
      usage_count: entry.usage_count ?? 0,
      quota: entry.quota ?? null,
    });
  } catch (error) {
    console.error('usage_fetch_failed', error);
    return res.status(500).json({ error: 'usage_fetch_failed' });
  }
});

app.post('/api/audit', validateApiKey, applyRateLimit, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'missing_url' });

  const scriptPath = path.join(__dirname, 'python', 'scrape_cert.py');
  const host = url.replace(/^https?:\/\//, '').split('/')[0];
  const pythonBin = resolvePythonExecutable();

  const py = spawn(pythonBin, [scriptPath, host], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
      return res
        .status(502)
        .json({ error: 'ssl_scrape_failed', details: certInfo.error });
    }

    const analysis = riskEngine.analyze(certInfo);

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

    const usageUpdate = await incrementApiKeyUsage(req.apiKeyEntry.id);
    const updatedApiKey = usageUpdate.value || req.apiKeyEntry;

    res.json({
      scan: storedScan,
      analysis,
      usage: {
        count: updatedApiKey.usage_count ?? 0,
        quota: updatedApiKey.quota ?? null,
      },
    });
  });
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────
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

app.post(
  '/admin/create-key',
  validateAdmin,
  express.json(),
  async (req, res) => {
    try {
      const { plain, name, quota } = req.body || {};
      const plaintext =
        plain || `pqc_${crypto.randomBytes(12).toString('hex')}`;
      const hashed = crypto
        .createHash('sha256')
        .update(plaintext)
        .digest('hex');
      const database = await connectMongo();

      let id = Math.floor(Math.random() * 1000000) + 100;
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
      const keyFingerprint = hashed.slice(0, 16);
      const safeDoc = { ...doc };
      delete safeDoc.hashed_key;
      return res.json({ ok: true, apiKey: safeDoc, keyFingerprint });
    } catch (error) {
      console.error('create_key_failed', error);
      return res.status(500).json({ error: 'create_key_failed' });
    }
  }
);

app.post(
  '/admin/set-quota',
  validateAdmin,
  express.json(),
  async (req, res) => {
    try {
      const { keyId, quota } = req.body || {};
      if (quota == null) return res.status(400).json({ error: 'missing_quota' });
      const q = Number(quota);
      if (!Number.isFinite(q) || q < 0)
        return res.status(400).json({ error: 'invalid_quota' });
      if (keyId == null)
        return res.status(400).json({ error: 'missing_keyId' });

      const updated = await setQuotaForApiKeyId(keyId, quota);
      if (!updated)
        return res.status(404).json({ error: 'api_key_not_found' });
      return res.json({ ok: true, apiKey: updated });
    } catch (error) {
      console.error('set_quota_failed', error);
      return res.status(500).json({ error: 'set_quota_failed' });
    }
  }
);

app.get('/admin/keys', validateAdmin, async (req, res) => {
  try {
    const all = await listApiKeys();
    return res.json({ keys: all });
  } catch (error) {
    console.error('list_api_keys_failed', error);
    return res.status(500).json({ error: 'list_api_keys_failed' });
  }
});

app.post(
  '/admin/set-quota-all',
  validateAdmin,
  express.json(),
  async (req, res) => {
    try {
      const { quota } = req.body || {};
      if (quota == null)
        return res.status(400).json({ error: 'missing_quota' });
      const result = await setQuotaForAll(quota);
      return res.json({ ok: true, result });
    } catch (error) {
      console.error('set_quota_all_failed', error);
      return res.status(500).json({
        error: 'set_quota_all_failed',
        details: error.message || String(error),
      });
    }
  }
);

app.post(
  '/admin/revoke-key',
  validateAdmin,
  express.json(),
  async (req, res) => {
    try {
      const { keyId, action } = req.body || {};
      if (keyId == null)
        return res.status(400).json({ error: 'missing_keyId' });
      const result = await revokeApiKeyById(keyId, action);
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error('revoke_key_failed', error);
      return res.status(500).json({ error: 'revoke_key_failed' });
    }
  }
);

// ─── Startup ──────────────────────────────────────────────────────────────────
// FIX 1: Use process.env.PORT directly — Render assigns a fixed port.
//         Never increment or try alternate ports in production.
const PORT = parseInt(process.env.PORT || '4000', 10);

const MAX_RETRIES = 5;

async function start() {
  // FIX 2: Start the HTTP server FIRST so Render detects the open port
  //         immediately, before MongoDB has connected.
  //         Bind to '0.0.0.0' so Render's proxy can reach the process.
  await new Promise((resolve, reject) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Backend running on port ${PORT}`);
      resolve(server);
    });
    server.on('error', (err) => {
      console.error('Failed to bind port:', err.message);
      reject(err);
    });
  });

  // FIX 3: Connect MongoDB after the port is bound.
  //        On failure keep retrying but never kill the process —
  //        Render would restart and lose the bound port.
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    try {
      await connectMongo();
      console.log('MongoDB connected');

      try {
        await setQuotaForAll(5);
        console.log('Applied default quota=5 to all API keys');
      } catch (e) {
        console.warn(
          'Could not apply default quota:',
          e && e.message ? e.message : e
        );
      }

      return; // success — exit the retry loop
    } catch (error) {
      attempt += 1;
      const delay = Math.min(16000, 1000 * Math.pow(2, attempt - 1));
      console.error(
        `MongoDB connection attempt ${attempt} failed:`,
        error.message || error
      );

      if (attempt > MAX_RETRIES) {
        // FIX 4: Log the failure but DO NOT call process.exit(1).
        //        The HTTP server is still running; requests will get
        //        500 errors until the DB recovers, but the process stays alive.
        console.error(
          'Exceeded MongoDB connection retries. Server running without DB.'
        );
        return;
      }

      console.log(`Retrying MongoDB connection in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  await closeMongo();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeMongo();
  process.exit(0);
});

start();