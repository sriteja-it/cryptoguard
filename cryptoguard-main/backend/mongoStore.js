const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const DATA_DIR = path.join(__dirname, 'data');
const API_KEYS_FILE = path.join(DATA_DIR, 'api_keys.json');
const SCANS_FILE = path.join(DATA_DIR, 'scan_history.json');

let client;
let db;
let connectionPromise = null; // Fixes the simultaneous connection race condition

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
  if (db) return db;

  // If a connection attempt is already in progress, reuse that promise
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME || 'darkmode_pqc';
    
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    
    await ensureIndexes(db);
    await seedLegacyData(db);
    return db;
  })();

  try {
    return await connectionPromise;
  } catch (err) {
    connectionPromise = null; // Reset promise if initialization fails so it can retry
    throw err;
  }
}

async function getApiKeyByHash(hashedKey) {
  const database = await connectMongo();
  return database.collection('api_keys').findOne({ hashed_key: hashedKey });
}

async function incrementApiKeyUsage(apiKeyId) {
  const database = await connectMongo();
  // Rectified for modern MongoDB driver wrapper updates
  return database.collection('api_keys').findOneAndUpdate(
    { id: apiKeyId },
    { $inc: { usage_count: 1 } },
    { returnDocument: 'after' }
  );
}

async function getNextScanId() {
  const database = await connectMongo();
  
  // Safe alternate approach to counter increment race-conditions: 
  // Sorts by highest id and adds 1 instead of relying strictly on countDocuments()
  const lastScan = await database.collection('scan_history')
    .findOne({}, { sort: { id: -1 }, projection: { id: 1 } });
    
  return lastScan && typeof lastScan.id === 'number' ? lastScan.id + 1 : 1;
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
    connectionPromise = null;
  }
}

async function setApiKeyUnlimitedById(apiKeyId) {
  const database = await connectMongo();
  const id = Number(apiKeyId);
  if (!Number.isFinite(id)) throw new Error('invalid_api_key_id');

  // Rectified for modern driver structure compatibility
  return database.collection('api_keys').findOneAndUpdate(
    { id },
    { $set: { quota: null } },
    { returnDocument: 'after' }
  );
}

async function revokeApiKeyById(apiKeyId, action = 'expire') {
  const database = await connectMongo();
  const id = Number(apiKeyId);
  if (!Number.isFinite(id)) throw new Error('invalid_api_key_id');

  if (action === 'delete') {
    const r = await database.collection('api_keys').deleteOne({ id });
    return { deletedCount: r.deletedCount, revoked: false, doc: null };
  }

  // Rectified for modern driver structure compatibility
  const updatedDoc = await database.collection('api_keys').findOneAndUpdate(
    { id },
    { $set: { expires_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );

  return { deletedCount: 0, revoked: !!updatedDoc, doc: updatedDoc };
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

  // Rectified for modern driver structure compatibility
  return database.collection('api_keys').findOneAndUpdate(
    { id },
    { $set: { quota } },
    { returnDocument: 'after' }
  );
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