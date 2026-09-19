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
  return String(raw)
    .replace(/^::ffff:/, "")
    .trim();
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
    .input("prefix", sql.NVarChar(50), "rh_")
    .input("what", sql.NVarChar(50), what)
    .input("Rcl_1", sql.NVarChar(50), "")
    .input("Rcl_2", sql.NVarChar(50), "")
    .input("Rcl_3", sql.NVarChar(50), "")
    .input("Rcl_4", sql.NVarChar(50), "")
    .input("Rcl_5", sql.NVarChar(50), "")
    .input("Rcl_6", sql.NVarChar(50), "")
    .input("Rcl_7", sql.NVarChar(50), "")
    .input("Rcl_8", sql.NVarChar(50), "")
    .input("Rcl_9", sql.NVarChar(50), "")
    .input("Rcl_10", sql.NVarChar(50), "")
    .input("Rcl_11", sql.NVarChar(50), "")
    .input("Rcl_12", sql.NVarChar(50), "")
    .input("Rcl_71", sql.NVarChar(50), rcl71)
    .input("Rcl_73", sql.NVarChar(50), "")
    .input("Rcl_77", sql.NVarChar(50), "")
    .input("Rcl_82", sql.NVarChar(50), "")
    .input("Rcl_84", sql.NVarChar(50), "")
    .input("Rcl_85", sql.NVarChar(50), "")
    .input("Rcl_105", sql.NVarChar(50), "")
    .input("pageno", sql.NVarChar(50), "")
    .input("Err", sql.NVarChar(50), "0")
    .execute("A_SP_FOR_Receipt");
}

/**
 * Build a bare A_SP_FOR_ACCOUNTMASTER request with all params defaulted to ''.
 * Caller sets what + any fields they need via .input() chaining — but since we
 * can't chain after this function returns, we instead accept a params map.
 */
