const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const sql = require("mssql");
const { createNotification } = require("../utils/notificationHelper");
const {
  sendPushNotification,
  sendPushToGroup,
} = require("../utils/pushNotificationHelper");
const openPool = require("../utils/dynamicPoolManager");
// ─────────────────────────────────────────────────────────────────────────────
// Helper: open a dynamic pool to a specific database (same pattern as authController)
// ─────────────────────────────────────────────────────────────────────────────

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

  return String(rawIp)
    .replace(/^::ffff:/, "")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/retail-incentive
// Calls A_SP_FOR_ApplicationChallangrid with @what = 'Retail_Incentive'
// Query param: dateType = 'challan' (default) or 'expected'
// - dateType='challan' → @prefix='1' → Returns date field (Challan Date - sp_467)
// - dateType='expected' → @prefix='' → Returns exdate field (Expected Delivery Date - bo_32)
// ─────────────────────────────────────────────────────────────────────────────
// router.get("/retail-incentive", async (req, res) => {
//   let pool;
//   try {
//     const decoded = decodeToken(req);
//     if (!decoded) {
//       return res.status(401).json({ success: false, message: "Unauthorized" });
//     }

//     const { database: databaseName } = decoded;
//     if (!databaseName) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Database not found in token" });
//     }

//     // Get dateType from query parameter (default: 'challan')
//     const dateType = req.query.dateType || "challan";

//     // Set prefix based on dateType
//     // prefix='1' → IF condition → returns 'date' field (Challan Date)
//     // prefix='' → ELSE condition → returns 'exdate' field (Expected Delivery Date)
//     const prefix = dateType === "challan" ? "1" : "";

//     console.log(
//       "📋 CHALLAN — Retail Incentive — DB:",
//       databaseName,
//       "dateType:",
//       dateType,
//       "prefix:",
//       prefix,
//     );

//     pool = await openPool(databaseName);

//     const result = await pool
//       .request()
//       .input("prefix", sql.NVarChar(50), prefix)
//       .input("what", sql.NVarChar(50), "Retail_Incentive")
//       .input("FromDate", sql.NVarChar(50), "")
//       .input("ToDate", sql.NVarChar(50), "")
//       .execute("A_SP_FOR_ApplicationChallangrid");

//     console.log(`✅ Challan rows returned: ${result.recordset.length}`);

