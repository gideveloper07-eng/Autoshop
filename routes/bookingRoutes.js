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
  const forwardedFor = req.headers["x-forwarded-for"];
  const rawIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0] ||
      req.headers["x-real-ip"] ||
      req.headers["cf-connecting-ip"] ||
      req.socket?.remoteAddress ||
      req.ip ||
      "";
  return String(rawIp).replace(/^::ffff:/, "").trim();
}

function str(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/booking/save
//
// Step 1 — Insert account master via A_SP_FOR_ACCOUNTMASTER @what='insert'
//           (maps to rh_m1 — customer record)
// Step 2 — Insert docket row into rh_sp_73
//           (all 18 booking fields mapped per user spec)
//
// Body fields:
//   title, name, fatherName, emailId, address,
//   state, cityUnq, areaUnq, zip, mobileNo, gstin,
//   birthAnniversary, marriageAnniversary, aadharNo,
//   modelUnq, variantUnq, colourUnq, scUnq
// ─────────────────────────────────────────────────────────────────────────────
router.post("/save", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { currentDatabase: databaseName, userId } = decoded;
    if (!databaseName) {
      return res
        .status(400)
        .json({ success: false, message: "Database not found in token" });
    }

    const {
      title        = "",
      name         = "",
      fatherName   = "",
      emailId      = "",
      address      = "",
      state        = "",
      cityUnq      = "",
      areaUnq      = "",
      zip          = "",
      mobileNo     = "",
      gstin        = "",
      birthAnniversary    = "",
      marriageAnniversary = "",
      aadharNo     = "",
      modelUnq     = "",
      variantUnq   = "",
      colourUnq    = "",
      scUnq        = "",
    } = req.body;

    const clientIp = getClientIp(req);
    const uid      = str(userId);

    console.log("💾 BOOKING SAVE — DB:", databaseName, "customer:", name);

    pool = await openPool(databaseName);

    // ── Step 1: Insert account master (A_SP_FOR_ACCOUNTMASTER @what='insert') ──
    // Mirrors the C# acsave() function from the user's reference exactly:
    //   @m1_10 = '579831_'  (schedule code for CUST)
    //   @m1_52 = '0.00'     (opening balance)
    //   m1_49 is auto-set by SP from prsch_11 of the schedule
    const acResult = await pool
      .request()
      .input("prefix",     sql.NVarChar(50),  "rh_")
      .input("what",       sql.NVarChar(20),  "insert")
      .input("m1_1",       sql.NVarChar(50),  "")           // entry date — SP uses getutcdate()
      .input("m1_2",       sql.NVarChar(50),  "")           // unqid — SP generates NEWID()
      .input("m1_3",       sql.NVarChar(50),  uid)          // userid
      .input("m1_4",       sql.NVarChar(50),  clientIp)     // ipadd
      .input("m1_5",       sql.NVarChar(50),  "")
      .input("m1_6",       sql.NVarChar(50),  "")
      .input("m1_7",       sql.NVarChar(500), str(name))    // name of a/c head
      .input("m1_8",       sql.NVarChar(500), str(name))    // name to be printed
      .input("m1_9",       sql.NVarChar(50),  "C")          // Debit/Credit = C for customer
      .input("m1_10",      sql.NVarChar(50),  "579831_")    // schedule — CUST type
      .input("m1_11",      sql.NVarChar(500), str(address)) // add1
      .input("m1_12",      sql.NVarChar(500), "")
      .input("m1_13",      sql.NVarChar(50),  str(cityUnq)) // city (unq)
      .input("m1_14",      sql.NVarChar(50),  str(state))   // state
      .input("m1_15",      sql.NVarChar(50),  "INDIA")
      .input("m1_16",      sql.NVarChar(50),  str(zip))     // zipcode
      .input("m1_17",      sql.NVarChar(50),  "")
      .input("m1_18",      sql.NVarChar(50),  "")
      .input("m1_19",      sql.NVarChar(50),  "")
      .input("m1_20",      sql.NVarChar(50),  "")
      .input("m1_21",      sql.NVarChar(50),  "")
      .input("m1_22",      sql.NVarChar(50),  "")
      .input("m1_23",      sql.NVarChar(50),  "")
      .input("m1_24",      sql.NVarChar(50),  "")
      .input("m1_25",      sql.NVarChar(50),  "")
      .input("m1_26",      sql.NVarChar(50),  str(emailId)) // email1
      .input("m1_27",      sql.NVarChar(50),  "")
      .input("m1_28",      sql.NVarChar(50),  "")
      .input("m1_29",      sql.NVarChar(50),  "")
      .input("m1_30",      sql.NVarChar(50),  "")
      .input("m1_31",      sql.NVarChar(50),  "")
      .input("m1_32",      sql.NVarChar(50),  "")
      .input("m1_33",      sql.NVarChar(50),  "")
      .input("m1_34",      sql.NVarChar(50),  "")
      .input("m1_35",      sql.NVarChar(50),  "")           // dob
      .input("m1_36",      sql.NVarChar(50),  "")           // doa
      .input("m1_37",      sql.NVarChar(50),  str(gstin))   // gstin
      .input("m1_38",      sql.NVarChar(50),  "")
      .input("m1_39",      sql.NVarChar(50),  "")
      .input("m1_40",      sql.NVarChar(50),  "")           // pan
      .input("m1_41",      sql.NVarChar(50),  "")
      .input("m1_42",      sql.NVarChar(50),  "")
      .input("m1_43",      sql.NVarChar(50),  "")
      .input("m1_44",      sql.NVarChar(50),  "")
      .input("m1_45",      sql.NVarChar(50),  "")
      .input("m1_46",      sql.NVarChar(50),  "")
      .input("m1_47",      sql.NVarChar(50),  str(mobileNo))// mobileno
      .input("m1_48",      sql.NVarChar(50),  str(aadharNo))// aadhar card no
      .input("m1_49",      sql.NVarChar(50),  "CUST")       // schtype
      .input("m1_50",      sql.NVarChar(50),  str(fatherName))// fathername
      .input("m1_51",      sql.NVarChar(50),  str(title))   // title
      .input("m1_52",      sql.NVarChar(50),  "0.00")       // opening balance
      .input("m1_53",      sql.NVarChar(50),  "")           // prefix/branch
      .input("m1_54",      sql.NVarChar(50),  str(areaUnq)) // area (unq)
      .input("m1_55",      sql.NVarChar(50),  "")
      .input("likeclause", sql.NVarChar(50),  "")
      .input("pageno",     sql.NVarChar(50),  "")
      .input("Err",        sql.NVarChar(50),  "0")
      .execute("A_SP_FOR_ACCOUNTMASTER");

    // SP returns 3 result sets: [0] = err check, [1] = "save" confirm, [2] = "save"
    // First recordset contains either "This Name Is Already Exists" or "0"
    const errRow  = acResult.recordsets?.[0]?.[0];
    const errVal  = str(errRow?.err ?? errRow?.Err ?? "0");

    if (errVal && errVal !== "0" && !errVal.toLowerCase().startsWith("save")) {
      return res.status(400).json({ success: false, message: errVal });
    }

    // Fetch the newly created m1_2 (unqid) for the inserted customer
    const unqRow    = await pool
      .request()
      .input("prefix",     sql.NVarChar(50), "rh_")
      .input("what",       sql.NVarChar(20), "getunqid")
      .input("m1_1",       sql.NVarChar(50), "")
      .input("m1_2",       sql.NVarChar(50), "")
      .input("m1_3",       sql.NVarChar(50), "")
      .input("m1_4",       sql.NVarChar(50), "")
      .input("m1_5",       sql.NVarChar(50), "")
      .input("m1_6",       sql.NVarChar(50), "")
      .input("m1_7",       sql.NVarChar(500), str(name))  // used by SP to look up unqid
      .input("m1_8",       sql.NVarChar(500), "")
      .input("m1_9",       sql.NVarChar(50), "")
      .input("m1_10",      sql.NVarChar(50), "")
      .input("m1_11",      sql.NVarChar(500), "")
      .input("m1_12",      sql.NVarChar(500), "")
      .input("m1_13",      sql.NVarChar(50), "")
      .input("m1_14",      sql.NVarChar(50), "")
      .input("m1_15",      sql.NVarChar(50), "")
      .input("m1_16",      sql.NVarChar(50), "")
      .input("m1_17",      sql.NVarChar(50), "")
      .input("m1_18",      sql.NVarChar(50), "")
      .input("m1_19",      sql.NVarChar(50), "")
      .input("m1_20",      sql.NVarChar(50), "")
      .input("m1_21",      sql.NVarChar(50), "")
      .input("m1_22",      sql.NVarChar(50), "")
      .input("m1_23",      sql.NVarChar(50), "")
      .input("m1_24",      sql.NVarChar(50), "")
      .input("m1_25",      sql.NVarChar(50), "")
      .input("m1_26",      sql.NVarChar(50), "")
      .input("m1_27",      sql.NVarChar(50), "")
      .input("m1_28",      sql.NVarChar(50), "")
      .input("m1_29",      sql.NVarChar(50), "")
      .input("m1_30",      sql.NVarChar(50), "")
      .input("m1_31",      sql.NVarChar(50), "")
      .input("m1_32",      sql.NVarChar(50), "")
      .input("m1_33",      sql.NVarChar(50), "")
      .input("m1_34",      sql.NVarChar(50), "")
      .input("m1_35",      sql.NVarChar(50), "")
      .input("m1_36",      sql.NVarChar(50), "")
      .input("m1_37",      sql.NVarChar(50), "")
      .input("m1_38",      sql.NVarChar(50), "")
      .input("m1_39",      sql.NVarChar(50), "")
      .input("m1_40",      sql.NVarChar(50), "")
      .input("m1_41",      sql.NVarChar(50), "")
      .input("m1_42",      sql.NVarChar(50), "")
      .input("m1_43",      sql.NVarChar(50), "")
      .input("m1_44",      sql.NVarChar(50), "")
      .input("m1_45",      sql.NVarChar(50), "")
      .input("m1_46",      sql.NVarChar(50), "")
      .input("m1_47",      sql.NVarChar(50), "")
      .input("m1_48",      sql.NVarChar(50), "")
      .input("m1_49",      sql.NVarChar(50), "")
      .input("m1_50",      sql.NVarChar(50), "")
      .input("m1_51",      sql.NVarChar(50), "")
      .input("m1_52",      sql.NVarChar(50), "")
      .input("m1_53",      sql.NVarChar(50), "")
      .input("m1_54",      sql.NVarChar(50), "")
      .input("m1_55",      sql.NVarChar(50), "")
      .input("likeclause", sql.NVarChar(50), "")
      .input("pageno",     sql.NVarChar(50), "")
      .input("Err",        sql.NVarChar(50), "0")
      .execute("A_SP_FOR_ACCOUNTMASTER");

    const custUnq = str(unqRow.recordset?.[0]?.unqid ?? "");

    if (!custUnq) {
      console.warn("⚠️  BOOKING SAVE — could not retrieve customer unqid after insert");
    }

    // ── Step 2: Insert docket row into rh_sp_73 ──────────────────────────────
    // Field mapping per user spec:
    //   sp_739  = Title            sp_740  = Customer unqid (from step 1)
    //   sp_879  = Father's Name    sp_744  = Email ID
    //   sp_741  = Address          sp_859  = State
    //   sp_742  = City unq         sp_743  = Area unq
    //   sp_768  = Zip              sp_745  = Mobile No
    //   sp_748  = GSTIN            sp_766  = Birth Anniversary
    //   sp_767  = Marriage Anniversary     sp_746  = Aadhar No
    //   sp_749  = Model unq        sp_750  = Variant unq
    //   sp_751  = Colour unq       sp_756  = SC unq
    await pool
      .request()
      .input("sp_739",  sql.NVarChar(50),  str(title))
      .input("sp_740",  sql.NVarChar(50),  custUnq)
      .input("sp_879",  sql.NVarChar(500), str(fatherName))
      .input("sp_744",  sql.NVarChar(50),  str(emailId))
      .input("sp_741",  sql.NVarChar(500), str(address))
      .input("sp_859",  sql.NVarChar(50),  str(state))
      .input("sp_742",  sql.NVarChar(50),  str(cityUnq))
      .input("sp_743",  sql.NVarChar(50),  str(areaUnq))
      .input("sp_768",  sql.NVarChar(50),  str(zip))
      .input("sp_745",  sql.NVarChar(50),  str(mobileNo))
      .input("sp_748",  sql.NVarChar(50),  str(gstin))
      .input("sp_766",  sql.NVarChar(50),  str(birthAnniversary))
      .input("sp_767",  sql.NVarChar(50),  str(marriageAnniversary))
      .input("sp_746",  sql.NVarChar(50),  str(aadharNo))
      .input("sp_749",  sql.NVarChar(50),  str(modelUnq))
      .input("sp_750",  sql.NVarChar(50),  str(variantUnq))
      .input("sp_751",  sql.NVarChar(50),  str(colourUnq))
      .input("sp_756",  sql.NVarChar(50),  str(scUnq))
      .input("sp_737",  sql.NVarChar(50),  uid)           // created by userid
      .query(`
        INSERT INTO rh_sp_73
          (sp_737, sp_739, sp_740, sp_741, sp_742, sp_743,
           sp_744, sp_745, sp_746, sp_748, sp_749, sp_750,
           sp_751, sp_756, sp_766, sp_767, sp_768, sp_859, sp_879)
        VALUES
          (@sp_737, @sp_739, @sp_740, @sp_741, @sp_742, @sp_743,
           @sp_744, @sp_745, @sp_746, @sp_748, @sp_749, @sp_750,
           @sp_751, @sp_756, @sp_766, @sp_767, @sp_768, @sp_859, @sp_879)
      `);

    console.log("✅ BOOKING SAVED — customer:", name, "custUnq:", custUnq);

    return res.json({
      success: true,
      message: "Booking request saved successfully",
      custUnq,
    });
  } catch (err) {
    console.error("❌ BOOKING SAVE ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

module.exports = router;
