const { MongoClient } = require('mongodb');
const crypto = require('crypto');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'darkmode_pqc';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const key = process.argv[2];
  const action = process.argv[3] || 'expire'; // expire | delete
  if (!key) {
    console.error('Usage: node revokeKey.js <plaintext-key> [expire|delete]');
    process.exit(1);
  }

  const hashed = crypto.createHash('sha256').update(key).digest('hex');

  if (action === 'delete') {
    const r = await db.collection('api_keys').deleteOne({ hashed_key: hashed });
    console.log('Deleted count:', r.deletedCount);
    await client.close();
    return;
  }

  const r = await db.collection('api_keys').findOneAndUpdate(
    { hashed_key: hashed },
    { $set: { expires_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );

  if (!r.value) {
    console.log('API key not found');
  } else {
    console.log('Revoked (set expires_at):', r.value);
  }

  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