//     return res.json({
//       success: true,
//       data: result.recordset,
//     });
//   } catch (err) {
//     console.error("❌ CHALLAN ERROR:", err.message);
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: err.message,
//     });
//   } finally {
//     if (pool) await pool.close();
//   }
// });
router.get("/retail-incentive", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    console.log("RetailIncentive - Decoded Token:", decoded);

    const { currentDatabase, userId, isAdmin = false } = decoded;

    console.log("database =", decoded.currentDatabase || database);
    console.log("userId =", userId);
    console.log("isAdmin =", isAdmin);

    if (!decoded.currentDatabase) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    const dateType = req.query.dateType || "challan";
    const prefix = dateType === "challan" ? "1" : "";

    console.log(
      "📋 CHALLAN — Retail Incentive",
      "DB:",
      decoded.currentDatabase,
      "User:",
      userId,
      "Admin:",
      isAdmin,
      "dateType:",
      dateType,
    );

    pool = await openPool(decoded.currentDatabase);

    // Get challans from SP
    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), prefix)
      .input("what", sql.NVarChar(50), "Retail_Incentive")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    let challans = result.recordset || [];

    console.log("TOTAL CHALLANS:", challans.length);

    // Admin sees everything
    if (!isAdmin) {
      const memberResult = await pool
        .request()
        .input("userId", sql.NVarChar(100), userId).query(`
          SELECT ChallanId
          FROM MA_ChallanChatMembers
          WHERE UserId = @userId
            AND IsActive = 1
        `);

      const allowedChallans = new Set(
        memberResult.recordset.map((x) => String(x.ChallanId).toUpperCase()),
      );

      challans = challans.filter((c) =>
        allowedChallans.has(String(c.sp_462).toUpperCase()),
      );

      console.log(`FILTERED CHALLANS FOR ${userId}:`, challans.length);
    }

    return res.json({
      success: true,
      data: challans,
    });
  } catch (err) {
    console.error("❌ CHALLAN ERROR:", err.message);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  } finally {
    // if (pool) {
    //   await pool.close();
    // }
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

    const { currentDatabase: databaseName } = decoded;
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
    // if (pool) await pool.close();
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
    // ───────────────── AUTH ─────────────────

    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { currentDatabase: databaseName, userId, utg } = decoded;

    // ───────────────── GROUP SECURITY ─────────────────

    if (utg !== "4848C835-2A09-4A80-A7E2-383C95926C54") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    const data = { ...req.body };

    console.log("LOGIN USER ID :", userId);

    // SAVE APPROVER USER
    data.sp_583 = userId;

    // SAVE CLIENT IP
    data.sp_584 = getClientIp(req);

    // ───────────────── FIELD MAPPING ─────────────────

    const aliasMap = {
      unq: "sp_462",
      date: "sp_467",
      challanno: "sp_468",
      custname: "sp_469",
      model: "sp_470",
      variant: "sp_471",
      color: "sp_472",
      vinno: "sp_473",
      fasttag: "sp_474",
      handlingchrg: "sp_475",
      tcs: "sp_476",
      trc: "sp_477",
      Accessories: "sp_478",
      AdditionalWarranty: "sp_479",
      WarrantyYear: "sp_480",
      WarrantyAmount: "sp_481",
      ExshowRoomPrice: "sp_482",
      Corporateyn: "sp_483",
      Corporateamount: "sp_484",
      Corporategiven: "sp_485",
      Exchangeyn: "sp_486",
      Exchangeamount: "sp_487",
      Exchangegiven: "sp_488",
      Loyalityyn: "sp_489",
      Loyalityamount: "sp_490",
      Loyalitygiven: "sp_491",
      RTORate: "sp_492",
      RTOTaxSurcharge: "sp_493",
      GreenTax: "sp_494",
      RegFee: "sp_495",
      HPN: "sp_496",
      Duplicate: "sp_497",
      SmartCard: "sp_498",
      Other: "sp_499",
      RTOAmount: "sp_500",
      GST: "sp_501",
      CESS: "sp_502",
      subtotal: "sp_503",
      Amount: "sp_504",
      InsuranceAmount: "sp_520",
      netamount: "sp_521",
      lessofallencashmentschemne: "sp_522",
      hypothecation: "sp_523",
      address: "sp_524",
      fathername: "sp_525",
      mobileno: "sp_526",
      aadharcard: "sp_527",
      panno: "sp_528",
      nomineename: "sp_529",
      age: "sp_530",
      relation: "sp_531",
      gstin: "sp_532",
      rtocity: "sp_533",
      rtofrom: "sp_534",
      engineno: "sp_535",
      bankname: "sp_536",
      bankamt: "sp_537",
      title: "sp_538",
      afteridvamt: "sp_539",
      examt: "sp_540",
      afterdisamtamt: "sp_541",
      pacoveramt: "sp_542",
      amtafterpaiddriver: "sp_543",
      addless: "sp_544",
      rcamt: "sp_545",
      bal: "sp_546",
      financetype: "sp_547",
      instype: "sp_548",
      rtoexshow: "sp_549",

      scunq: "sp_550",
      tlunq: "sp_551",
      managunq: "sp_552",
      ep: "sp_553",
      zdamt: "sp_554",
      epamt: "sp_555",
      sgst: "sp_556",
      cgst: "sp_557",
      challantype: "sp_558",
      csdunq: "sp_559",
      insshowroom: "sp_560",
      financeamt: "sp_561",
      branchpfx: "sp_562",
      insunq: "sp_563",
      policy: "sp_564",
      insentry: "sp_565",
      insamt: "sp_566",
      preinsamt: "sp_568",

      ownaccss: "sp_573",
      appdate: "sp_574",
      appid: "sp_571",
      afappdate: "sp_582",

      afappid: "sp_584",
      hmidis: "sp_591",
      odis: "sp_592",
      othercap: "sp_595",
      otheramt: "sp_596",
      fchallan: "sp_593",
      apdate: "sp_582",
      rti: "sp_600",
      rtiamt: "sp_601",
      cm: "sp_602",
      cmamt: "sp_603",

      sp_604: "sp_604",
      hpnp: "sp_605",
      bankdue: "sp_606",
      custdue: "sp_607",
      crecive: "sp_608",
      freceive: "sp_609",
      state_list: "sp_610",
      dealeryn: "sp_611",
      dealeramount: "sp_612",
      dealergiven: "sp_613",

      branchid: "sp_594",
      RSA: "sp_625",
      n2amt: "sp_626",
      n2yn: "sp_627",
      specificno: "sp_628",
      specificamt: "sp_629",
      cngp: "sp_634",
      cngamt: "sp_635",
      scrapper: "sp_653",
      scrappage: "sp_654",
    };

    Object.entries(aliasMap).forEach(([fromKey, toKey]) => {
      if (
        data[toKey] === undefined &&
        data[fromKey] !== undefined &&
        data[fromKey] !== null
      ) {
        data[toKey] = data[fromKey];
      }
    });

    data.sp_614 ??= data["RTO TEMP"];
    data.sp_615 ??= data.NCB;
    data.sp_616 ??= data.REMARK;
    data.sp_617 ??= data.OTHER1;
    data.sp_618 ??= data.OTHER2;
    data.sp_619 ??= data.OTHER3;
    data.sp_620 ??= data.AMOUNT1;
    data.sp_621 ??= data.AMOUNT2;
    data.sp_622 ??= data.AMOUNT3;
    data.sp_623 ??= data.WORKSHOPINVOICENO;
    data.sp_624 ??= data.WORKSHOPINVOICEAMOUNT;

    if (!data.sp_462) {
      return res.status(400).json({
        success: false,
        message: "sp_462 is required",
      });
    }

    console.log(
      "✅ CHALLAN APPROVE — DB:",
      databaseName,
      "sp_462:",
      data.sp_462,
    );

    // ───────────────── DB ─────────────────

    pool = await openPool(databaseName);

    const request = pool.request();

    request.input("prefix", sql.NVarChar(50), "");
    request.input("what", sql.NVarChar(50), "approve");
    request.input("FromDate", sql.NVarChar(50), "");
    request.input("ToDate", sql.NVarChar(50), "");

    for (let i = 461; i <= 654; i++) {
      const key = `sp_${i}`;

      let value = data[key];

      if (value === null || value === undefined) {
        value = "";
      }

      if (Array.isArray(value)) {
        value = value[0] ?? "";
      }

      if (typeof value === "object" && value !== null) {
        value = "";
      }

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
        request.input(key, sql.NVarChar(sql.MAX), String(value));
      } else if (key === "sp_616") {
        request.input(key, sql.NVarChar(500), String(value));
      } else {
        request.input(key, sql.NVarChar(50), String(value));
      }
    }

    // ───────────────── EXECUTE SP ─────────────────

    const result = await request.execute("A_SP_FOR_ApplicationChallangrid");

    // ───────────────── UPDATE IP ─────────────────

    if (data.sp_584) {
      await pool
        .request()
        .input("sp_462", sql.NVarChar(100), String(data.sp_462))
        .input("sp_584", sql.NVarChar(50), String(data.sp_584)).query(`
          UPDATE rh_sp_46
          SET sp_584 = @sp_584
          WHERE sp_462 = @sp_462
        `);
    }

    // ───────────────── NOTIFICATION ─────────────────

    const creatorResult = await pool
      .request()

      .input("sp_462", sql.NVarChar, data.sp_462).query(`
    SELECT sp_463
    FROM rh_sp_46
    WHERE sp_462 = @sp_462
  `);

    const creatorUserId = creatorResult.recordset[0]?.sp_463;

    console.log("CREATOR USER:", creatorUserId);

    if (creatorUserId) {
      console.log("INSERTING NOTIFICATION...");
      await createNotification(
        pool,
        creatorUserId,
        "Challan Approved",
        `Your challan ${data.sp_468} has been approved`,
        "CHALLAN_APPROVED",
        data.sp_462,
      );
      await sendPushNotification(
        pool,

        creatorUserId,

        "Challan Approved",

        `Your challan ${data.sp_468} has been approved`,
      );
      console.log("✅ Notification sent to:", creatorUserId);
    }

    console.log(`✅ Challan approved successfully: ${data.sp_462}`);

    // ───────────────── RESPONSE ─────────────────

    return res.json({
      success: true,
      message: result.recordset?.[0]?.err || "Challan approved successfully",
      data: result.recordset?.[0],
    });
  } catch (err) {
    console.error("❌ CHALLAN APPROVE ERROR:", err.message);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  } finally {
    //if (pool) await pool.close();
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
    // ───────────────── AUTH ─────────────────

    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { currentDatabase: databaseName, userId, utg } = decoded;

    // ───────────────── GROUP SECURITY ─────────────────

    if (utg !== "4848C835-2A09-4A80-A7E2-383C95926C54") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    const data = { ...req.body };

    console.log("LOGIN USER ID :", userId);

    // SAVE REJECT USER
    data.sp_587 = userId;

    // SAVE CLIENT IP
    data.sp_588 = getClientIp(req);

    // ───────────────── FIELD MAP ─────────────────

    const aliasMap = {
      unq: "sp_462",
      date: "sp_467",
      challanno: "sp_468",
      custname: "sp_469",
      model: "sp_470",
      variant: "sp_471",
      color: "sp_472",
      vinno: "sp_473",
      fasttag: "sp_474",
      handlingchrg: "sp_475",
      tcs: "sp_476",
      trc: "sp_477",
      Accessories: "sp_478",
      AdditionalWarranty: "sp_479",
      WarrantyYear: "sp_480",
      WarrantyAmount: "sp_481",
      ExshowRoomPrice: "sp_482",
      Corporateyn: "sp_483",
      Corporateamount: "sp_484",
      Corporategiven: "sp_485",
      Exchangeyn: "sp_486",
      Exchangeamount: "sp_487",
      Exchangegiven: "sp_488",
      Loyalityyn: "sp_489",
      Loyalityamount: "sp_490",
      Loyalitygiven: "sp_491",
      RTORate: "sp_492",
      RTOTaxSurcharge: "sp_493",
      GreenTax: "sp_494",
      RegFee: "sp_495",
      HPN: "sp_496",
      Duplicate: "sp_497",
      SmartCard: "sp_498",
      Other: "sp_499",
      RTOAmount: "sp_500",
      GST: "sp_501",
      CESS: "sp_502",
      subtotal: "sp_503",
      Amount: "sp_504",
      Idv: "sp_505",
      IdvAmount: "sp_506",
      InsurancePercentage: "sp_507",
      InsperAmount: "sp_508",
      DiscountPrecentage: "sp_509",
      DiscountAmount: "sp_510",
      ThirdParty: "sp_511",
      PACover: "sp_512",
      ZD: "sp_513",
      PB: "sp_514",
      KP: "sp_515",
      PaidDriver: "sp_516",
      gstunq: "sp_518",
      GSTAmount: "sp_519",
      InsuranceAmount: "sp_520",
      netamount: "sp_521",
      lessofallencashmentschemne: "sp_522",
      hypothecation: "sp_523",
      address: "sp_524",
      fathername: "sp_525",
      mobileno: "sp_526",
      aadharcard: "sp_527",
      panno: "sp_528",
      nomineename: "sp_529",
      age: "sp_530",
      relation: "sp_531",
      gstin: "sp_532",
      rtocity: "sp_533",
      rtofrom: "sp_534",
      engineno: "sp_535",
      bankname: "sp_536",
      bankamt: "sp_537",
      title: "sp_538",
      afteridvamt: "sp_539",
      examt: "sp_540",
      afterdisamtamt: "sp_541",
      pacoveramt: "sp_542",
      amtafterpaiddriver: "sp_543",
      addless: "sp_544",
      rcamt: "sp_545",
      bal: "sp_546",
      financetype: "sp_547",
      instype: "sp_548",
      rtoexshow: "sp_549",
      scunq: "sp_550",
      tlunq: "sp_551",
      managunq: "sp_552",
      ep: "sp_553",
      zdamt: "sp_554",
      epamt: "sp_555",
      sgst: "sp_556",
      cgst: "sp_557",
      challantype: "sp_558",
      csdunq: "sp_559",
      insshowroom: "sp_560",
      financeamt: "sp_561",
      branchpfx: "sp_562",
      insunq: "sp_563",
      policy: "sp_564",
      insentry: "sp_565",
      insamt: "sp_566",
      preinsamt: "sp_568",
      appid: "sp_571",
      ownaccss: "sp_573",
      appdate: "sp_574",
      rejectremark: "sp_581",
      afappdate: "sp_582",
      afappid: "sp_584",
      appremark: "sp_585",
      hmidis: "sp_591",
      odis: "sp_592",
      fchallan: "sp_593",
      branchid: "sp_594",
      othercap: "sp_595",
      otheramt: "sp_596",
      rti: "sp_600",
      rtiamt: "sp_601",
      cm: "sp_602",
      cmamt: "sp_603",
      hpnp: "sp_605",
      bankdue: "sp_606",
      custdue: "sp_607",
      crecive: "sp_608",
      freceive: "sp_609",
      state_list: "sp_610",
      dealeryn: "sp_611",
      dealeramount: "sp_612",
      dealergiven: "sp_613",
      RSA: "sp_625",
      n2amt: "sp_626",
      n2yn: "sp_627",
      specificno: "sp_628",
      specificamt: "sp_629",
      cngp: "sp_634",
      cngamt: "sp_635",
      scrapper: "sp_653",
      scrappage: "sp_654",
    };

    Object.entries(aliasMap).forEach(([fromKey, toKey]) => {
      if (
        data[toKey] === undefined &&
        data[fromKey] !== undefined &&
        data[fromKey] !== null
      ) {
        data[toKey] = data[fromKey];
      }
    });

    data.sp_614 ??= data["RTO TEMP"];
    data.sp_615 ??= data.NCB;
    data.sp_616 ??= data.REMARK;
    data.sp_617 ??= data.OTHER1;
    data.sp_618 ??= data.OTHER2;
    data.sp_619 ??= data.OTHER3;
    data.sp_620 ??= data.AMOUNT1;
    data.sp_621 ??= data.AMOUNT2;
    data.sp_622 ??= data.AMOUNT3;
    data.sp_623 ??= data.WORKSHOPINVOICENO;
    data.sp_624 ??= data.WORKSHOPINVOICEAMOUNT;

    if (!data.sp_462) {
      return res.status(400).json({
        success: false,
        message: "sp_462 is required",
      });
    }

    console.log(
      "❌ CHALLAN REJECT — DB:",
      databaseName,
      "sp_462:",
      data.sp_462,
    );

    // ───────────────── DB ─────────────────

    pool = await openPool(databaseName);

    const request = pool.request();

    request.input("prefix", sql.NVarChar(50), "");
    request.input("what", sql.NVarChar(50), "reject");
    request.input("FromDate", sql.NVarChar(50), "");
    request.input("ToDate", sql.NVarChar(50), "");

    for (let i = 461; i <= 654; i++) {
      const key = `sp_${i}`;

      let value = data[key];

      if (value === null || value === undefined) {
        value = "";
      }

      if (Array.isArray(value)) {
        value = value[0] ?? "";
      }

      if (typeof value === "object" && value !== null) {
        value = "";
      }

      value = String(value).trim();

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

    // ───────────────── EXECUTE SP ─────────────────

    const result = await request.execute("A_SP_FOR_ApplicationChallangrid");

    console.log(`✅ Challan rejected successfully: ${data.sp_462}`);

    // ───────────────── UPDATE IP ─────────────────

    if (data.sp_588) {
      await pool
        .request()
        .input("sp_462", sql.NVarChar(100), String(data.sp_462))
        .input("sp_588", sql.NVarChar(50), String(data.sp_588)).query(`
          UPDATE rh_sp_46
          SET sp_588 = @sp_588
          WHERE sp_462 = @sp_462
        `);
    }

    // ───────────────── NOTIFICATION ─────────────────

    const creatorResult = await pool
      .request()

      .input("sp_462", sql.NVarChar, data.sp_462).query(`
    SELECT sp_463
    FROM rh_sp_46
    WHERE sp_462 = @sp_462
  `);

    const creatorUserId = creatorResult.recordset[0]?.sp_463;

    console.log("CREATOR USER:", creatorUserId);

    if (creatorUserId) {
      console.log("INSERTING NOTIFICATION...");
      await createNotification(
        pool,
        creatorUserId,
        "Challan Rejected",
        `Your challan ${data.sp_468} has been rejected`,
        "CHALLAN_REJECTED",
        data.sp_462,
      );
      await sendPushNotification(
        pool,

        creatorUserId,

        "Challan Rejected",

        `Your challan ${data.sp_468} has been rejected`,
      );
      console.log("✅ Rejection notification sent to:", creatorUserId);
    }

    // ───────────────── RESPONSE ─────────────────

    return res.json({
      success: true,
      message: result.recordset?.[0]?.err || "Challan rejected successfully",
      data: result.recordset?.[0],
    });
  } catch (err) {
    console.error("❌ CHALLAN REJECT ERROR:", err.message);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  } finally {
    //  if (pool) await pool.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/dashboard-stats
// Returns today's booking count and today's sale count
// ─────────────────────────────────────────────────────────────────────────────
/*router.get("/dashboard-stats", async (req, res) => {
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

    console.log("📊 DASHBOARD STATS — DB:", databaseName);

    pool = await openPool(databaseName);

    // Today Booking
    const bookingResult = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "TodayBooking")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    // Today Sale
    const saleResult = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "TodaySale")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    const todayBooking = bookingResult.recordset?.[0]?.todaybooking ?? 0;
    const todaySale = saleResult.recordset?.[0]?.todaydelivery ?? 0;

    console.log(
      `✅ Dashboard stats — Booking: ${todayBooking}, Sale: ${todaySale}`,
    );

    return res.json({
      success: true,
      data: {
        todayBooking,
        todaySale,
      },
    });
  } catch (err) {
    console.error("❌ DASHBOARD STATS ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});*/

router.get("/dashboard-stats", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { currentDatabase: databaseName } = decoded;

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    console.log("📊 DASHBOARD STATS — DB:", databaseName);

    pool = await openPool(databaseName);

    // ---------- TODAY BOOKING ----------
    const bookingToday = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "TodayBooking")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    // ---------- YESTERDAY BOOKING ----------
    const bookingYesterday = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "YesterdayBooking")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    // ---------- TODAY SALE ----------
    const saleToday = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "TodaySale")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    // ---------- YESTERDAY SALE ----------
    const saleYesterday = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "YesterdaySale")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    const bookingTrendResult = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "BookingTrend")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    const saleTrendResult = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "SaleTrend")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    const todayBooking = bookingToday.recordset?.[0]?.todaybooking ?? 0;

    const yesterdayBooking =
      bookingYesterday.recordset?.[0]?.yesterdaybooking ?? 0;

    const todaySale = saleToday.recordset?.[0]?.todaydelivery ?? 0;

    const yesterdaySale = saleYesterday.recordset?.[0]?.yesterdaysale ?? 0;

    const bookingTrend = bookingTrendResult.recordset.map((x) =>
      Number(x.TotalBooking),
    );

    const saleTrend = saleTrendResult.recordset.map((x) => Number(x.TotalSale));

    console.log("Today Booking Row:", bookingToday.recordset?.[0]);
    console.log("Yesterday Booking Row:", bookingYesterday.recordset?.[0]);

    console.log("Today Sale Row:", saleToday.recordset?.[0]);
    console.log("Yesterday Sale Row:", saleYesterday.recordset?.[0]);
    function calculateGrowth(today, yesterday) {
      if (yesterday === 0) {
        return today > 0 ? 100 : 0;
      }

      return Number((((today - yesterday) / yesterday) * 100).toFixed(1));
    }

    const bookingGrowth = calculateGrowth(todayBooking, yesterdayBooking);

    const saleGrowth = calculateGrowth(todaySale, yesterdaySale);

    console.log("📊 Dashboard Stats");

    console.table({
      todayBooking,
      yesterdayBooking,
      bookingGrowth,
      bookingTrend,
      todaySale,
      yesterdaySale,
      saleGrowth,
      saleTrend,
    });

    return res.json({
      success: true,
      data: {
        todayBooking,
        yesterdayBooking,
        bookingGrowth,
        bookingTrend,
        todaySale,
        yesterdaySale,
        saleGrowth,
        saleTrend,
      },
    });
  } catch (err) {
    console.error("❌ DASHBOARD STATS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  } finally {
    // if (pool) {
    //   await pool.close();
    // }
  }
});

