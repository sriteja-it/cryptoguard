const { MongoClient } = require('mongodb');
const crypto = require('crypto');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'darkmode_pqc';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const plain = process.argv[2] || `pqc_${crypto.randomBytes(12).toString('hex')}`;
  const name = process.argv[3] || 'generated-key';
  const quotaArg = process.argv[4];
  const quota = quotaArg ? parseInt(quotaArg, 10) : 5;

  const hashed = crypto.createHash('sha256').update(plain).digest('hex');
  // ensure unique id
  let id = Math.floor(Math.random() * 1000000) + 100;
  while (await db.collection('api_keys').findOne({ id })) {
    id = Math.floor(Math.random() * 1000000) + 100;
  }

  const doc = {
    id,
    name,
    hashed_key: hashed,
    quota,
    usage_count: 0,
    expires_at: null,
  };

  await db.collection('api_keys').insertOne(doc);
  console.log('Created API key:');
  console.log('Plaintext key (save this):', plain);
  console.log('Stored doc:', doc);

  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