function makeAccountMasterRequest(pool, params = {}) {
  const req = pool.request(); // mssql returns all result sets in recordsets[] by default

  const fields = {
    prefix: ["NVarChar", 50, "rh_"],
    what: ["NVarChar", 20, ""],
    m1_1: ["NVarChar", 50, ""],
    m1_2: ["NVarChar", 50, ""],
    m1_3: ["NVarChar", 50, ""],
    m1_4: ["NVarChar", 50, ""],
    m1_5: ["NVarChar", 50, ""],
    m1_6: ["NVarChar", 50, ""],
    m1_7: ["NVarChar", 500, ""],
    m1_8: ["NVarChar", 500, ""],
    m1_9: ["NVarChar", 50, ""],
    m1_10: ["NVarChar", 50, ""],
    m1_11: ["NVarChar", 500, ""],
    m1_12: ["NVarChar", 500, ""],
    m1_13: ["NVarChar", 50, ""],
    m1_14: ["NVarChar", 50, ""],
    m1_15: ["NVarChar", 50, ""],
    m1_16: ["NVarChar", 50, ""],
    m1_17: ["NVarChar", 50, ""],
    m1_18: ["NVarChar", 50, ""],
    m1_19: ["NVarChar", 50, ""],
    m1_20: ["NVarChar", 50, ""],
    m1_21: ["NVarChar", 50, ""],
    m1_22: ["NVarChar", 50, ""],
    m1_23: ["NVarChar", 50, ""],
    m1_24: ["NVarChar", 50, ""],
    m1_25: ["NVarChar", 50, ""],
    m1_26: ["NVarChar", 50, ""],
    m1_27: ["NVarChar", 50, ""],
    m1_28: ["NVarChar", 50, ""],
    m1_29: ["NVarChar", 50, ""],
    m1_30: ["NVarChar", 50, ""],
    m1_31: ["NVarChar", 50, ""],
    m1_32: ["NVarChar", 50, ""],
    m1_33: ["NVarChar", 50, ""],
    m1_34: ["NVarChar", 50, ""],
    m1_35: ["NVarChar", 50, ""],
    m1_36: ["NVarChar", 50, ""],
    m1_37: ["NVarChar", 50, ""],
    m1_38: ["NVarChar", 50, ""],
    m1_39: ["NVarChar", 50, ""],
    m1_40: ["NVarChar", 50, ""],
    m1_41: ["NVarChar", 50, ""],
    m1_42: ["NVarChar", 50, ""],
    m1_43: ["NVarChar", 50, ""],
    m1_44: ["NVarChar", 50, ""],
    m1_45: ["NVarChar", 50, ""],
    m1_46: ["NVarChar", 50, ""],
    m1_47: ["NVarChar", 50, ""],
    m1_48: ["NVarChar", 50, ""],
    m1_49: ["NVarChar", 50, ""],
    m1_50: ["NVarChar", 50, ""],
    m1_51: ["NVarChar", 50, ""],
    m1_52: ["NVarChar", 50, ""],
    m1_53: ["NVarChar", 50, ""],
    m1_54: ["NVarChar", 50, ""],
    m1_55: ["NVarChar", 50, ""],
    likeclause: ["NVarChar", 50, ""],
    pageno: ["NVarChar", 50, ""],
    Err: ["NVarChar", 50, "0"],
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
      return res
        .status(400)
        .json({ success: false, message: "Database not found in token" });

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
        states: stateRes.recordset || [],
        cities: cityRes.recordset || [],
        areas: areaRes.recordset || [],
        models: modelRes.recordset || [],
        colours: colorRes.recordset || [],
        scNames: staffRes.recordset || [],
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
      return res
        .status(400)
        .json({ success: false, message: "Database not found in token" });

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/booking/save
//
// Step 1 — A_SP_FOR_ACCOUNTMASTER @what='insert'  → inserts into rh_m1
// Step 2 — A_SP_FOR_ACCOUNTMASTER @what='getunqid' → fetch new m1_2 (custUnq)
// Step 3 — INSERT INTO rh_sp_73   → docket row with all 18 booking fields
// ─────────────────────────────────────────────────────────────────────────────
// ============================================================
// NEW BOOKING SAVE API
// ============================================================
// IMPORTANT:
// - Existing /save API is NOT modified.
// - Existing stored procedures are NOT modified.
// - Flutter new API calls: /api/booking/save-new
// ============================================================

router.post("/save-new", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { currentDatabase: databaseName, userId } = decoded;

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    const {
      title = "",
      name = "",
      fatherName = "",
      emailId = "",
      address = "",
      state = "",
      cityUnq = "",
      areaUnq = "",
      zip = "",
      mobileNo = "",
      gstin = "",
      birthAnniversary = "",
      marriageAnniversary = "",
      aadharNo = "",
      modelUnq = "",
      variantUnq = "",
      colourUnq = "",
      scUnq = "",
    } = req.body;

    const clientIp = getClientIp(req);
    const uid = str(userId);

    console.log("==============================================");

    console.log("💾 NEW BOOKING SAVE");

    console.log("==============================================");

    console.log("Database :", databaseName);
    console.log("Customer :", name);
    console.log("Mobile   :", mobileNo);
    console.log("Model    :", modelUnq);
    console.log("Variant  :", variantUnq);
    console.log("Colour   :", colourUnq);
    console.log("SC       :", scUnq);

    console.log("==============================================");

    pool = await openPool(databaseName);

    // ========================================================
    // STEP 1
    // Insert customer into Account Master
    //
    // Existing stored procedure is NOT modified.
    // ========================================================

    let acResult;

    try {
      acResult = await makeAccountMasterRequest(pool, {
        what: "insert",

        m1_3: uid,
        m1_4: clientIp,

        m1_7: str(name),
        m1_8: str(name),

        m1_9: "C",
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
      console.error(
        "❌ NEW BOOKING — A_SP_FOR_ACCOUNTMASTER INSERT ERROR:",
        spErr.message,
      );

      return res.status(500).json({
        success: false,
        message: "Account master insert failed: " + spErr.message,
      });
    }

    // ========================================================
    // Check Account Master response
    // ========================================================

    const errRow = acResult.recordsets?.[0]?.[0];

    const errVal = str(errRow?.err ?? errRow?.Err ?? "0");

    console.log(
      "🔍 ACCOUNT MASTER RESULT:",
      JSON.stringify(acResult.recordsets?.[0]),
    );

    if (errVal && errVal !== "0" && !errVal.toLowerCase().startsWith("save")) {
      return res.status(400).json({
        success: false,
        message: errVal,
      });
    }

    // ========================================================
    // STEP 2
    // Get customer UNQID
    // ========================================================

    let custUnq = "";

    try {
      const unqResult = await makeAccountMasterRequest(pool, {
        what: "getunqid",
        m1_7: str(name),
      });

      custUnq = str(unqResult.recordset?.[0]?.unqid ?? "");

      console.log("🔍 CUSTOMER UNQID:", custUnq);
    } catch (unqErr) {
      console.error("❌ GET CUSTOMER UNQID ERROR:", unqErr.message);

      return res.status(500).json({
        success: false,
        message: "Unable to get customer UNQID: " + unqErr.message,
      });
    }

    if (!custUnq) {
      return res.status(500).json({
        success: false,
        message: "Customer UNQID was not generated.",
      });
    }

    // ========================================================
    // STEP 3
    // DIRECT INSERT INTO rh_sp_73
    //
    // IMPORTANT:
    // DO NOT call A_SP_FOR_Docket here.
    //
    // DO NOT use OUTPUT here because rh_sp_73
    // has an enabled trigger.
    // ========================================================

    try {
      await // ====================================================
      // DIRECT INSERT
      // ====================================================

      pool
        .request()

        // ----------------------------------------------------
        // User / customer parameters
        // ----------------------------------------------------

        .input("uid", sql.NVarChar(100), uid)

        .input("clientIp", sql.NVarChar(100), clientIp)

        .input("title", sql.NVarChar(100), str(title))

        .input("custUnq", sql.NVarChar(100), custUnq)

        .input("name", sql.NVarChar(200), str(name))

        .input("fatherName", sql.NVarChar(100), str(fatherName))

        .input("emailId", sql.NVarChar(100), str(emailId))

        .input("address", sql.NVarChar(sql.MAX), str(address))

        .input("state", sql.NVarChar(100), str(state))

        .input("cityUnq", sql.NVarChar(100), str(cityUnq))

        .input("areaUnq", sql.NVarChar(100), str(areaUnq))

        .input("zip", sql.NVarChar(100), str(zip))

        .input("mobileNo", sql.NVarChar(100), str(mobileNo))

        .input("gstin", sql.NVarChar(100), str(gstin))

        .input("aadharNo", sql.NVarChar(100), str(aadharNo))

        .input("modelUnq", sql.NVarChar(100), str(modelUnq))

        .input("variantUnq", sql.NVarChar(100), str(variantUnq))

        .input("colourUnq", sql.NVarChar(100), str(colourUnq))

        .input("scUnq", sql.NVarChar(100), str(scUnq))

        .input("birthAnniversary", sql.NVarChar(50), str(birthAnniversary))

        .input(
          "marriageAnniversary",
          sql.NVarChar(50),
          str(marriageAnniversary),
        ).query(`
          INSERT INTO dbo.rh_sp_73
          (
            sp_731,
            sp_732,
            sp_733,
            sp_734,
            sp_735,
            sp_736,
            sp_737,
            sp_738,
            sp_739,
            sp_740,
            sp_741,
            sp_742,
            sp_743,
            sp_744,
            sp_745,
            sp_746,
            sp_747,
            sp_748,
            sp_749,
            sp_750,
            sp_751,
            sp_752,
            sp_753,
            sp_754,
            sp_755,
            sp_756,
            sp_757,
            sp_758,
            sp_759,
            sp_760,
            sp_761,
            sp_762,
            sp_763,
            sp_764,
            sp_765,
            sp_766,
            sp_767,
            sp_768,
            sp_859,
            sp_879
          )
          VALUES
          (
            GETDATE(),

            NEWID(),

            @uid,

            @clientIp,

            NULL,

            NULL,

            GETDATE(),

            ISNULL(
              (
                SELECT
                  MAX(
                    CAST(
                      sp_738 AS numeric(18,0)
                    )
                  )
                FROM dbo.rh_sp_73
                WHERE ISNUMERIC(sp_738) = 1
              ),
              0
            ) + 1,

            @title,

            @custUnq,

            @address,

            @cityUnq,

            @areaUnq,

            @emailId,

            @mobileNo,

            @aadharNo,

            N'',

            @gstin,

            @modelUnq,

            @variantUnq,

            @colourUnq,

            0,

            N'',

            N'',

            N'',

            @scUnq,

            N'',

            N'',

            @name,

            NULL,

            @name,

            N'',

            N'',

            N'',

            N'',

            TRY_CONVERT(
              datetime,
              NULLIF(
                @birthAnniversary,
                N''
              ),
              103
            ),

            TRY_CONVERT(
              datetime,
              NULLIF(
                @marriageAnniversary,
                N''
              ),
              103
            ),

            @zip,

            @state,

            @fatherName
          );
        `);

      // ======================================================
      // SUCCESS
      // ======================================================

      console.log("==============================================");

      console.log("✅ NEW BOOKING INSERT SUCCESS");

      console.log("Customer UNQID :", custUnq);

      console.log("==============================================");

      return res.json({
        success: true,
        message: "Booking request saved successfully",
        custUnq: custUnq,
      });
    } catch (insertErr) {
      console.error(
        "❌ NEW BOOKING — rh_sp_73 INSERT ERROR:",
        insertErr.message,
      );

      console.error("❌ SQL ERROR DETAILS:", insertErr);

      return res.status(500).json({
        success: false,
        message: "Booking insert failed: " + insertErr.message,
      });
    }
  } catch (err) {
    console.error("❌ NEW BOOKING SAVE ERROR:", err.message);

    console.error("❌ STACK:", err.stack);

    return res.status(500).json({
      success: false,
      message: err.message || "Server Error",
    });
  }
});

module.exports = router;
