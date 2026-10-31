const { Pool } = require('pg');
const env = require('../config/env');

let poolInstance = null;

function getPool() {
  if (!poolInstance) {
    const config = {
      connectionString: env.DATABASE_URL,
      max: 10,
    };
    if (env.DATABASE_URL && !env.DATABASE_URL.includes('localhost')) {
      config.ssl = { rejectUnauthorized: false };
    }
    poolInstance = new Pool(config);

    poolInstance.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return poolInstance;
}

const query = async (text, params) => {
  const p = getPool();
  return p.query(text, params);
};

const withTransaction = async (callback) => {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rbError) {
      console.error('Error rolling back transaction', rbError);
    }
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  get pool() {
    return getPool();
  },
  query,
  withTransaction,
};

