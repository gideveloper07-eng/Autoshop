const express = require("express");
const router  = express.Router();
const jwt     = require("jsonwebtoken");
const sql     = require("mssql");

// ─────────────────────────────────────────────────────────────────────────────
// Helper: open a dynamic pool to a specific database (same pattern as authController)
// ─────────────────────────────────────────────────────────────────────────────
async function openPool(databaseName) {
  const pool = await new sql.ConnectionPool({
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server:   process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT || "1433"),
    database: databaseName,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  }).connect();
  return pool;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: decode JWT and extract userId + databaseName
// ─────────────────────────────────────────────────────────────────────────────
function decodeToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/retail-incentive
// Calls A_SP_FOR_ApplicationChallangrid with @what = 'Retail_Incentive'
// Returns: [ { date, sp_468, sp_469 }, ... ]
// ─────────────────────────────────────────────────────────────────────────────
router.get("/retail-incentive", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName } = decoded;
    if (!databaseName) {
      return res.status(400).json({ success: false, message: "Database not found in token" });
    }

    console.log("📋 CHALLAN — Retail Incentive — DB:", databaseName);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix",   sql.NVarChar(50), "")
      .input("what",     sql.NVarChar(50), "Retail_Incentive")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate",   sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    console.log(`✅ Challan rows returned: ${result.recordset.length}`);

    return res.json({
      success: true,
      data: result.recordset,
    });

  } catch (err) {
    console.error("❌ CHALLAN ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});

module.exports = router;
