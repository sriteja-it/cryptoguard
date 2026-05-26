const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const DATA_DIR = path.join(__dirname, 'data');
const API_KEYS_FILE = path.join(DATA_DIR, 'api_keys.json');
const SCANS_FILE = path.join(DATA_DIR, 'scan_history.json');

let client;
let db;

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

async function ensureIndexes(database) {
  await Promise.all([
    database.collection('api_keys').createIndex({ hashed_key: 1 }, { unique: true }),
    database.collection('scan_history').createIndex({ scannedAt: -1 }),
    database.collection('scan_history').createIndex({ apiKeyId: 1, scannedAt: -1 }),
  ]);
}

async function seedLegacyData(database) {
  const apiKeysCollection = database.collection('api_keys');
  const scansCollection = database.collection('scan_history');

  if ((await apiKeysCollection.countDocuments()) === 0) {
    const legacyApiKeys = readJsonFile(API_KEYS_FILE, []);
    if (legacyApiKeys.length > 0) {
      await apiKeysCollection.insertMany(legacyApiKeys);
    }
  }

  if ((await scansCollection.countDocuments()) === 0) {
    const legacyScans = readJsonFile(SCANS_FILE, []);
    if (legacyScans.length > 0) {
      await scansCollection.insertMany(legacyScans);
    }
  }

  if ((await apiKeysCollection.countDocuments()) === 0) {
    const seedKey = 'dev_local_key_please_change';
    const hashed = crypto.createHash('sha256').update(seedKey).digest('hex');
    await apiKeysCollection.insertOne({
      id: 1,
      name: 'local-dev',
      hashed_key: hashed,
      quota: 1000,
      usage_count: 0,
      expires_at: null,
    });
  }
}

async function resetFromLegacyData() {
  const database = await connectMongo();
  await Promise.all([
    database.collection('api_keys').deleteMany({}),
    database.collection('scan_history').deleteMany({}),
  ]);
  await seedLegacyData(database);
}

async function connectMongo() {
  if (db) {
    return db;
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';

  const dbName = process.env.MONGODB_DB_NAME || 'darkmode_pqc';
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  await ensureIndexes(db);
  await seedLegacyData(db);
  return db;
}

async function getApiKeyByHash(hashedKey) {
  const database = await connectMongo();
  return database.collection('api_keys').findOne({ hashed_key: hashedKey });
}

async function incrementApiKeyUsage(apiKeyId) {
  const database = await connectMongo();
  const result = await database.collection('api_keys').findOneAndUpdate(
    { id: apiKeyId },
    { $inc: { usage_count: 1 } },
    { returnDocument: 'after' },
  );
  return result.value ?? result;
}

async function getNextScanId() {
  const database = await connectMongo();
  return (await database.collection('scan_history').countDocuments()) + 1;
}

async function getRecentScans(limit = 10) {
  const database = await connectMongo();
  return database.collection('scan_history')
    .find({}, { sort: { scannedAt: -1 }, limit })
    .toArray();
}

async function insertScan(scan) {
  const database = await connectMongo();
  const result = await database.collection('scan_history').insertOne(scan);
  return { ...scan, _id: result.insertedId };
}

async function deleteScanById(scanId, apiKeyId) {
  const database = await connectMongo();
  const id = Number(scanId);
  if (!Number.isFinite(id)) return { deletedCount: 0, reason: 'invalid_scan_id' };

  const filter = { id };
  if (apiKeyId != null) {
    filter.apiKeyId = apiKeyId;
  }

  const result = await database.collection('scan_history').deleteOne(filter);
  return { deletedCount: result.deletedCount };
}

async function deleteScansByApiKeyId(apiKeyId) {
  const database = await connectMongo();
  const id = Number(apiKeyId);
  if (!Number.isFinite(id)) return { deletedCount: 0, reason: 'invalid_api_key_id' };

  const result = await database.collection('scan_history').deleteMany({ apiKeyId: id });
  return { deletedCount: result.deletedCount };
}

async function closeMongo() {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
  }
}

async function setApiKeyUnlimitedById(apiKeyId) {
  const database = await connectMongo();
  const id = Number(apiKeyId);
  if (!Number.isFinite(id)) throw new Error('invalid_api_key_id');

  const res = await database.collection('api_keys').findOneAndUpdate(
    { id },
    { $set: { quota: null } },
    { returnDocument: 'after' },
  );
  return res.value ?? null;
}

async function revokeApiKeyById(apiKeyId, action = 'expire') {
  const database = await connectMongo();
  const id = Number(apiKeyId);
  if (!Number.isFinite(id)) throw new Error('invalid_api_key_id');

  if (action === 'delete') {
    const r = await database.collection('api_keys').deleteOne({ id });
    return { deletedCount: r.deletedCount, revoked: false, doc: null };
  }

  const r = await database.collection('api_keys').findOneAndUpdate(
    { id },
    { $set: { expires_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );

  return { deletedCount: 0, revoked: !!r.value, doc: r.value };
}

async function listApiKeys() {
  const database = await connectMongo();
  const keys = await database.collection('api_keys').find({}, { projection: { hashed_key: 1 } }).toArray();
  return keys.map((key) => ({
    ...key,
    keyFingerprint: typeof key.hashed_key === 'string' ? key.hashed_key.slice(0, 16) : null,
  })).map(({ hashed_key, ...rest }) => rest);
}

async function setQuotaForAll(q) {
  const database = await connectMongo();
  const quota = Number(q);
  if (!Number.isFinite(quota) || quota < 0) throw new Error('invalid_quota');
  const r = await database.collection('api_keys').updateMany({}, { $set: { quota } });
  return { matchedCount: r.matchedCount, modifiedCount: r.modifiedCount };
}

async function setQuotaForApiKeyId(apiKeyId, q) {
  const database = await connectMongo();
  const quota = Number(q);
  const id = Number(apiKeyId);
  if (!Number.isFinite(id)) throw new Error('invalid_api_key_id');
  if (!Number.isFinite(quota) || quota < 0) throw new Error('invalid_quota');

  const r = await database.collection('api_keys').findOneAndUpdate(
    { id },
    { $set: { quota } },
    { returnDocument: 'after' },
  );

  return r.value ?? null;
}

module.exports = {
  connectMongo,
  getApiKeyByHash,
  incrementApiKeyUsage,
  getNextScanId,
  getRecentScans,
  insertScan,
  deleteScanById,
  deleteScansByApiKeyId,
  closeMongo,
  resetFromLegacyData,
  setApiKeyUnlimitedById,
  revokeApiKeyById,
  listApiKeys,
  setQuotaForAll,
  setQuotaForApiKeyId,
};