router.get("/dashboard-branchwise", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { currentDatabase: databaseName } = decoded;

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    const type = (req.query.type || "").toString().toLowerCase();
    const period = (req.query.period || "today").toString().toLowerCase();

    //----------------------------------------------------
    // Validation
    //----------------------------------------------------

    if (!["booking", "sale"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be booking or sale",
      });
    }

    if (!["today", "yesterday"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Period must be today or yesterday",
      });
    }

    //----------------------------------------------------
    // Decide Stored Procedure Mode
    //----------------------------------------------------

    let what = "";

    if (type === "booking") {
      what =
        period === "today"
          ? "TodayBookingBranchwise"
          : "YesterdayBookingBranchwise";
    } else {
      what =
        period === "today" ? "TodaySaleBranchwise" : "YesterdaySaleBranchwise";
    }

    console.log(
      `📊 Dashboard Branchwise | Type: ${type} | Period: ${period} | DB: ${databaseName}`,
    );

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), what)
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    // Also fetch branch id↔name map so we can pass branchId to the detail endpoint
    let branchMap = {};
    try {
      const branchResult = await pool
        .request()
        .query("SELECT sp_602 AS branchId, sp_607 AS branchName FROM rh_sp_60");
      for (const r of branchResult.recordset) {
        if (r.branchName) {
          branchMap[r.branchName.trim().toLowerCase()] = (
            r.branchId || ""
          ).trim();
        }
      }
    } catch (_) {}

    const branches = (result.recordset || []).map((row) => {
      const name = (row.branchName ?? row.branchname ?? "Unknown Branch")
        .toString()
        .trim();
      return {
        branchName: name,
        branchId: branchMap[name.toLowerCase()] ?? "",
        count: Number(row.totalCount ?? row.totalcount ?? 0),
      };
    });

    const total = branches.reduce((sum, item) => sum + item.count, 0);

    return res.json({
      success: true,
      data: {
        type,
        period,
        total,
        branches,
      },
    });
  } catch (err) {
    console.error("❌ Dashboard Branchwise Error:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  } finally {
    // if (pool) {
    //   await pool.close();
    // }
  }
});
router.post(
  "/send-admin-push",

  async (req, res) => {
    let pool;

    try {
      const { challanNo, databaseName } = req.body;

      console.log("SEND ADMIN PUSH API CALLED");

      console.log("CHALLAN NO:", challanNo);

      console.log("DATABASE:", databaseName);

      if (!challanNo) {
        return res.status(400).json({
          success: false,

          message: "challanNo required",
        });
      }

      if (!databaseName) {
        return res.status(400).json({
          success: false,

          message: "databaseName required",
        });
      }

      // DATABASE-WISE CONNECTION

      pool = await openPool(databaseName);

      // SEND PUSH TO ADMIN GROUP

      await sendPushToGroup(
        pool,

        "4848C835-2A09-4A80-A7E2-383C95926C54",

        "New Challan Created",

        `New challan ${challanNo} created`,
      );

      console.log("ADMIN PUSH SENT");

      return res.json({
        success: true,
      });
    } catch (err) {
      console.error("ADMIN PUSH ERROR:", err.message);

      return res.status(500).json({
        success: false,

        message: err.message,
      });
    } finally {
      // if (pool) await pool.close();
    }
  },
);
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/branch-booking-details
// Returns booking detail rows for a specific branch & period
// Query params: period=today|yesterday, branchName=<display name>
// ─────────────────────────────────────────────────────────────────────────────
router.get("/branch-booking-details", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { currentDatabase: databaseName } = decoded;
    if (!databaseName) {
      return res.status(400).json({ success: false, message: "Database not found in token" });
    }

    const period     = (req.query.period     || "today").toString().toLowerCase();
    const branchName = (req.query.branchName || "").toString().trim();

    if (!["today", "yesterday"].includes(period)) {
      return res.status(400).json({ success: false, message: "Period must be today or yesterday" });
    }

    // Reliable DD/MM/YYYY formatter
    function fmtDate(d) {
      const dd   = String(d.getDate()).padStart(2, "0");
      const mm   = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = String(d.getFullYear());
      return `${dd}/${mm}/${yyyy}`;
    }
    const now  = new Date();
    const prev = new Date(now);
    prev.setDate(now.getDate() - 1);
    const dateStr = period === "today" ? fmtDate(now) : fmtDate(prev);

    pool = await openPool(databaseName);

    console.log(`📋 Branch Booking Details | branch="${branchName}" | period=${period} | date=${dateStr}`);

    // Use SQL Server native date functions — avoids getformatteddate format issues
    // yesterday = DATEADD(day,-1, CAST(GETDATE() AS DATE))
    // today     = CAST(GETDATE() AS DATE)
    const fromDateSQL = period === "today"
      ? "CAST(GETDATE() AS DATE)"
      : "CAST(DATEADD(day,-1,GETDATE()) AS DATE)";
    const toDateSQL = period === "today"
      ? "DATEADD(second,-1,DATEADD(day,1,CAST(GETDATE() AS DATE)))"
      : "DATEADD(second,-1,CAST(GETDATE() AS DATE))";

    // Step 1: Get all booking rcl_2 IDs for the date range using SQL Server dates
    const dateReq = await pool.request()
      .query(`
        SELECT rcl_2, rcl_105,
          LTRIM(RTRIM(
            (SELECT TOP 1 sp_607 FROM rh_sp_60 WHERE sp_602 = rcl_105)
          )) AS branchDisplayName
        FROM rh_rcl
        WHERE rcl_66 = 'booking'
          AND rcl_85  = '1900-01-01 00:00:00.000'
          AND CAST(RCL_7 AS DATE) = ${fromDateSQL}
      `);

    console.log(`📊 Total bookings in date range: ${dateReq.recordset.length}`);
    const uniqueBranches = [...new Set(dateReq.recordset.map(r => r.branchDisplayName))];
    console.log(`📊 Distinct branches: ${JSON.stringify(uniqueBranches)}`);
    console.log(`📊 Searching for: "${branchName}"`);

    // Filter by branch name (case-insensitive, trimmed)
    const searchName = branchName.toLowerCase().trim();
    const matchingIds = dateReq.recordset
      .filter(r => !searchName || (r.branchDisplayName || "").toLowerCase().trim() === searchName)
      .map(r => r.rcl_2);

    console.log(`📊 Matching booking IDs: ${matchingIds.length}`);

    if (matchingIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Step 2: Fetch full booking details for matching IDs
    // Build parameterized IN clause
    const idParams = matchingIds.map((_, i) => `@id${i}`).join(", ");
    const detailReq = pool.request();
    matchingIds.forEach((id, i) => detailReq.input(`id${i}`, sql.NVarChar(100), String(id)));

    const detailQuery = `
      SELECT
        (SELECT TOP 1 CONVERT(NVARCHAR(11), rcl_7, 103)
           FROM rh_rcl WHERE rcl_2 = bo_18)                              AS [Receipt Date],
        CONVERT(NVARCHAR(11), bo_17, 103)                                AS [Booking Date],
        (SELECT TOP 1 sp_607 FROM rh_sp_60
           WHERE sp_602 IN (SELECT TOP 1 rcl_105 FROM rh_rcl WHERE rcl_2 = bo_18)) AS [Branch],
        (SELECT TOP 1 m1_7  FROM rh_m1  WHERE m1_2  = bo_23)            AS [Customer Name],
        (SELECT TOP 1 mcm_15 FROM rh_mcm_1 WHERE mcm_14 = bo_20)        AS [SC],
        (SELECT TOP 1 mcm_15 FROM rh_mcm_1 WHERE mcm_14 = bo_21)        AS [TL],
        (SELECT TOP 1 SP_207 FROM RH_SP_20 WHERE SP_202 = BO_26)        AS [Model],
        (SELECT TOP 1 sp_20_3 FROM rh_sp_20_c WHERE sp_20_2 = bo_27)    AS [Variant],
        (SELECT TOP 1 sp_147 FROM rh_sp_14 WHERE sp_142 = bo_28)        AS [Color],
        bo_29                                                             AS [Booking Type],
        bo_35                                                             AS [Package],
        bo_43                                                             AS [Remark],
        CONVERT(NVARCHAR(11), bo_32, 103)                                AS [Ex Date],
        (SELECT TOP 1 CONVERT(NVARCHAR(11), sp_597, 103)
           FROM rh_sp_46 WHERE sp_469 = bo_23)                           AS [Delivery Date],
        (SELECT TOP 1 hp_7 FROM rh_hp WHERE hp_2 = bo_41)               AS [Finance],
        (SELECT va_29 FROM rh_va WHERE va_18 = bo_18)                    AS [VIN No]
      FROM rh_bo_1
      WHERE bo_18 IN (${idParams})
      ORDER BY bo_17 DESC
    `;

    const result = await detailReq.query(detailQuery);
    console.log(`✅ rows returned: ${result.recordset.length}`);

    return res.json({ success: true, data: result.recordset || [] });

  } catch (err) {
    console.error("❌ Branch Booking Details Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
