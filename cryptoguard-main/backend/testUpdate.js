const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'darkmode_pqc';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const hashed = '16f57666b2cf71f65273916fcbe65315423893de611a565498a1b815bbb4a259';
  const res = await db.collection('api_keys').findOneAndUpdate(
    { hashed_key: hashed },
    { $set: { quota: null } },
    { returnDocument: 'after' },
  );
  console.log('res:', res);
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });