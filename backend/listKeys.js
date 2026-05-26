const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'darkmode_pqc';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const keys = await db.collection('api_keys').find({}).toArray();
  console.log(keys);
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });