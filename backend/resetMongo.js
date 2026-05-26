require('dotenv').config();

const { resetFromLegacyData, closeMongo } = require('./mongoStore');

async function main() {
  try {
    await resetFromLegacyData();
    console.log('MongoDB collections reset and reseeded from legacy JSON snapshots.');
  } catch (error) {
    console.error('Failed to reset MongoDB data:', error.message);
    process.exitCode = 1;
  } finally {
    await closeMongo();
  }
}

main();