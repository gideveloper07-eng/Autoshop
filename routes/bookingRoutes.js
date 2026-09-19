const express = require("express");
const router  = express.Router();
const jwt     = require("jsonwebtoken");
const sql     = require("mssql");
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

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0] ||
      req.headers["x-real-ip"] ||
      req.headers["cf-connecting-ip"] ||
      req.socket?.remoteAddress ||
      req.ip ||
      "";
  return String(raw).replace(/^::ffff:/, "").trim();
}

function str(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/**
 * Shared helper — build a parameterised call to A_SP_FOR_Receipt.
 * Only prefix, what, and rcl71 (for vardata) vary; everything else is ''.
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
    .input("Rcl_71",  sql.NVarChar(50),  rcl71)
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

/**
 * Build a bare A_SP_FOR_ACCOUNTMASTER request with all params defaulted to ''.
 * Caller sets what + any fields they need via .input() chaining — but since we
 * can't chain after this function returns, we instead accept a params map.
 */
function makeAccountMasterRequest(pool, params = {}) {
  const p = (key, type, def = "") =>
    pool.request().input; // not used directly — see below

  const req = pool.request().multiple(true);  // multiple=true for dynamic-SQL SP

  const fields = {
    prefix: ["NVarChar", 50,  "rh_"],
    what:   ["NVarChar", 20,  ""],
    m1_1:   ["NVarChar", 50,  ""],
    m1_2:   ["NVarChar", 50,  ""],
    m1_3:   ["NVarChar", 50,  ""],
    m1_4:   ["NVarChar", 50,  ""],
    m1_5:   ["NVarChar", 50,  ""],
    m1_6:   ["NVarChar", 50,  ""],
    m1_7:   ["NVarChar", 500, ""],
    m1_8:   ["NVarChar", 500, ""],
    m1_9:   ["NVarChar", 50,  ""],
    m1_10:  ["NVarChar", 50,  ""],
    m1_11:  ["NVarChar", 500, ""],
    m1_12:  ["NVarChar", 500, ""],
    m1_13:  ["NVarChar", 50,  ""],
    m1_14:  ["NVarChar", 50,  ""],
    m1_15:  ["NVarChar", 50,  ""],
    m1_16:  ["NVarChar", 50,  ""],
    m1_17:  ["NVarChar", 50,  ""],
    m1_18:  ["NVarChar", 50,  ""],
    m1_19:  ["NVarChar", 50,  ""],
    m1_20:  ["NVarChar", 50,  ""],
    m1_21:  ["NVarChar", 50,  ""],
    m1_22:  ["NVarChar", 50,  ""],
    m1_23:  ["NVarChar", 50,  ""],
    m1_24:  ["NVarChar", 50,  ""],
    m1_25:  ["NVarChar", 50,  ""],
    m1_26:  ["NVarChar", 50,  ""],
    m1_27:  ["NVarChar", 50,  ""],
    m1_28:  ["NVarChar", 50,  ""],
    m1_29:  ["NVarChar", 50,  ""],
    m1_30:  ["NVarChar", 50,  ""],
    m1_31:  ["NVarChar", 50,  ""],
    m1_32:  ["NVarChar", 50,  ""],
    m1_33:  ["NVarChar", 50,  ""],
    m1_34:  ["NVarChar", 50,  ""],
    m1_35:  ["NVarChar", 50,  ""],
    m1_36:  ["NVarChar", 50,  ""],
    m1_37:  ["NVarChar", 50,  ""],
    m1_38:  ["NVarChar", 50,  ""],
    m1_39:  ["NVarChar", 50,  ""],
    m1_40:  ["NVarChar", 50,  ""],
    m1_41:  ["NVarChar", 50,  ""],
    m1_42:  ["NVarChar", 50,  ""],
    m1_43:  ["NVarChar", 50,  ""],
    m1_44:  ["NVarChar", 50,  ""],
    m1_45:  ["NVarChar", 50,  ""],
    m1_46:  ["NVarChar", 50,  ""],
    m1_47:  ["NVarChar", 50,  ""],
    m1_48:  ["NVarChar", 50,  ""],
    m1_49:  ["NVarChar", 50,  ""],
    m1_50:  ["NVarChar", 50,  ""],
    m1_51:  ["NVarChar", 50,  ""],
    m1_52:  ["NVarChar", 50,  ""],
    m1_53:  ["NVarChar", 50,  ""],
    m1_54:  ["NVarChar", 50,  ""],
    m1_55:  ["NVarChar", 50,  ""],
    likeclause: ["NVarChar", 50, ""],
    pageno:     ["NVarChar", 50, ""],
    Err:        ["NVarChar", 50, "0"],
  };

  for (const [key, [type, size, def]] of Object.entries(fields)) {
    const val = key in params ? str(params[key]) : def;
    req.input(key, sql.NVarChar(size), val);
  }

  return req.execute("A_SP_FOR_ACCOUNTMASTER");
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/booking/dropdowns
// Returns: states, cities, areas, models, colours, scNames
// ─────────────────────────────────────────────────────────────────────────────
router.get("/dropdowns", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { currentDatabase: databaseName } = decoded;
    if (!databaseName)
      return res.status(400).json({ success: false, message: "Database not found in token" });

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
        states:  stateRes.recordset  || [],
        cities:  cityRes.recordset   || [],
        areas:   areaRes.recordset   || [],
        models:  modelRes.recordset  || [],
        colours: colorRes.recordset  || [],
        scNames: staffRes.recordset  || [],
      },
    });
  } catch (err) {
    console.error("❌ BOOKING DROPDOWNS ERROR:", err.message);
    return res.status(500).json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/booking/variants/:modelUnq
// Returns variants for a model (@what='vardata', @Rcl_71=modelUnq)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/variants/:modelUnq", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { currentDatabase: databaseName } = decoded;
    if (!databaseName)
      return res.status(400).json({ success: false, message: "Database not found in token" });

    const { modelUnq } = req.params;
    console.log("📦 BOOKING VARIANTS — DB:", databaseName, "model:", modelUnq);

    pool = await openPool(databaseName);
    const result = await makeReceiptRequest(pool, "vardata", modelUnq);
    return res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error("❌ BOOKING VARIANTS ERROR:", err.message);
    return res.status(500).json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/booking/save
//
// Step 1 — A_SP_FOR_ACCOUNTMASTER @what='insert'  → inserts into rh_m1
// Step 2 — A_SP_FOR_ACCOUNTMASTER @what='getunqid' → fetch new m1_2 (custUnq)
// Step 3 — INSERT INTO rh_sp_73   → docket row with all 18 booking fields
// ─────────────────────────────────────────────────────────────────────────────
router.post("/save", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { currentDatabase: databaseName, userId } = decoded;
    if (!databaseName)
      return res.status(400).json({ success: false, message: "Database not found in token" });

    const {
      title               = "",
      name                = "",
      fatherName          = "",
      emailId             = "",
      address             = "",
      state               = "",
      cityUnq             = "",
      areaUnq             = "",
      zip                 = "",
      mobileNo            = "",
      gstin               = "",
      birthAnniversary    = "",
      marriageAnniversary = "",
      aadharNo            = "",
      modelUnq            = "",
      variantUnq          = "",
      colourUnq           = "",
      scUnq               = "",
    } = req.body;

    const clientIp = getClientIp(req);
    const uid      = str(userId);

    console.log("💾 BOOKING SAVE — DB:", databaseName, "customer:", name);

    pool = await openPool(databaseName);

    // ── Step 1: Insert account master ─────────────────────────────────────────
    let acResult;
    try {
      acResult = await makeAccountMasterRequest(pool, {
        what:  "insert",
        m1_3:  uid,
        m1_4:  clientIp,
        m1_7:  str(name),
        m1_8:  str(name),
        m1_9:  "C",
        m1_10: "579831_",
        m1_11: str(address),
        m1_13: str(cityUnq),
        m1_14: str(state),
        m1_15: "INDIA",
        m1_16: str(zip),
        m1_26: str(emailId),
        m1_37: str(gstin),
        m1_47: str(mobileNo),
        m1_48: str(aadharNo),
        m1_49: "CUST",
        m1_50: str(fatherName),
        m1_51: str(title),
        m1_52: "0.00",
        m1_54: str(areaUnq),
      });
    } catch (spErr) {
      console.error("❌ BOOKING SAVE — A_SP_FOR_ACCOUNTMASTER insert error:", spErr.message);
      return res.status(500).json({
        success: false,
        message: "Account master insert failed: " + spErr.message,
      });
    }

    // Check SP error message in first result set
    const errRow = acResult.recordsets?.[0]?.[0];
    const errVal = str(errRow?.err ?? errRow?.Err ?? "0");
    console.log("🔍 AC insert result set[0]:", JSON.stringify(acResult.recordsets?.[0]));

    if (errVal && errVal !== "0" && !errVal.toLowerCase().startsWith("save")) {
      return res.status(400).json({ success: false, message: errVal });
    }

    // ── Step 2: Fetch new customer unqid ──────────────────────────────────────
    let custUnq = "";
    try {
      const unqResult = await makeAccountMasterRequest(pool, {
        what: "getunqid",
        m1_7: str(name),
      });
      custUnq = str(unqResult.recordset?.[0]?.unqid ?? "");
      console.log("🔍 custUnq:", custUnq);
    } catch (unqErr) {
      console.warn("⚠️  getunqid error (non-fatal):", unqErr.message);
    }

    // ── Step 3: Insert docket row into rh_sp_73 ───────────────────────────────
    // Column type corrections from actual schema:
    //   sp_731 datetime  → entry date (GETDATE())
    //   sp_732 nvarchar  → userid
    //   sp_733 nvarchar  → ip address
    //   sp_737 datetime  → booking/modify date (GETDATE())
    //   sp_739 nvarchar  → title
    //   sp_740 nvarchar  → customer unqid
    //   sp_741 nvarchar(MAX) → address
    //   sp_742 nvarchar  → city unq
    //   sp_743 nvarchar  → area unq
    //   sp_744 nvarchar  → email
    //   sp_745 nvarchar  → mobile no
    //   sp_746 nvarchar  → aadhar no
    //   sp_748 nvarchar  → gstin
    //   sp_749 nvarchar  → model unq
    //   sp_750 nvarchar  → variant unq
    //   sp_751 nvarchar  → colour unq
    //   sp_756 nvarchar  → sc unq
    //   sp_766 datetime  → birth anniversary (NULL if empty)
    //   sp_767 datetime  → marriage anniversary (NULL if empty)
    //   sp_768 nvarchar  → zip
    //   sp_859 nvarchar  → state
    //   sp_879 nvarchar  → father name

    // Helper: convert DD/MM/YYYY string → JS Date or null
    const parseDate = (s) => {
      if (!s || !s.trim()) return null;
      // Supports DD/MM/YYYY or YYYY-MM-DD
      const parts = s.trim().split("/");
      if (parts.length === 3) {
        const [d, m, y] = parts;
        const dt = new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`);
        return isNaN(dt) ? null : dt;
      }
      const dt = new Date(s.trim());
      return isNaN(dt) ? null : dt;
    };

    const birthDate    = parseDate(birthAnniversary);
    const marriageDate = parseDate(marriageAnniversary);

    try {
      await pool
        .request()
        // Audit columns
        .input("sp_731",  sql.DateTime,       new Date())        // entry date
        .input("sp_732",  sql.NVarChar(100),  uid)               // created by userid
        .input("sp_733",  sql.NVarChar(100),  clientIp)          // ip address
        .input("sp_737",  sql.DateTime,       new Date())        // booking date
        // Booking fields
        .input("sp_739",  sql.NVarChar(100),  str(title))
        .input("sp_740",  sql.NVarChar(100),  custUnq)
        .input("sp_741",  sql.NVarChar(sql.MAX), str(address))
        .input("sp_742",  sql.NVarChar(100),  str(cityUnq))
        .input("sp_743",  sql.NVarChar(100),  str(areaUnq))
        .input("sp_744",  sql.NVarChar(100),  str(emailId))
        .input("sp_745",  sql.NVarChar(100),  str(mobileNo))
        .input("sp_746",  sql.NVarChar(100),  str(aadharNo))
        .input("sp_748",  sql.NVarChar(100),  str(gstin))
        .input("sp_749",  sql.NVarChar(100),  str(modelUnq))
        .input("sp_750",  sql.NVarChar(100),  str(variantUnq))
        .input("sp_751",  sql.NVarChar(100),  str(colourUnq))
        .input("sp_756",  sql.NVarChar(100),  str(scUnq))
        .input("sp_766",  sql.DateTime,       birthDate)         // nullable datetime
        .input("sp_767",  sql.DateTime,       marriageDate)      // nullable datetime
        .input("sp_768",  sql.NVarChar(100),  str(zip))
        .input("sp_859",  sql.NVarChar(100),  str(state))
        .input("sp_879",  sql.NVarChar(100),  str(fatherName))
        .query(`
          INSERT INTO rh_sp_73
            (sp_731, sp_732, sp_733, sp_737,
             sp_739, sp_740, sp_741, sp_742, sp_743,
             sp_744, sp_745, sp_746, sp_748,
             sp_749, sp_750, sp_751, sp_756,
             sp_766, sp_767, sp_768, sp_859, sp_879)
          VALUES
            (@sp_731, @sp_732, @sp_733, @sp_737,
             @sp_739, @sp_740, @sp_741, @sp_742, @sp_743,
             @sp_744, @sp_745, @sp_746, @sp_748,
             @sp_749, @sp_750, @sp_751, @sp_756,
             @sp_766, @sp_767, @sp_768, @sp_859, @sp_879)
        `);
      console.log("✅ BOOKING SAVE — rh_sp_73 insert OK");
    } catch (sp73Err) {
      console.error("❌ BOOKING SAVE — rh_sp_73 insert error:", sp73Err.message);
      return res.status(500).json({
        success: false,
        message: "Docket insert failed: " + sp73Err.message,
      });
    }

    console.log("✅ BOOKING SAVED — customer:", name, "custUnq:", custUnq);
    return res.json({ success: true, message: "Booking request saved successfully", custUnq });

  } catch (err) {
    console.error("❌ BOOKING SAVE ERROR:", err.message);
    console.error("   Stack:", err.stack);
    return res.status(500).json({ success: false, message: err.message || "Server Error" });
  }
});

module.exports = router;
