const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const sql = require("mssql");

// ─────────────────────────────────────────────────────────────────────────────
// Helper: open a dynamic pool to a specific database (same pattern as authController)
// ─────────────────────────────────────────────────────────────────────────────
async function openPool(databaseName) {
  const pool = await new sql.ConnectionPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "1433"),
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
      return res
        .status(400)
        .json({ success: false, message: "Database not found in token" });
    }

    console.log("📋 CHALLAN — Retail Incentive — DB:", databaseName);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "Retail_Incentive")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/edit/:sp_462
// Calls A_SP_FOR_ApplicationChallangrid with @what = 'Edit' and @sp_462
// Returns: Complete challan details for the specified sp_462
// ─────────────────────────────────────────────────────────────────────────────
router.get("/edit/:sp_462", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName } = decoded;
    if (!databaseName) {
      return res
        .status(400)
        .json({ success: false, message: "Database not found in token" });
    }

    const { sp_462 } = req.params;
    if (!sp_462) {
      return res
        .status(400)
        .json({ success: false, message: "sp_462 parameter is required" });
    }

    console.log("📝 CHALLAN — Edit — DB:", databaseName, "sp_462:", sp_462);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "Edit")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .input("sp_462", sql.NVarChar(50), sp_462)
      .execute("A_SP_FOR_ApplicationChallangrid");

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Challan not found",
      });
    }

    console.log(`✅ Challan edit data retrieved for sp_462: ${sp_462}`);

    return res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error("❌ CHALLAN EDIT ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/challan/approve
// Calls A_SP_FOR_ApplicationChallangrid with @what = 'approve' and all challan data
// Returns: Success message
// ─────────────────────────────────────────────────────────────────────────────
router.post("/approve", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName } = decoded;
    if (!databaseName) {
      return res
        .status(400)
        .json({ success: false, message: "Database not found in token" });
    }

    const data = req.body;
    if (!data.sp_462) {
      return res
        .status(400)
        .json({ success: false, message: "sp_462 is required" });
    }

    console.log(
      "✅ CHALLAN — Approve — DB:",
      databaseName,
      "sp_462:",
      data.sp_462,
    );

    pool = await openPool(databaseName);

    const request = pool.request();

    // Add basic parameters
    request.input("prefix", sql.NVarChar(50), "");
    request.input("what", sql.NVarChar(50), "approve");
    request.input("FromDate", sql.NVarChar(50), "");
    request.input("ToDate", sql.NVarChar(50), "");

    // Add all sp_ parameters (sp_461 to sp_654)
    // All parameters are NVarChar in the stored procedure
    for (let i = 461; i <= 654; i++) {
      const key = `sp_${i}`;
      let value = data[key];

      // Convert null/undefined to empty string
      if (Array.isArray(value)) {
        value = "0";
      } else if (value === null || value === undefined) {
        value = "";
      } else {
        value = String(value);
      }

      // Handle different data types based on column
      if (
        key === "sp_524" ||
        key === "sp_577" ||
        key === "sp_581" ||
        key === "sp_585" ||
        key === "sp_589" ||
        key === "sp_590" ||
        key === "sp_591" ||
        key === "sp_592" ||
        key === "sp_593"
      ) {
        request.input(key, sql.NVarChar(sql.MAX), value);
      } else if (key === "sp_616") {
        request.input(key, sql.NVarChar(500), value);
      } else {
        request.input(key, sql.NVarChar(50), value);
      }
    }

    const result = await request.execute("A_SP_FOR_ApplicationChallangrid");

    console.log(`✅ Challan approved successfully: ${data.sp_462}`);

    return res.json({
      success: true,
      message: result.recordset[0]?.err || "Challan approved successfully",
      data: result.recordset[0],
    });
  } catch (err) {
    console.error("❌ CHALLAN APPROVE ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/challan/reject
// Calls A_SP_FOR_ApplicationChallangrid with @what = 'reject' and all challan data
// Returns: Success message
// ─────────────────────────────────────────────────────────────────────────────
router.post("/reject", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName } = decoded;
    if (!databaseName) {
      return res
        .status(400)
        .json({ success: false, message: "Database not found in token" });
    }

    const data = req.body;
    if (!data.sp_462) {
      return res
        .status(400)
        .json({ success: false, message: "sp_462 is required" });
    }

    console.log(
      "❌ CHALLAN — Reject — DB:",
      databaseName,
      "sp_462:",
      data.sp_462,
    );

    pool = await openPool(databaseName);

    const request = pool.request();

    // Add basic parameters
    request.input("prefix", sql.NVarChar(50), "");
    request.input("what", sql.NVarChar(50), "reject");
    request.input("FromDate", sql.NVarChar(50), "");
    request.input("ToDate", sql.NVarChar(50), "");

    // Add all sp_ parameters (sp_461 to sp_654)
    // All parameters are NVarChar in the stored procedure
    for (let i = 461; i <= 654; i++) {
      const key = `sp_${i}`;
      let value = data[key];

      // Convert null/undefined to empty string
      if (value === null || value === undefined) {
        value = "";
      } else {
        value = String(value);
      }

      // Handle different data types based on column
      if (
        key === "sp_524" ||
        key === "sp_577" ||
        key === "sp_581" ||
        key === "sp_585" ||
        key === "sp_589" ||
        key === "sp_590" ||
        key === "sp_591" ||
        key === "sp_592" ||
        key === "sp_593"
      ) {
        request.input(key, sql.NVarChar(sql.MAX), value);
      } else if (key === "sp_616") {
        request.input(key, sql.NVarChar(500), value);
      } else {
        request.input(key, sql.NVarChar(50), value);
      }
    }

    const result = await request.execute("A_SP_FOR_ApplicationChallangrid");

    console.log(`✅ Challan rejected successfully: ${data.sp_462}`);

    return res.json({
      success: true,
      message: result.recordset[0]?.err || "Challan rejected successfully",
      data: result.recordset[0],
    });
  } catch (err) {
    console.error("❌ CHALLAN REJECT ERROR:", err.message);
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
