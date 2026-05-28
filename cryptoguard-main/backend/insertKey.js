const { MongoClient } = require('mongodb');
const crypto = require('crypto');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'darkmode_pqc';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const key = process.argv[2] || 'test_key_for_upgrade';
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  const id = Math.floor(Math.random() * 1000000) + 100;
  const doc = {
    id,
    name: 'test-key',
    hashed_key: hashed,
    quota: 10,
    usage_count: 0,
    expires_at: null,
  };
  await db.collection('api_keys').insertOne(doc);
  console.log('Inserted', doc);
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });