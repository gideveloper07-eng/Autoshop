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

    console.log("💾 NEW BOOKING SAVE — DB:", databaseName, "customer:", name);

    pool = await openPool(databaseName);

    // ========================================================
    // STEP 1
    // Insert customer into Account Master
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
        "❌ NEW BOOKING — A_SP_FOR_ACCOUNTMASTER insert error:",
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
      "🔍 NEW BOOKING — Account Master result:",
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

      console.log("🔍 NEW BOOKING — Customer UNQID:", custUnq);
    } catch (unqErr) {
      console.warn("⚠️ NEW BOOKING — getunqid error:", unqErr.message);
    }

    // ========================================================
    // STEP 3
    // Insert booking/docket
    // ========================================================

    const today = new Date().toISOString().slice(0, 10);

    try {
      await pool
        .request()

        .input("prefix", sql.NVarChar(50), "rh_")

        .input("what", sql.NVarChar(50), "insert")

        // ----------------------------------------------------
        // Basic booking information
        // ----------------------------------------------------

        .input("sp_731", sql.NVarChar(50), today)

        .input("sp_732", sql.NVarChar(50), "")

        .input("sp_733", sql.NVarChar(50), uid)

        .input("sp_734", sql.NVarChar(50), clientIp)

        .input("sp_735", sql.NVarChar(50), "")

        .input("sp_736", sql.NVarChar(50), "")

        .input("sp_737", sql.NVarChar(50), today)

        .input("sp_738", sql.NVarChar(50), "")

        .input("sp_739", sql.NVarChar(50), str(title))

        .input("sp_740", sql.NVarChar(50), custUnq)

        .input("sp_741", sql.NVarChar(sql.MAX), str(address))

        .input("sp_742", sql.NVarChar(50), str(cityUnq))

        .input("sp_743", sql.NVarChar(50), str(areaUnq))

        .input("sp_744", sql.NVarChar(50), str(emailId))

        .input("sp_745", sql.NVarChar(50), str(mobileNo))

        .input("sp_746", sql.NVarChar(50), str(aadharNo))

        .input("sp_747", sql.NVarChar(50), "")

        .input("sp_748", sql.NVarChar(50), str(gstin))

        .input("sp_749", sql.NVarChar(50), str(modelUnq))

        .input("sp_750", sql.NVarChar(50), str(variantUnq))

        .input("sp_751", sql.NVarChar(50), str(colourUnq))

        .input("sp_752", sql.NVarChar(50), "")

        .input("sp_753", sql.NVarChar(sql.MAX), "")

        .input("sp_754", sql.NVarChar(sql.MAX), "")

        .input("sp_755", sql.NVarChar(sql.MAX), "")

        .input("sp_756", sql.NVarChar(50), str(scUnq))

        .input("sp_757", sql.NVarChar(50), "")

        .input("sp_758", sql.NVarChar(50), "")

        .input("sp_759", sql.NVarChar(50), str(name))

        .input("sp_760", sql.NVarChar(50), "")

        .input("sp_761", sql.NVarChar(50), str(name))

        .input("sp_762", sql.NVarChar(50), "")

        .input("sp_763", sql.NVarChar(50), "")

        .input("sp_764", sql.NVarChar(50), "")

        .input("sp_765", sql.NVarChar(50), "")

        // ----------------------------------------------------
        // Birth / Anniversary / Zip
        // ----------------------------------------------------

        .input("sp_766", sql.NVarChar(50), str(birthAnniversary))

        .input("sp_767", sql.NVarChar(50), str(marriageAnniversary))

        .input("sp_768", sql.NVarChar(50), str(zip))

        // ----------------------------------------------------
        // Remaining parameters
        // ----------------------------------------------------

        .input("sp_769", sql.NVarChar(50), "")
        .input("sp_770", sql.NVarChar(50), "")
        .input("sp_771", sql.NVarChar(50), "")
        .input("sp_772", sql.NVarChar(50), "")
        .input("sp_773", sql.NVarChar(50), "")
        .input("sp_774", sql.NVarChar(50), "")
        .input("sp_775", sql.NVarChar(50), "")
        .input("sp_776", sql.NVarChar(50), "")
        .input("sp_777", sql.NVarChar(50), "")
        .input("sp_778", sql.NVarChar(50), "")
        .input("sp_779", sql.NVarChar(50), "")
        .input("sp_780", sql.NVarChar(50), "")
        .input("sp_781", sql.NVarChar(50), "")
        .input("sp_782", sql.NVarChar(50), "")
        .input("sp_783", sql.NVarChar(50), "")
        .input("sp_784", sql.NVarChar(50), "")
        .input("sp_785", sql.NVarChar(50), "")
        .input("sp_786", sql.NVarChar(50), "")
        .input("sp_787", sql.NVarChar(50), "")
        .input("sp_788", sql.NVarChar(50), "")
        .input("sp_789", sql.NVarChar(50), "")
        .input("sp_790", sql.NVarChar(50), "")
        .input("sp_791", sql.NVarChar(50), "")
        .input("sp_792", sql.NVarChar(50), "")
        .input("sp_793", sql.NVarChar(50), "")
        .input("sp_794", sql.NVarChar(50), "")
        .input("sp_795", sql.NVarChar(50), "")
        .input("sp_796", sql.NVarChar(50), "")
        .input("sp_797", sql.NVarChar(50), "")
        .input("sp_798", sql.NVarChar(50), "")
        .input("sp_799", sql.NVarChar(50), "")
        .input("sp_800", sql.NVarChar(50), "")
        .input("sp_801", sql.NVarChar(50), "")
        .input("sp_802", sql.NVarChar(50), "")
        .input("sp_803", sql.NVarChar(50), "")
        .input("sp_804", sql.NVarChar(50), "")
        .input("sp_805", sql.NVarChar(50), "")
        .input("sp_806", sql.NVarChar(50), "")
        .input("sp_807", sql.NVarChar(50), "")
        .input("sp_808", sql.NVarChar(50), "")
        .input("sp_809", sql.NVarChar(50), "")
        .input("sp_810", sql.NVarChar(50), "")
        .input("sp_811", sql.NVarChar(50), "")
        .input("sp_812", sql.NVarChar(50), "")
        .input("sp_813", sql.NVarChar(50), "")
        .input("sp_814", sql.NVarChar(50), "")
        .input("sp_815", sql.NVarChar(50), "")
        .input("sp_816", sql.NVarChar(50), "")
        .input("sp_817", sql.NVarChar(50), "")
        .input("sp_818", sql.NVarChar(50), "")
        .input("sp_819", sql.NVarChar(50), "")
        .input("sp_820", sql.NVarChar(50), "")
        .input("sp_821", sql.NVarChar(50), "")
        .input("sp_822", sql.NVarChar(50), "")
        .input("sp_823", sql.NVarChar(50), "")
        .input("sp_824", sql.NVarChar(50), "")
        .input("sp_825", sql.NVarChar(50), "")
        .input("sp_826", sql.NVarChar(50), "")
        .input("sp_827", sql.NVarChar(50), "")
        .input("sp_828", sql.NVarChar(50), "")
        .input("sp_829", sql.NVarChar(50), "")
        .input("sp_830", sql.NVarChar(50), "")
        .input("sp_831", sql.NVarChar(50), "")
        .input("sp_832", sql.NVarChar(50), "")
        .input("sp_833", sql.NVarChar(50), "")
        .input("sp_834", sql.NVarChar(50), "")
        .input("sp_835", sql.NVarChar(50), "")
        .input("sp_836", sql.NVarChar(50), "")
        .input("sp_837", sql.NVarChar(50), "")
        .input("sp_838", sql.NVarChar(50), "")
        .input("sp_839", sql.NVarChar(50), "")
        .input("sp_840", sql.NVarChar(50), "")
        .input("sp_841", sql.NVarChar(50), "")
        .input("sp_842", sql.NVarChar(50), "")
        .input("sp_843", sql.NVarChar(50), "")
        .input("sp_844", sql.NVarChar(50), "")
        .input("sp_845", sql.NVarChar(50), "")
        .input("sp_846", sql.NVarChar(50), "")
        .input("sp_847", sql.NVarChar(50), "")
        .input("sp_848", sql.NVarChar(50), "")
        .input("sp_849", sql.NVarChar(50), "")
        .input("sp_850", sql.NVarChar(50), "")
        .input("sp_851", sql.NVarChar(50), "")
        .input("sp_852", sql.NVarChar(50), "")
        .input("sp_853", sql.NVarChar(50), "")
        .input("sp_854", sql.NVarChar(50), "")
        .input("sp_855", sql.NVarChar(50), "")
        .input("sp_856", sql.NVarChar(50), "")
        .input("sp_857", sql.NVarChar(50), "")
        .input("sp_858", sql.NVarChar(50), "")

        .input("sp_859", sql.NVarChar(50), str(state))

        .input("sp_860", sql.NVarChar(50), "")
        .input("sp_861", sql.NVarChar(50), "")
        .input("sp_862", sql.NVarChar(50), "")
        .input("sp_863", sql.NVarChar(50), "")
        .input("sp_864", sql.NVarChar(50), "")
        .input("sp_865", sql.NVarChar(50), "")
        .input("sp_866", sql.NVarChar(50), "")
        .input("sp_867", sql.NVarChar(50), "")
        .input("sp_868", sql.NVarChar(50), "")
        .input("sp_869", sql.NVarChar(50), "")
        .input("sp_870", sql.NVarChar(50), "")
        .input("sp_871", sql.NVarChar(50), "")
        .input("sp_872", sql.NVarChar(50), "")
        .input("sp_873", sql.NVarChar(50), "")
        .input("sp_874", sql.NVarChar(50), "")
        .input("sp_875", sql.NVarChar(50), "")
        .input("sp_876", sql.NVarChar(50), "")
        .input("sp_877", sql.NVarChar(50), "")
        .input("sp_878", sql.NVarChar(50), "")

        .input("sp_879", sql.NVarChar(50), str(fatherName))

        // ----------------------------------------------------
        // Child table parameters
        // ----------------------------------------------------

        .input("sp_73_1_1", sql.NVarChar(50), "")
        .input("sp_73_1_2", sql.NVarChar(50), "")
        .input("sp_73_1_3", sql.NVarChar(50), "")
        .input("sp_73_1_4", sql.NVarChar(50), "")
        .input("sp_73_1_5", sql.NVarChar(50), "")
        .input("sp_73_1_6", sql.NVarChar(50), "")

        .input("sp_73_2_1", sql.NVarChar(50), "")
        .input("sp_73_2_2", sql.NVarChar(50), "")
        .input("sp_73_2_3", sql.NVarChar(50), "")
        .input("sp_73_2_4", sql.NVarChar(50), "")
        .input("sp_73_2_5", sql.NVarChar(50), "")

        .execute("A_SP_FOR_Docket");

      console.log("✅ NEW BOOKING SAVE — A_SP_FOR_Docket insert OK");
    } catch (sp73Err) {
      console.error(
        "❌ NEW BOOKING SAVE — Docket insert error:",
        sp73Err.message,
      );

      return res.status(500).json({
        success: false,
        message: "Docket insert failed: " + sp73Err.message,
      });
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log("✅ NEW BOOKING SAVED — customer:", name, "custUnq:", custUnq);

    return res.json({
      success: true,
      message: "Booking request saved successfully",
      custUnq: custUnq,
    });
  } catch (err) {
    console.error("❌ NEW BOOKING SAVE ERROR:", err.message);

    console.error("   Stack:", err.stack);

    return res.status(500).json({
      success: false,
      message: err.message || "Server Error",
    });
  }
});

module.exports = router;
