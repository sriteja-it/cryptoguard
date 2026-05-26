const assert = require('assert');
const crypto = require('crypto');
const {
  connectMongo,
  closeMongo,
  setQuotaForAll,
  setQuotaForApiKeyId,
  insertScan,
  deleteScanById,
  deleteScansByApiKeyId,
  getNextScanId,
} = require('./mongoStore');

async function run() {
  await connectMongo();
  // create a temporary API key directly in DB
  const db = await connectMongo();
  const id = Math.floor(Math.random() * 1000000) + 2000;
  const plaintext = `tmp_${crypto.randomBytes(8).toString('hex')}`;
  const hashed = crypto.createHash('sha256').update(plaintext).digest('hex');
  const doc = {
    id,
    name: 'integration-test-key',
    hashed_key: hashed,
    quota: 1,
    usage_count: 0,
    expires_at: null,
  };
  await db.collection('api_keys').insertOne(doc);

  // Test setQuotaForAll
  await setQuotaForAll(5);
  const updatedKey = await db.collection('api_keys').findOne({ id });
  assert(updatedKey.quota === 5, 'setQuotaForAll did not update the quota');

  // Test setQuotaForApiKeyId
  await setQuotaForApiKeyId(id, 3);
  const updatedKey2 = await db.collection('api_keys').findOne({ id });
  assert(updatedKey2.quota === 3, 'setQuotaForApiKeyId did not set the quota');

  // Insert a scan and delete by id
  const scanId = await getNextScanId();
  const scan = { id: scanId, url: 'https://example.test', apiKeyId: id, scannedAt: new Date().toISOString(), result: {} };
  await insertScan(scan);
  const del = await deleteScanById(scanId, id);
  assert(del.deletedCount === 1, 'deleteScanById failed to delete the inserted scan');

  // Insert two scans and bulk delete by apiKeyId
  const scanAId = await getNextScanId();
  const scanBId = scanAId + 1;
  await insertScan({ id: scanAId, url: 'a', apiKeyId: id, scannedAt: new Date().toISOString(), result: {} });
  await insertScan({ id: scanBId, url: 'b', apiKeyId: id, scannedAt: new Date().toISOString(), result: {} });
  const bulk = await deleteScansByApiKeyId(id);
  assert(bulk.deletedCount >= 2, 'deleteScansByApiKeyId failed to delete scans');

  // Cleanup: remove the test api key
  await db.collection('api_keys').deleteOne({ id });

  console.log('Integration tests passed');
  await closeMongo();
}

run().catch(async (err) => {
  console.error('Integration tests failed:', err && err.message ? err.message : err);
  try { await closeMongo(); } catch (e) {};
  process.exit(2);
});
