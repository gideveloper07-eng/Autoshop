const sql = require("mssql");

let pool;

async function openCommunicationPool() {
  // Check if pool exists and is connected
  if (pool) {
    try {
      // Test the connection by attempting a simple query
      await pool.request().query("SELECT 1");
      return pool;
    } catch (err) {
      // Pool is dead, close it and create a new one
      console.warn(
        "Communication pool connection failed, creating new pool...",
        err.message,
      );
      try {
        await pool.close();
      } catch (closeErr) {
        console.warn("Error closing old pool:", closeErr.message);
      }
      pool = null;
    }
  }

  try {
    pool = await new sql.ConnectionPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "1433"),
      database: process.env.COMM_DB,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
      pool: {
        max: 10,
        min: 2,
        idleTimeoutMillis: 30000,
      },
      connectionTimeout: 30000,
      requestTimeout: 30000,
    }).connect();

    console.log("Communication pool connected successfully");
    return pool;
  } catch (err) {
    console.error("Failed to create communication pool:", err);
    throw err;
  }
}

// Graceful shutdown
process.on("exit", async () => {
  if (pool) {
    try {
      await pool.close();
    } catch (err) {
      console.error("Error closing pool on exit:", err);
    }
  }
});

module.exports = openCommunicationPool;
