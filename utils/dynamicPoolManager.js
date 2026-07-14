const sql = require("mssql");

const pools = new Map();

const DEFAULT_CONFIG = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "1433"),

  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },

  pool: {
    max: 20,
    min: 2,
    idleTimeoutMillis: 60000,
  },

  connectionTimeout: 30000,
  requestTimeout: 30000,
};

async function createPool(databaseName) {
  const config = {
    ...DEFAULT_CONFIG,
    database: databaseName,
  };

  const pool = new sql.ConnectionPool(config);

  pool.on("error", (err) => {
    console.error(`Pool Error [${databaseName}]`, err.message);

    pools.delete(databaseName);
  });

  await pool.connect();

  console.log(`✅ Pool Connected : ${databaseName}`);

  return pool;
}

async function openPool(databaseName) {
  if (!databaseName) throw new Error("Database name required");

  let pool = pools.get(databaseName);

  if (pool && pool.connected) return pool;

  pool = await createPool(databaseName);

  pools.set(databaseName, pool);

  return pool;
}

module.exports = openPool;
