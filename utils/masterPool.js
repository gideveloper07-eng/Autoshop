const sql = require("mssql");

let pool;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 60000; // Only check every 60 seconds

async function openMasterPool() {
  // Check if pool exists and is potentially connected
  if (pool && pool.connected) {
    // Only do health check every 60 seconds to avoid overwhelming the server
    const now = Date.now();
    if (now - lastHealthCheck > HEALTH_CHECK_INTERVAL) {
      try {
        lastHealthCheck = now;
        // Test with a light query
        await pool.request().query("SELECT 1");
        return pool;
      } catch (err) {
        // Pool is dead, close it and create a new one
        console.warn(
          "Master pool health check failed, reconnecting...",
          err.message,
        );
        try {
          await pool.close();
        } catch (closeErr) {
          console.warn("Error closing old master pool:", closeErr.message);
        }
        pool = null;
      }
    } else {
      // Health check not due yet, return existing pool
      return pool;
    }
  }

  try {
    console.log("Creating new master pool...");
    pool = await new sql.ConnectionPool({
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
        max: 10,
        min: 1,
        idleTimeoutMillis: 60000, // Increased to 60 seconds
        acquireTimeoutMillis: 30000,
      },
      connectionTimeout: 30000,
      requestTimeout: 30000,
    }).connect();

    lastHealthCheck = Date.now();
    console.log("✅ Master pool connected successfully");
    return pool;
  } catch (err) {
    console.error("❌ Failed to create master pool:", err.message);
    throw err;
  }
}

// Graceful shutdown
process.on("exit", async () => {
  if (pool) {
    try {
      await pool.close();
      console.log("Master pool closed on exit");
    } catch (err) {
      console.error("Error closing master pool on exit:", err.message);
    }
  }
});

// Handle process termination
process.on("SIGINT", async () => {
  if (pool) {
    try {
      await pool.close();
      console.log("Master pool closed on SIGINT");
    } catch (err) {
      console.error("Error closing master pool on SIGINT:", err.message);
    }
  }
  process.exit(0);
});

module.exports = openMasterPool;
