const sql = require("mssql");

let poolPromise = null;

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "1433"),
  database: "CMPY_AUTOSHOP",

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

async function createPool() {
  const pool = new sql.ConnectionPool(config);

  pool.on("error", (err) => {
    console.error("Master pool error:", err.message);

    // Force recreation on next request
    poolPromise = null;
  });

  await pool.connect();

  console.log("✅ Master database connected");

  return pool;
}

async function openMasterPool() {
  if (!poolPromise) {
    poolPromise = createPool().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }

  return poolPromise;
}

async function closeMasterPool() {
  if (!poolPromise) return;

  try {
    const pool = await poolPromise;

    if (pool.connected) {
      await pool.close();
      console.log("Master pool closed");
    }
  } catch (err) {
    console.error("Error closing master pool:", err.message);
  } finally {
    poolPromise = null;
  }
}

process.on("SIGINT", async () => {
  await closeMasterPool();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeMasterPool();
  process.exit(0);
});

module.exports = openMasterPool;
