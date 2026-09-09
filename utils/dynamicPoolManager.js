const sql = require("mssql");

const pools = new Map();
const connectingPools = new Map();

const DEFAULT_CONFIG = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "1433", 10),

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
    console.error(`❌ Pool Error [${databaseName}]`, err?.message || err);

    // Remove only this pool if it is still the active
    // pool for this database.
    if (pools.get(databaseName) === pool) {
      pools.delete(databaseName);
    }
  });

  await pool.connect();

  console.log(`✅ Pool Connected : ${databaseName}`);

  return pool;
}

async function openPool(databaseName) {
  if (!databaseName) {
    throw new Error("Database name required");
  }

  databaseName = String(databaseName).trim();

  // ---------------------------------------------------------
  // 1. Reuse existing healthy pool
  // ---------------------------------------------------------
  let pool = pools.get(databaseName);

  if (pool) {
    if (pool.connected && !pool.healthy === false) {
      return pool;
    }

    if (pool.connected) {
      return pool;
    }

    // Existing pool is no longer connected.
    pools.delete(databaseName);
  }

  // ---------------------------------------------------------
  // 2. If another request is already creating this database
  //    pool, wait for that same connection.
  // ---------------------------------------------------------
  if (connectingPools.has(databaseName)) {
    return await connectingPools.get(databaseName);
  }

  // ---------------------------------------------------------
  // 3. Create exactly one pool for this database
  // ---------------------------------------------------------
  const connectionPromise = (async () => {
    try {
      const newPool = await createPool(databaseName);

      pools.set(databaseName, newPool);

      return newPool;
    } catch (err) {
      console.error(
        `❌ Failed to connect database [${databaseName}]`,
        err?.message || err,
      );

      throw err;
    } finally {
      connectingPools.delete(databaseName);
    }
  })();

  connectingPools.set(databaseName, connectionPromise);

  return await connectionPromise;
}

module.exports = openPool;
