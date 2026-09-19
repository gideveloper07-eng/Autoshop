const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const sql = require("mssql");
const openPool = require("../utils/dynamicPoolManager");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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

/**
 * Build a parameterised request against A_SP_FOR_Receipt.
 * Only @prefix, @what, and optional @Rcl_71 (model unq — needed for vardata)
 * are meaningful here; every other param defaults to ''.
 */
function makeReceiptRequest(pool, what, rcl71 = "") {
  return pool
    .request()
    .input("prefix",  sql.NVarChar(50),  "rh_")
    .input("what",    sql.NVarChar(50),  what)
    .input("Rcl_1",   sql.NVarChar(50),  "")
    .input("Rcl_2",   sql.NVarChar(50),  "")
    .input("Rcl_3",   sql.NVarChar(50),  "")
    .input("Rcl_4",   sql.NVarChar(50),  "")
    .input("Rcl_5",   sql.NVarChar(50),  "")
    .input("Rcl_6",   sql.NVarChar(50),  "")
    .input("Rcl_7",   sql.NVarChar(50),  "")
    .input("Rcl_8",   sql.NVarChar(50),  "")
    .input("Rcl_9",   sql.NVarChar(50),  "")
    .input("Rcl_10",  sql.NVarChar(50),  "")
    .input("Rcl_11",  sql.NVarChar(50),  "")
    .input("Rcl_12",  sql.NVarChar(50),  "")
    .input("Rcl_71",  sql.NVarChar(50),  rcl71)  // model unq — used for vardata
    .input("Rcl_73",  sql.NVarChar(50),  "")
    .input("Rcl_77",  sql.NVarChar(50),  "")
    .input("Rcl_82",  sql.NVarChar(50),  "")
    .input("Rcl_84",  sql.NVarChar(50),  "")
    .input("Rcl_85",  sql.NVarChar(50),  "")
    .input("Rcl_105", sql.NVarChar(50),  "")
    .input("pageno",  sql.NVarChar(50),  "")
    .input("Err",     sql.NVarChar(50),  "0")
    .execute("A_SP_FOR_Receipt");
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/booking/dropdowns
// Returns: states, cities, areas, models, colours, scNames
// All fetched in one parallel round trip from A_SP_FOR_Receipt.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/dropdowns", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { currentDatabase: databaseName } = decoded;
    if (!databaseName) {
      return res
        .status(400)
        .json({ success: false, message: "Database not found in token" });
    }

    console.log("📦 BOOKING DROPDOWNS — DB:", databaseName);

    pool = await openPool(databaseName);

    const [stateRes, cityRes, areaRes, modelRes, colorRes, staffRes] =
      await Promise.all([
        makeReceiptRequest(pool, "state"),
        makeReceiptRequest(pool, "city"),
        makeReceiptRequest(pool, "area"),
        makeReceiptRequest(pool, "dropmodeldata"),
        makeReceiptRequest(pool, "color_name"),
        makeReceiptRequest(pool, "staffname"),
      ]);

    return res.json({
      success: true,
      data: {
        states:   stateRes.recordset  || [],
        cities:   cityRes.recordset   || [],
        areas:    areaRes.recordset   || [],
        models:   modelRes.recordset  || [],
        colours:  colorRes.recordset  || [],
        scNames:  staffRes.recordset  || [],
      },
    });
  } catch (err) {
    console.error("❌ BOOKING DROPDOWNS ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/booking/variants/:modelUnq
// Returns variants for the given model unq (@what = 'vardata', @Rcl_71 = modelUnq)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/variants/:modelUnq", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { currentDatabase: databaseName } = decoded;
    if (!databaseName) {
      return res
        .status(400)
        .json({ success: false, message: "Database not found in token" });
    }

    const { modelUnq } = req.params;
    console.log("📦 BOOKING VARIANTS — DB:", databaseName, "model:", modelUnq);

    pool = await openPool(databaseName);

    const result = await makeReceiptRequest(pool, "vardata", modelUnq);

    return res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error("❌ BOOKING VARIANTS ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

module.exports = router;
