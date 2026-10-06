const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const sql = require("mssql");
const { createNotification } = require("../utils/notificationHelper");
const {
  sendPushNotification,
  sendPushToGroup,
} = require("../utils/pushNotificationHelper");
const openCommunicationPool = require("../utils/communicationPool");
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
    // ========================================================
    // 1. DECODE TOKEN
    // ========================================================

    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { currentDatabase, userId, isAdmin = false } = decoded;

    console.log("==========================================");
    console.log("RETAIL INCENTIVE / CHALLAN");
    console.log("Database :", currentDatabase);
    console.log("User ID  :", userId);
    console.log("Admin    :", isAdmin);
    console.log("==========================================");

    // ========================================================
    // 2. VALIDATE DATABASE
    // ========================================================

    if (!currentDatabase) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    // ========================================================
    // 3. DATE TYPE
    // ========================================================

    const dateType = req.query.dateType || "challan";

    const prefix = dateType === "challan" ? "1" : "";

    console.log("Date Type:", dateType);
    console.log("Prefix   :", prefix);

    // ========================================================
    // 4. CONNECT TO CURRENT DEALERSHIP DATABASE
    // ========================================================

    pool = await openPool(currentDatabase);

    console.log("✅ Connected dealership DB:", currentDatabase);

    // ========================================================
    // 5. GET CHALLANS FROM STORED PROCEDURE
    // ========================================================

    console.log("Executing A_SP_FOR_ApplicationChallangrid...");

    const result = await pool
      .request()
      .input("prefix1", sql.NVarChar(50), prefix)
      .input("what", sql.NVarChar(50), "Retail_Incentive")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    let challans = result.recordset || [];

    console.log("TOTAL CHALLANS FROM SP:", challans.length);

    // Optional debug
    if (challans.length > 0) {
      console.log("FIRST CHALLAN:", challans[0]);
    }

    // ========================================================
    // 6. ADMIN USER
    // ADMIN GETS ALL CHALLANS
    // ========================================================

    if (!isAdmin) {
      console.log("Applying user challan access filter...");

      // ======================================================
      // 7. CONNECT TO COMMUNICATION DATABASE
      // ======================================================

      const communicationPool = await openCommunicationPool();

      console.log("✅ Communication DB connected");

      // ======================================================
      // 8. GET USER'S ALLOWED CHALLANS
      // FROM AUTOSHOP_COMMUNICATION
      // ======================================================

      const memberResult = await communicationPool
        .request()
        .input("userId", sql.NVarChar(100), userId)
        .input("databaseName", sql.NVarChar(128), currentDatabase).query(`
            SELECT
                ChallanId,
                UserId,
                UserName,
                IsActive,
                DatabaseName
            FROM MA_ChallanChatMembers
            WHERE UserId = @userId
              AND IsActive = 1
              AND LOWER(DatabaseName) =
                  LOWER(@databaseName)
          `);

      console.log("MEMBER ROW COUNT:", memberResult.recordset.length);

      console.log("MEMBER ROWS:", memberResult.recordset);

      // ======================================================
      // 9. CREATE ALLOWED CHALLAN SET
      // ======================================================

      const allowedChallans = new Set(
        memberResult.recordset.map((x) =>
          String(x.ChallanId).trim().toUpperCase(),
        ),
      );

      console.log("ALLOWED CHALLANS:", [...allowedChallans]);

      // ======================================================
      // 10. FILTER STORED PROCEDURE RESULT
      // ======================================================

      console.log("CHALLANS BEFORE FILTER:", challans.length);

      challans = challans.filter((c) =>
        allowedChallans.has(String(c.sp_462).trim().toUpperCase()),
      );

      console.log("CHALLANS AFTER FILTER:", challans.length);
    } else {
      console.log("Admin user detected - skipping challan access filter");
    }

    // ========================================================
    // 11. FINAL RESPONSE
    // ========================================================

    console.log("FINAL CHALLAN COUNT:", challans.length);

    return res.json({
      success: true,
      data: challans,
    });
  } catch (err) {
    // ========================================================
    // DETAILED ERROR LOGGING
    // ========================================================

    console.error("");
    console.error("======================================");
    console.error("❌ RETAIL INCENTIVE ERROR");
    console.error("======================================");

    console.error("Message:", err?.message);

    console.error("Code:", err?.code);

    console.error("Number:", err?.number);

    console.error("Name:", err?.name);

    console.error("Original Message:", err?.originalError?.message);

    console.error("Original Info:", err?.originalError?.info);

    console.error("Preceding Errors:", err?.precedingErrors);

    console.error("Errors:", err?.errors);

    console.error("Stack:", err?.stack);

    console.error("Full Error:", err);

    console.error("======================================");
    console.error("");

    // ========================================================
    // RETURN ERROR TO FLUTTER
    // ========================================================

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err?.originalError?.message || err?.message || "Unknown SQL error",
    });
  }
});
// ============================================================
// TODAY APPROVED CHALLANS
// ============================================================
router.get("/today-approve", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { currentDatabase, userId, isAdmin = false } = decoded;

    if (!currentDatabase) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    pool = await openPool(currentDatabase);

    let query = `
      SELECT
          S.sp_462 AS sp_462,
          S.sp_582 AS date,
          S.sp_468 AS sp_468,
          M.m1_7 AS sp_469,
          S.sp_463 AS challanmade
      FROM rh_sp_46 AS S
      LEFT JOIN rh_m1 AS M
          ON M.m1_2 = S.sp_469
      WHERE
          S.sp_582 <> '1900-01-01 00:00:00.000'
          AND CONVERT(date, S.sp_582) = CONVERT(date, GETDATE())
          AND S.sp_558 IN (
              'Customer Challan',
              'CSD Challan',
              'Inter Delear Challan'
          )
    `;

    // --------------------------------------------------------
    // USER ACCESS FILTER
    // --------------------------------------------------------
    if (!isAdmin) {
      query += `
        AND EXISTS (
          SELECT 1
          FROM autoshop_communication.dbo.MA_ChallanChatMembers AS C
          WHERE C.ChallanId = S.sp_462
            AND C.UserId = @userId
            AND C.IsActive = 1
        )
      `;
    }

    query += `
      ORDER BY S.sp_582 DESC, S.sp_468 DESC
    `;

    const request = pool.request();

    if (!isAdmin) {
      request.input("userId", sql.NVarChar(100), userId);
    }

    const result = await request.query(query);

    console.log("TODAY APPROVED CHALLANS:", result.recordset.length);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("TODAY APPROVE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
});
// ============================================================
// TODAY REJECTED CHALLANS
// ============================================================
router.get("/today-reject", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { currentDatabase, userId, isAdmin = false } = decoded;

    if (!currentDatabase) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    pool = await openPool(currentDatabase);

    let query = `
      SELECT
          S.sp_462 AS sp_462,
          S.sp_578 AS date,
          S.sp_468 AS sp_468,
          M.m1_7 AS sp_469,
          S.sp_463 AS challanmade
      FROM rh_sp_46 AS S
      LEFT JOIN rh_m1 AS M
          ON M.m1_2 = S.sp_469
      WHERE
          S.sp_578 <> '1900-01-01 00:00:00.000'
          AND CONVERT(date, S.sp_578) = CONVERT(date, GETDATE())
          AND ISNULL(S.sp_581, '') <> ''
          AND S.sp_558 IN (
              'Customer Challan',
              'CSD Challan',
              'Inter Delear Challan'
          )
    `;

    // --------------------------------------------------------
    // USER ACCESS FILTER
    // --------------------------------------------------------
    if (!isAdmin) {
      query += `
        AND EXISTS (
          SELECT 1
          FROM MA_ChallanChatMembers AS C
          WHERE C.ChallanId = S.sp_462
            AND C.UserId = @userId
            AND C.IsActive = 1
        )
      `;
    }

    query += `
      ORDER BY S.sp_578 DESC, S.sp_468 DESC
    `;

    const request = pool.request();

    if (!isAdmin) {
      request.input("userId", sql.NVarChar(100), userId);
    }

    const result = await request.query(query);

    console.log("TODAY REJECTED CHALLANS:", result.recordset.length);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("TODAY REJECT ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
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
        "Challan Approved ✅",
        `Your challan ${data.sp_468} has been approved`,
        "CHALLAN_APPROVED",
        data.sp_462,
      );
      await sendPushNotification(
        pool,
        creatorUserId,
        "Challan Approved ✅",
        `Your challan ${data.sp_468} has been approved`,
        {
          type: "CHALLAN_APPROVED",
          challanId: String(data.sp_462 ?? ""),
          challanNo: String(data.sp_468 ?? ""),
        },
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
        "Challan Rejected ❌",
        `Your challan ${data.sp_468} has been rejected`,
        "CHALLAN_REJECTED",
        data.sp_462,
      );
      await sendPushNotification(
        pool,
        creatorUserId,
        "Challan Rejected ❌",
        `Your challan ${data.sp_468} has been rejected`,
        {
          type: "CHALLAN_REJECTED",
          challanId: String(data.sp_462 ?? ""),
          challanNo: String(data.sp_468 ?? ""),
        },
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

// router.get("/dashboard-stats", async (req, res) => {
//   let pool;

//   try {
//     const decoded = decodeToken(req);

//     if (!decoded) {
//       return res.status(401).json({
//         success: false,
//         message: "Unauthorized",
//       });
//     }

//     const { currentDatabase: databaseName } = decoded;

//     if (!databaseName) {
//       return res.status(400).json({
//         success: false,
//         message: "Database not found in token",
//       });
//     }

//     console.log("📊 DASHBOARD STATS — DB:", databaseName);

//     pool = await openPool(databaseName);

//     // ======================================================
//     // TODAY BOOKING
//     // ======================================================
//     const bookingToday = await pool
//       .request()
//       .input("prefix", sql.NVarChar(50), "")
//       .input("what", sql.NVarChar(50), "TodayBooking")
//       .input("FromDate", sql.NVarChar(50), "")
//       .input("ToDate", sql.NVarChar(50), "")
//       .execute("A_SP_FOR_ApplicationChallangrid");
//     console.log("Booking Today Result:", bookingToday.recordset);
//     // ======================================================
//     // YESTERDAY BOOKING
//     // ======================================================
//     const bookingYesterday = await pool
//       .request()
//       .input("prefix", sql.NVarChar(50), "")
//       .input("what", sql.NVarChar(50), "YesterdayBooking")
//       .input("FromDate", sql.NVarChar(50), "")
//       .input("ToDate", sql.NVarChar(50), "")
//       .execute("A_SP_FOR_ApplicationChallangrid");
//     console.log("Booking Yesterday Result:", bookingYesterday.recordset);
//     // ======================================================
//     // TODAY SALE
//     // ======================================================
//     const saleToday = await pool
//       .request()
//       .input("prefix", sql.NVarChar(50), "")
//       .input("what", sql.NVarChar(50), "TodaySale")
//       .input("FromDate", sql.NVarChar(50), "")
//       .input("ToDate", sql.NVarChar(50), "")
//       .execute("A_SP_FOR_ApplicationChallangrid");
//     console.log("Sale Today Result:", saleToday.recordset);
//     // ======================================================
//     // YESTERDAY SALE
//     // ======================================================
//     const saleYesterday = await pool
//       .request()
//       .input("prefix", sql.NVarChar(50), "")
//       .input("what", sql.NVarChar(50), "YesterdaySale")
//       .input("FromDate", sql.NVarChar(50), "")
//       .input("ToDate", sql.NVarChar(50), "")
//       .execute("A_SP_FOR_ApplicationChallangrid");
//     console.log("Sale Yesterday Result:", saleYesterday.recordset);

//     // ======================================================
//     // TREND PERIOD
//     // ======================================================
//     // Accept ?period=7days (default)
//     // or ?period=6months
//     const trendPeriod = req.query.period === "6months" ? "6months" : "7days";

//     // ======================================================
//     // BOOKING TREND
//     // ======================================================
//     const bookingTrendResult = await pool
//       .request()
//       .input("prefix", sql.NVarChar(50), "")
//       .input("what", sql.NVarChar(50), "BookingTrend")
//       .input("period", sql.NVarChar(50), trendPeriod)
//       .input("FromDate", sql.NVarChar(50), "")
//       .input("ToDate", sql.NVarChar(50), "")
//       .execute("A_SP_FOR_ApplicationChallangrid");
//     console.log("Booking Trend Result:", bookingTrendResult.recordset);
//     // ======================================================
//     // SALE TREND
//     // ======================================================
//     const saleTrendResult = await pool
//       .request()
//       .input("prefix", sql.NVarChar(50), "")
//       .input("what", sql.NVarChar(50), "SaleTrend")
//       .input("period", sql.NVarChar(50), trendPeriod)
//       .input("FromDate", sql.NVarChar(50), "")
//       .input("ToDate", sql.NVarChar(50), "")
//       .execute("A_SP_FOR_ApplicationChallangrid");
//     console.log("Sale Trend Result:", saleTrendResult.recordset);
//     // ======================================================
//     // BASIC VALUES
//     // ======================================================

//     // Helper: read the first numeric value from an SP recordset row,
//     // regardless of column name casing. Falls back to 0 if absent.
//     function firstNum(row) {
//       if (!row) return 0;
//       const val = Object.values(row)[0];
//       return Number(val ?? 0);
//     }

//     const todayBooking = Number(
//       bookingToday.recordset?.[0]?.todaybooking ??
//         bookingToday.recordset?.[0]?.TodayBooking ??
//         bookingToday.recordset?.[0]?.Todaybooking ??
//         firstNum(bookingToday.recordset?.[0]),
//     );

//     const yesterdayBooking = Number(
//       bookingYesterday.recordset?.[0]?.yesterdaybooking ??
//         bookingYesterday.recordset?.[0]?.YesterdayBooking ??
//         bookingYesterday.recordset?.[0]?.Yesterdaybooking ??
//         firstNum(bookingYesterday.recordset?.[0]),
//     );

//     const todaySale = Number(
//       saleToday.recordset?.[0]?.todaydelivery ??
//         saleToday.recordset?.[0]?.TodayDelivery ??
//         saleToday.recordset?.[0]?.TodaySale ??
//         saleToday.recordset?.[0]?.todaysale ??
//         firstNum(saleToday.recordset?.[0]),
//     );

//     const yesterdaySale = Number(
//       saleYesterday.recordset?.[0]?.yesterdaysale ??
//         saleYesterday.recordset?.[0]?.YesterdaySale ??
//         saleYesterday.recordset?.[0]?.yesterdaydelivery ??
//         saleYesterday.recordset?.[0]?.YesterdayDelivery ??
//         firstNum(saleYesterday.recordset?.[0]),
//     );

//     // ======================================================
//     // BOOKING TREND
//     // ======================================================

//     const bookingTrend = bookingTrendResult.recordset.map((x) =>
//       Number(x.TotalBooking),
//     );

//     // ======================================================
//     // SALE TREND
//     // ======================================================

//     const saleTrend = saleTrendResult.recordset.map((x) => Number(x.TotalSale));

//     // ======================================================
//     // LIVE BOOKING — direct query (SP has no LiveBooking mode)
//     // Live booking = bookings that are approved (sp_582 != epoch)
//     // but not yet delivered (sp_597 = epoch)
//     // ======================================================
//     let liveBooking = 0;
//     try {
//       const liveBookingResult = await pool.request().query(`
//           SELECT COUNT(*) AS liveBooking
//           FROM dbo.rh_sp_46
//           WHERE sp_558 IN ('Customer Challan', 'CSD Challan')
//             AND sp_582 <> '1900-01-01 00:00:00.000'
//             AND sp_597 = '1900-01-01 00:00:00.000'
//         `);
//       liveBooking = Number(liveBookingResult.recordset?.[0]?.liveBooking ?? 0);
//       console.log("🔥 LIVE BOOKING:", liveBooking);
//     } catch (e) {
//       console.warn("⚠️ LiveBooking query failed:", e.message);
//     }

//     // ======================================================
//     // MTD BOOKING — direct query (SP has no MtdBooking mode)
//     // Month-to-date bookings from rcl table
//     // ======================================================
//     let mtdBooking = 0;
//     try {
//       const mtdBookingResult = await pool.request().query(`
//           DECLARE @MTD_Start DATE = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);
//           SELECT COUNT(*) AS mtdBooking
//           FROM dbo.RH_rcl
//           WHERE rcl_66 = 'booking'
//             AND CONVERT(date, rcl_7) >= @MTD_Start
//             AND rcl_85 = '1900-01-01 00:00:00.000'
//         `);
//       mtdBooking = Number(mtdBookingResult.recordset?.[0]?.mtdBooking ?? 0);
//       console.log("📅 MTD BOOKING:", mtdBooking);
//     } catch (e) {
//       console.warn("⚠️ MtdBooking query failed:", e.message);
//     }

//     // ======================================================
//     // MTD SALE — direct query (SP has no MtdSale mode)
//     // Month-to-date deliveries from challan table
//     // ======================================================
//     let mtdSale = 0;
//     try {
//       const mtdSaleResult = await pool.request().query(`
//           DECLARE @MTD_Start DATE = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);
//           SELECT COUNT(*) AS mtdSale
//           FROM dbo.rh_sp_46
//           WHERE sp_558 IN ('customer challan', 'csd challan')
//             AND dbo.ONLYDATE(sp_597) >= @MTD_Start
//         `);
//       mtdSale = Number(mtdSaleResult.recordset?.[0]?.mtdSale ?? 0);
//       console.log("💰 MTD SALE:", mtdSale);
//     } catch (e) {
//       console.warn("⚠️ MtdSale query failed:", e.message);
//       mtdSale = 0;
//     }

//     // ======================================================
//     // PENDING DELIVERY
//     // ======================================================

//     const pendingDelResult = await pool
//       .request()
//       .input("prefix", sql.NVarChar(50), "")
//       .input("what", sql.NVarChar(50), "pendingdelcount")
//       .input("FromDate", sql.NVarChar(50), "")
//       .input("ToDate", sql.NVarChar(50), "")
//       .execute("A_SP_FOR_ApplicationChallangrid");

//     console.log(
//       "⏳ Pending Delivery Raw Recordset:",
//       JSON.stringify(pendingDelResult.recordset),
//     );

//     console.log(
//       "⏳ Pending Delivery All Recordsets:",
//       JSON.stringify(pendingDelResult.recordsets),
//     );

//     // SP may return multiple recordsets.
//     // Scan all recordsets to find the count row.
//     let pendingDelivery = 0;

//     const allRecordsets = pendingDelResult.recordsets ?? [
//       pendingDelResult.recordset,
//     ];

//     for (const rs of allRecordsets) {
//       if (rs?.length > 0) {
//         const firstVal = Object.values(rs[0])[0];

//         const num = Number(firstVal ?? 0);

//         if (!isNaN(num) && num > 0) {
//           pendingDelivery = num;

//           console.log(
//             "✅ Pending Delivery Count:",
//             pendingDelivery,
//             "| Raw row:",
//             rs[0],
//           );

//           break;
//         }
//       }
//     }

//     if (pendingDelivery === 0) {
//       console.log("⚠️ Pending Delivery: could not find count in any recordset");
//     }

//     // ======================================================
//     // DEBUG LOGS
//     // ======================================================

//     console.log(
//       "Today Booking Row:",
//       JSON.stringify(bookingToday.recordset?.[0]),
//     );
//     console.log(
//       "Yesterday Booking Row:",
//       JSON.stringify(bookingYesterday.recordset?.[0]),
//     );
//     console.log("Today Sale Row:", JSON.stringify(saleToday.recordset?.[0]));
//     console.log(
//       "Yesterday Sale Row:",
//       JSON.stringify(saleYesterday.recordset?.[0]),
//     );
//     console.log(
//       "✅ Resolved → todayBooking:",
//       todayBooking,
//       "| yesterdayBooking:",
//       yesterdayBooking,
//       "| todaySale:",
//       todaySale,
//       "| yesterdaySale:",
//       yesterdaySale,
//     );

//     // If LiveBooking query returned 0, fall back to pendingDelivery (same concept)
//     const effectiveLiveBooking =
//       liveBooking > 0 ? liveBooking : pendingDelivery;
//     console.log("🔥 EFFECTIVE LIVE BOOKING:", effectiveLiveBooking);

//     // ======================================================
//     // GROWTH CALCULATION
//     // ======================================================

//     function calculateGrowth(today, yesterday) {
//       if (yesterday === 0) {
//         return today > 0 ? 100 : 0;
//       }

//       return Number((((today - yesterday) / yesterday) * 100).toFixed(1));
//     }

//     const bookingGrowth = calculateGrowth(todayBooking, yesterdayBooking);

//     const saleGrowth = calculateGrowth(todaySale, yesterdaySale);

//     // ======================================================
//     // DASHBOARD CONSOLE TABLE
//     // ======================================================

//     console.log("📊 Dashboard Stats");

//     console.table({
//       todayBooking,
//       yesterdayBooking,
//       bookingGrowth,
//       bookingTrend,

//       todaySale,
//       yesterdaySale,
//       saleGrowth,
//       saleTrend,

//       pendingDelivery,

//       liveBooking: effectiveLiveBooking,
//       mtdBooking,
//       mtdSale,
//     });

//     // ======================================================
//     // API RESPONSE
//     // ======================================================

//     return res.json({
//       success: true,

//       data: {
//         // Booking
//         todayBooking,
//         yesterdayBooking,
//         bookingGrowth,
//         bookingTrend,

//         // Sale
//         todaySale,
//         yesterdaySale,
//         saleGrowth,
//         saleTrend,

//         // Pending Delivery
//         pendingDelivery,

//         // NEW
//         liveBooking: effectiveLiveBooking,
//         mtdBooking,
//         mtdSale,

//         // Trend
//         trendPeriod,
//       },
//     });
//   } catch (err) {
//     console.error("❌ DASHBOARD STATS ERROR:", err);

//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: err.message,
//     });
//   } finally {
//     // Do not close the shared pool here.
//     // if (pool) {
//     //   await pool.close();
//     // }
//   }
// });

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

    // ======================================================
    // TODAY BOOKING
    // ======================================================

    const bookingToday = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "TodayBooking")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    console.log("Booking Today Result:", bookingToday.recordset);

    // ======================================================
    // YESTERDAY BOOKING
    // ======================================================

    const bookingYesterday = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "YesterdayBooking")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    console.log("Booking Yesterday Result:", bookingYesterday.recordset);

    // ======================================================
    // TODAY SALE
    // ======================================================

    const saleToday = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "TodaySale")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    console.log("Sale Today Result:", saleToday.recordset);

    // ======================================================
    // YESTERDAY SALE
    // ======================================================

    const saleYesterday = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "YesterdaySale")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    console.log("Sale Yesterday Result:", saleYesterday.recordset);

    // ======================================================
    // TREND PERIOD
    // ======================================================

    const trendPeriod = req.query.period === "6months" ? "6months" : "7days";

    // ======================================================
    // BOOKING TREND
    // ======================================================

    const bookingTrendResult = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "BookingTrend")
      .input("period", sql.NVarChar(50), trendPeriod)
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    console.log("Booking Trend Result:", bookingTrendResult.recordset);

    // ======================================================
    // SALE TREND
    // ======================================================

    const saleTrendResult = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "SaleTrend")
      .input("period", sql.NVarChar(50), trendPeriod)
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    console.log("Sale Trend Result:", saleTrendResult.recordset);

    // ======================================================
    // HELPER
    // ======================================================

    function firstNum(row) {
      if (!row) return 0;

      const val = Object.values(row)[0];

      return Number(val ?? 0);
    }

    // ======================================================
    // TODAY BOOKING VALUE
    // ======================================================

    const todayBooking = Number(
      bookingToday.recordset?.[0]?.todaybooking ??
        bookingToday.recordset?.[0]?.TodayBooking ??
        bookingToday.recordset?.[0]?.Todaybooking ??
        firstNum(bookingToday.recordset?.[0]),
    );

    // ======================================================
    // YESTERDAY BOOKING VALUE
    // ======================================================

    const yesterdayBooking = Number(
      bookingYesterday.recordset?.[0]?.yesterdaybooking ??
        bookingYesterday.recordset?.[0]?.YesterdayBooking ??
        bookingYesterday.recordset?.[0]?.Yesterdaybooking ??
        firstNum(bookingYesterday.recordset?.[0]),
    );

    // ======================================================
    // TODAY SALE VALUE
    // ======================================================

    const todaySale = Number(
      saleToday.recordset?.[0]?.todaydelivery ??
        saleToday.recordset?.[0]?.TodayDelivery ??
        saleToday.recordset?.[0]?.TodaySale ??
        saleToday.recordset?.[0]?.todaysale ??
        firstNum(saleToday.recordset?.[0]),
    );

    // ======================================================
    // YESTERDAY SALE VALUE
    // ======================================================

    const yesterdaySale = Number(
      saleYesterday.recordset?.[0]?.yesterdaysale ??
        saleYesterday.recordset?.[0]?.YesterdaySale ??
        saleYesterday.recordset?.[0]?.yesterdaydelivery ??
        saleYesterday.recordset?.[0]?.YesterdayDelivery ??
        firstNum(saleYesterday.recordset?.[0]),
    );

    // ======================================================
    // BOOKING TREND
    // ======================================================

    const bookingTrend = bookingTrendResult.recordset.map((x) =>
      Number(x.TotalBooking),
    );

    // ======================================================
    // SALE TREND
    // ======================================================

    const saleTrend = saleTrendResult.recordset.map((x) => Number(x.TotalSale));

    // ======================================================
    // LIVE BOOKING
    // NOW USING STORED PROCEDURE
    // ======================================================

    let liveBooking = 0;

    try {
      const liveBookingResult = await pool
        .request()
        .input("prefix", sql.NVarChar(50), "")
        .input("what", sql.NVarChar(50), "LiveBooking")
        .input("FromDate", sql.NVarChar(50), "")
        .input("ToDate", sql.NVarChar(50), "")
        .execute("A_SP_FOR_ApplicationChallangrid");

      console.log("🔥 Live Booking SP Result:", liveBookingResult.recordset);

      liveBooking = Number(
        liveBookingResult.recordset?.[0]?.liveBooking ??
          liveBookingResult.recordset?.[0]?.LiveBooking ??
          firstNum(liveBookingResult.recordset?.[0]),
      );

      console.log("🔥 LIVE BOOKING:", liveBooking);
    } catch (e) {
      console.warn("⚠️ LiveBooking SP failed:", e.message);
    }

    // ======================================================
    // MONTHLY BOOKING
    // NOW USING STORED PROCEDURE
    // ======================================================

    let mtdBooking = 0;

    try {
      const monthlyBookingResult = await pool
        .request()
        .input("prefix", sql.NVarChar(50), "")
        .input("what", sql.NVarChar(50), "MonthlyBooking")
        .input("FromDate", sql.NVarChar(50), "")
        .input("ToDate", sql.NVarChar(50), "")
        .execute("A_SP_FOR_ApplicationChallangrid");

      console.log(
        "📅 Monthly Booking SP Result:",
        monthlyBookingResult.recordset,
      );

      mtdBooking = Number(
        monthlyBookingResult.recordset?.[0]?.monthlyBooking ??
          monthlyBookingResult.recordset?.[0]?.MonthlyBooking ??
          firstNum(monthlyBookingResult.recordset?.[0]),
      );

      console.log("📅 MONTHLY BOOKING:", mtdBooking);
    } catch (e) {
      console.warn("⚠️ MonthlyBooking SP failed:", e.message);
    }

    // ======================================================
    // MONTHLY SALE
    // NOW USING STORED PROCEDURE
    // ======================================================

    let mtdSale = 0;

    try {
      const monthlySaleResult = await pool
        .request()
        .input("prefix", sql.NVarChar(50), "")
        .input("what", sql.NVarChar(50), "MonthlySale")
        .input("FromDate", sql.NVarChar(50), "")
        .input("ToDate", sql.NVarChar(50), "")
        .execute("A_SP_FOR_ApplicationChallangrid");

      console.log("💰 Monthly Sale SP Result:", monthlySaleResult.recordset);

      mtdSale = Number(
        monthlySaleResult.recordset?.[0]?.monthlySale ??
          monthlySaleResult.recordset?.[0]?.MonthlySale ??
          firstNum(monthlySaleResult.recordset?.[0]),
      );

      console.log("💰 MONTHLY SALE:", mtdSale);
    } catch (e) {
      console.warn("⚠️ MonthlySale SP failed:", e.message);

      mtdSale = 0;
    }

    // ======================================================
    // PENDING DELIVERY
    // ======================================================

    const pendingDelResult = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "pendingdelcount")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    console.log(
      "⏳ Pending Delivery Raw Recordset:",
      JSON.stringify(pendingDelResult.recordset),
    );

    console.log(
      "⏳ Pending Delivery All Recordsets:",
      JSON.stringify(pendingDelResult.recordsets),
    );

    // ======================================================
    // PENDING DELIVERY COUNT
    // ======================================================

    let pendingDelivery = 0;

    const allRecordsets = pendingDelResult.recordsets ?? [
      pendingDelResult.recordset,
    ];

    for (const rs of allRecordsets) {
      if (rs?.length > 0) {
        const firstVal = Object.values(rs[0])[0];

        const num = Number(firstVal ?? 0);

        if (!isNaN(num) && num > 0) {
          pendingDelivery = num;

          console.log(
            "✅ Pending Delivery Count:",
            pendingDelivery,
            "| Raw row:",
            rs[0],
          );

          break;
        }
      }
    }

    if (pendingDelivery === 0) {
      console.log("⚠️ Pending Delivery: could not find count in any recordset");
    }

    // ======================================================
    // DEBUG LOGS
    // ======================================================

    console.log(
      "Today Booking Row:",
      JSON.stringify(bookingToday.recordset?.[0]),
    );

    console.log(
      "Yesterday Booking Row:",
      JSON.stringify(bookingYesterday.recordset?.[0]),
    );

    console.log("Today Sale Row:", JSON.stringify(saleToday.recordset?.[0]));

    console.log(
      "Yesterday Sale Row:",
      JSON.stringify(saleYesterday.recordset?.[0]),
    );

    console.log(
      "✅ Resolved → todayBooking:",
      todayBooking,
      "| yesterdayBooking:",
      yesterdayBooking,
      "| todaySale:",
      todaySale,
      "| yesterdaySale:",
      yesterdaySale,
    );

    // ======================================================
    // LIVE BOOKING FALLBACK
    // ======================================================

    const effectiveLiveBooking =
      liveBooking > 0 ? liveBooking : pendingDelivery;

    console.log("🔥 EFFECTIVE LIVE BOOKING:", effectiveLiveBooking);

    // ======================================================
    // GROWTH CALCULATION
    // ======================================================

    function calculateGrowth(today, yesterday) {
      if (yesterday === 0) {
        return today > 0 ? 100 : 0;
      }

      return Number((((today - yesterday) / yesterday) * 100).toFixed(1));
    }

    const bookingGrowth = calculateGrowth(todayBooking, yesterdayBooking);

    const saleGrowth = calculateGrowth(todaySale, yesterdaySale);

    // ======================================================
    // DASHBOARD CONSOLE TABLE
    // ======================================================

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

      pendingDelivery,

      liveBooking: effectiveLiveBooking,

      mtdBooking,

      mtdSale,
    });

    // ======================================================
    // API RESPONSE
    // ======================================================

    return res.json({
      success: true,

      data: {
        // Booking
        todayBooking,

        yesterdayBooking,

        bookingGrowth,

        bookingTrend,

        // Sale
        todaySale,

        yesterdaySale,

        saleGrowth,

        saleTrend,

        // Pending Delivery
        pendingDelivery,

        // Live / Monthly
        liveBooking: effectiveLiveBooking,

        mtdBooking,

        mtdSale,

        // Trend
        trendPeriod,
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
    // Do not close the shared pool here.
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
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/dashboard-pending-delivery-branch-details
// Returns individual pending delivery records for a branch.
// Query params: branchId (sp_594 / sp_602 value)
// SP mode: pendingdelcountdetailsBW
// ─────────────────────────────────────────────────────────────────────────────
router.get("/dashboard-pending-delivery-branch-details", async (req, res) => {
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

    const branchId = (req.query.branchId || "").toString().trim();

    if (!branchId) {
      return res
        .status(400)
        .json({ success: false, message: "branchId is required" });
    }

    console.log(
      `📦 Pending Delivery Branch Details | DB: ${databaseName} | BranchId: ${branchId}`,
    );

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "pendingdelcountdetailsBW")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .input("sp_602", sql.NVarChar(50), branchId)
      .execute("A_SP_FOR_ApplicationChallangrid");

    console.log(
      "📦 Pending Delivery Branch Details Raw:",
      JSON.stringify(result.recordset?.slice(0, 2)),
    );

    const rows = (result.recordset || []).map((row) => ({
      customer: (row.customer ?? row.Customer ?? "").toString().trim(),
      branch: (row.Branch ?? row.branch ?? "").toString().trim(),
      model: (row.Model ?? row.model ?? "").toString().trim(),
      variant: (row.Variant ?? row.variant ?? "").toString().trim(),
      color: (row.Color ?? row.color ?? "").toString().trim(),
    }));

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("❌ Pending Delivery Branch Details Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/dashboard-pending-delivery-branchwise
// Returns branch-wise pending delivery counts.
// SP mode: pendingdelcountBW
// ─────────────────────────────────────────────────────────────────────────────
router.get("/dashboard-pending-delivery-branchwise", async (req, res) => {
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

    console.log(`📦 Pending Delivery Branchwise | DB: ${databaseName}`);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "pendingdelcountBW")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    console.log(
      "📦 Pending Delivery BW Raw:",
      JSON.stringify(result.recordset),
    );

    // Fetch branch id↔name map
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

    // SP returns: Branch (name), count(*) (no alias) — map both
    const branches = (result.recordset || []).map((row) => {
      const name = (row.Branch ?? row.branch ?? "Unknown Branch")
        .toString()
        .trim();
      const countVal =
        row[""] ?? row["count(*)"] ?? Object.values(row).find((v, i) => i > 0);
      return {
        branchName: name,
        branchId: branchMap[name.toLowerCase()] ?? "",
        count: Number(countVal ?? 0),
      };
    });

    const total = branches.reduce((sum, b) => sum + b.count, 0);

    return res.json({
      success: true,
      data: { total, branches },
    });
  } catch (err) {
    console.error("❌ Pending Delivery Branchwise Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/sales-performance
// Returns sales count + value for a given period.
// Query params: period = today | yesterday | thisweek | thismonth | thisfinancialyear
// SP mode: SalesPerformance
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sales-performance", async (req, res) => {
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

    const period = (req.query.period || "today").toString().toLowerCase();
    const validPeriods = [
      "today",
      "yesterday",
      "thisweek",
      "thismonth",
      "thisfinancialyear",
    ];
    if (!validPeriods.includes(period)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid period" });
    }

    console.log(
      `📈 Sales Performance | DB: ${databaseName} | Period: ${period}`,
    );

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "SalesPerformance")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .input("period", sql.NVarChar(50), period)
      .execute("A_SP_FOR_ApplicationChallangrid");

    console.log("📈 Sales Performance Raw:", JSON.stringify(result.recordset));

    const row = result.recordset?.[0] ?? {};
    return res.json({
      success: true,
      data: {
        period: row.Period ?? period,
        saleCount: Number(row.SaleCount ?? 0),
        saleValue: Number(row.SaleValue ?? 0),
      },
    });
  } catch (err) {
    console.error("❌ Sales Performance Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/dashboard-modelwise
// Returns model-wise booking or sale counts for today or yesterday.
// Query params: type = booking | sale, period = today | yesterday
// SP modes: TodayBookingModelwise | YesterdayBookingModelwise |
//           TodaySaleModelwise    | YesterdaySaleModelwise
// ─────────────────────────────────────────────────────────────────────────────
router.get("/dashboard-modelwise", async (req, res) => {
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

    const type = (req.query.type || "").toString().toLowerCase();
    const period = (req.query.period || "today").toString().toLowerCase();

    if (!["booking", "sale"].includes(type)) {
      return res
        .status(400)
        .json({ success: false, message: "Type must be booking or sale" });
    }

    if (!["today", "yesterday"].includes(period)) {
      return res
        .status(400)
        .json({ success: false, message: "Period must be today or yesterday" });
    }

    let what = "";
    if (type === "booking") {
      what =
        period === "today"
          ? "TodayBookingModelwise"
          : "YesterdayBookingModelwise";
    } else {
      what =
        period === "today" ? "TodaySaleModelwise" : "YesterdaySaleModelwise";
    }

    console.log(
      `📊 Dashboard Modelwise | Type: ${type} | Period: ${period} | DB: ${databaseName}`,
    );

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), what)
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    const models = (result.recordset || []).map((row) => ({
      modelName: (row.ModelName ?? row.modelname ?? "Unknown Model")
        .toString()
        .trim(),
      count: Number(row.totalCount ?? row.totalcount ?? 0),
    }));

    const total = models.reduce((sum, item) => sum + item.count, 0);

    return res.json({
      success: true,
      data: { type, period, total, models },
    });
  } catch (err) {
    console.error("❌ Dashboard Modelwise Error:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/dashboard-scwise
// Returns SC (Sales Consultant) wise sale counts for today or yesterday.
// Query params: type = sale, period = today | yesterday
// SP modes: TodaySaleSCwise | YesterdaySaleSCwise
// ─────────────────────────────────────────────────────────────────────────────
router.get("/dashboard-scwise", async (req, res) => {
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

    const period = (req.query.period || "today").toString().toLowerCase();

    if (!["today", "yesterday"].includes(period)) {
      return res
        .status(400)
        .json({ success: false, message: "Period must be today or yesterday" });
    }

    const what = period === "today" ? "TodaySaleSCwise" : "YesterdaySaleSCwise";

    console.log(
      `📊 Dashboard SCwise | Period: ${period} | DB: ${databaseName}`,
    );

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), what)
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .execute("A_SP_FOR_ApplicationChallangrid");

    const scs = (result.recordset || []).map((row) => ({
      scId: (row.scId ?? row.sp_550 ?? row.SCID ?? "").toString().trim(),
      scName: (row.SCName ?? row.scname ?? row.scName ?? "Unknown SC")
        .toString()
        .trim(),
      count: Number(row.totalCount ?? row.totalcount ?? 0),
    }));

    const total = scs.reduce((sum, item) => sum + item.count, 0);

    return res.json({
      success: true,
      data: { period, total, scs },
    });
  } catch (err) {
    console.error("❌ Dashboard SCwise Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
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

    const period = (req.query.period || "today").toLowerCase().trim();
    const branchId = (req.query.branchId || "").trim();
    const branchName = (req.query.branchName || "").trim();

    console.log("========== BRANCH DETAIL ==========");
    console.log("Period      :", period);
    console.log("Branch Id   :", branchId);
    console.log("Branch Name :", branchName);
    console.log("===================================");

    pool = await openPool(databaseName);

    // Get today's / yesterday's date
    const dateResult = await pool
      .request()
      .query(
        period === "today"
          ? "SELECT CONVERT(NVARCHAR(11), GETDATE(), 103) AS dt"
          : "SELECT CONVERT(NVARCHAR(11), DATEADD(DAY,-1,GETDATE()),103) AS dt",
      );

    const dateStr = dateResult.recordset[0].dt;

    console.log("From Date :", dateStr);
    console.log("To Date   :", dateStr);

    const request = pool.request();

    // Only pass parameters that exist in the Stored Procedure
    request.input("prefix", sql.NVarChar(50), "");
    request.input("what", sql.NVarChar(100), "BookingRegisterReport");
    request.input("FromDate", sql.NVarChar(20), dateStr);
    request.input("ToDate", sql.NVarChar(20), dateStr);
    request.input("sp_602", sql.NVarChar(100), branchId);

    console.log("Executing Stored Procedure...");

    const result = await request.execute("A_SP_FOR_ApplicationChallangrid");

    console.log("Rows Returned :", result.recordset.length);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("Branch Booking Details Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    // if (pool) await pool.close();
  }
});
router.get("/branch-sale-details", async (req, res) => {
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

    const period = (req.query.period || "today").toLowerCase().trim();
    const branchId = (req.query.branchId || "").trim();
    const branchName = (req.query.branchName || "").trim();

    console.log("========== SALE DETAIL ==========");
    console.log("Period      :", period);
    console.log("Branch Id   :", branchId);
    console.log("Branch Name :", branchName);
    console.log("================================");

    pool = await openPool(databaseName);

    // Today's / Yesterday's Date
    const dateResult = await pool
      .request()
      .query(
        period === "today"
          ? "SELECT CONVERT(NVARCHAR(11), GETDATE(), 103) AS dt"
          : "SELECT CONVERT(NVARCHAR(11), DATEADD(DAY,-1,GETDATE()),103) AS dt",
      );

    const dateStr = dateResult.recordset[0].dt;

    console.log("From Date :", dateStr);
    console.log("To Date   :", dateStr);

    const request = pool.request();

    request.input("prefix", sql.NVarChar(50), "");
    request.input("what", sql.NVarChar(100), "SaleRegisterReport"); // <-- Changed
    request.input("FromDate", sql.NVarChar(20), dateStr);
    request.input("ToDate", sql.NVarChar(20), dateStr);
    request.input("BranchName", sql.NVarChar(100), branchId);

    console.log("Executing SaleRegisterReport...");
    console.log("===== PARAMETERS =====");
    console.log("what       =", "SaleRegisterReport");
    console.log("FromDate   =", dateStr);
    console.log("ToDate     =", dateStr);
    console.log("BranchId   =", branchId);
    console.log("BranchName =", branchName);

    const debug = await pool
      .request()
      .input("BranchId", sql.NVarChar(100), branchId).query(`
      SELECT
          @BranchId AS PassedBranchId,
          (
              SELECT TOP 1 sp_607
              FROM rh_sp_60
              WHERE sp_602 = @BranchId
          ) AS BranchFound
  `);

    console.log(debug.recordset);
    const result = await request.execute("A_SP_FOR_ApplicationChallangrid");

    console.log("Rows Returned :", result.recordset.length);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("Branch Sale Details Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    // if (pool) await pool.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/sc-sale-details
// Returns sale detail rows for a specific SC (Sales Consultant) & period.
// Query params: period=today|yesterday, scId=<sp_550 value>, scName=<display>
// SP mode: SaleRegisterReportSCWise  (@sp_550 = scId, FromDate/ToDate = period date)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sc-sale-details", async (req, res) => {
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

    const period = (req.query.period || "today").toLowerCase().trim();
    const scId = (req.query.scId || "").trim();
    const scName = (req.query.scName || "").trim();

    console.log("========== SC SALE DETAIL ==========");
    console.log("Period  :", period);
    console.log("SC Id   :", scId);
    console.log("SC Name :", scName);
    console.log("====================================");

    pool = await openPool(databaseName);

    // ── Resolve scId: if not provided, look it up from scName in rh_mcm_1 ──
    let resolvedScId = scId;
    if (!resolvedScId && scName) {
      try {
        const lookup = await pool
          .request()
          .input("scName", sql.NVarChar(200), scName)
          .query(
            "SELECT TOP 1 mcm_14 AS scId FROM rh_mcm_1 WHERE mcm_15 = @scName",
          );
        resolvedScId = lookup.recordset[0]?.scId?.toString().trim() ?? "";
        console.log("Resolved scId from name:", resolvedScId);
      } catch (_) {}
    }

    if (!resolvedScId) {
      return res.status(400).json({
        success: false,
        message: "scId is required and could not be resolved",
      });
    }

    // Resolve today / yesterday as dd/mm/yyyy
    const dateResult = await pool
      .request()
      .query(
        period === "today"
          ? "SELECT CONVERT(NVARCHAR(11), GETDATE(), 103) AS dt"
          : "SELECT CONVERT(NVARCHAR(11), DATEADD(DAY,-1,GETDATE()), 103) AS dt",
      );
    const dateStr = dateResult.recordset[0].dt;

    console.log("From Date :", dateStr);
    console.log("To Date   :", dateStr);

    const request = pool.request();
    request.input("prefix", sql.NVarChar(50), "");
    request.input("what", sql.NVarChar(100), "SaleRegisterReportSCWise");
    request.input("FromDate", sql.NVarChar(20), dateStr);
    request.input("ToDate", sql.NVarChar(20), dateStr);
    request.input("sp_550", sql.NVarChar(50), resolvedScId); // SC identifier

    console.log("Executing SaleRegisterReportSCWise...");

    const result = await request.execute("A_SP_FOR_ApplicationChallangrid");

    console.log("Rows Returned :", result.recordset.length);

    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("SC Sale Details Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    // if (pool) await pool.close();
  }
});
// ======================================================
// GET /api/challan/receipt/combined
// Combined Receipt + Receipt Request Data
// ======================================================

router.get("/receipt/combined", async (req, res) => {
  let pool;

  try {
    // ==================================================
    // AUTHENTICATION
    // ==================================================

    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ==================================================
    // DATABASE
    // ==================================================

    const databaseName = decoded.currentDatabase;

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    console.log("======================================");
    console.log("COMBINED RECEIPT API");
    console.log("DATABASE:", databaseName);
    console.log("======================================");

    pool = await openPool(databaseName);

    // ==================================================
    // GET COMBINED DATA
    // ==================================================

    const result = await pool.request().query(`
  SELECT 
    rcl.rcl_2 AS receipt_id,
    rcl.rcl_9 AS receipt_no,
    rcl.rcl_7 AS receipt_date,

    (
      SELECT TOP 1 m1.m1_7
      FROM rh_m1 m1
      WHERE m1.m1_2 = rcl.rcl_54
    ) AS customer_name,

    arr.edate AS request_date,
    arr.unqid AS request_id,
    arr.userid AS request_user_id,
    arr.ipaddress AS request_ip,
    arr.recpt_unqid AS request_receipt_id,
    arr.req_type AS request_type,
    arr.val_frm AS value_from,
    arr.val_to AS value_to,
    arr.status AS status,
    arr.change_reason AS reason

  FROM rh_rcl rcl

  RIGHT JOIN app_receipt_request arr
    ON arr.recpt_unqid = rcl.rcl_2

  WHERE LOWER(LTRIM(RTRIM(arr.status))) = 'pending'

  ORDER BY rcl.rcl_7 DESC;
`);

    // ==================================================
    // LOG RESULT
    // ==================================================

    console.log("COMBINED RECEIPT ROWS:", result.recordset.length);

    console.log(
      "COMBINED RECEIPT DATA:",
      JSON.stringify(result.recordset, null, 2),
    );

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    // ==================================================
    // ERROR
    // ==================================================

    console.error("COMBINED RECEIPT ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  } finally {
    // ==================================================
    // DO NOT CLOSE POOL
    // ==================================================
    //
    // dynamicPoolManager manages the connection.
    //
    // if (pool) {
    //   await pool.close();
    // }
  }
});

// ======================================================
// GET /api/challan/receipt/today-complete
// Today's Completed Receipt Requests
// ======================================================

// ======================================================
// GET /api/challan/receipt/today-complete
// Today's Completed Receipt Requests
// ======================================================
// ======================================================
// GET /api/challan/receipt/today-complete
// Today's Completed Receipt Requests
// ======================================================

router.get("/receipt/today-complete", async (req, res) => {
  let pool;

  try {
    // ==================================================
    // AUTHENTICATION
    // ==================================================

    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ==================================================
    // DATABASE
    // ==================================================

    const databaseName = decoded.currentDatabase;

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    console.log("");
    console.log("==============================================");
    console.log("       TODAY COMPLETE RECEIPT API");
    console.log("==============================================");
    console.log("DATABASE :", databaseName);
    console.log(
      "USER ID  :",
      decoded.userid || decoded.userId || decoded.user || "",
    );
    console.log("==============================================");

    // ==================================================
    // OPEN DATABASE
    // ==================================================

    pool = await openPool(databaseName);

    if (!pool) {
      throw new Error(`Unable to connect to database: ${databaseName}`);
    }

    console.log("DATABASE CONNECTED:", databaseName);

    // ==================================================
    // GET TODAY'S COMPLETED RECEIPT REQUESTS
    // IMPORTANT:
    // approvedate is used for today's completed date
    // ==================================================

    const result = await pool.request().query(`
      SELECT
          rcl.rcl_2 AS receipt_id,
          rcl.rcl_9 AS receipt_no,
          rcl.rcl_7 AS receipt_date,

          (
              SELECT TOP 1
                  m1.m1_7
              FROM rh_m1 m1
              WHERE m1.m1_2 = rcl.rcl_54
          ) AS customer_name,

          arr.edate AS request_date,
          arr.approvedate AS approved_date,

          arr.unqid AS request_id,
          arr.userid AS request_user_id,
          arr.ipaddress AS request_ip,
          arr.recpt_unqid AS request_receipt_id,
          arr.req_type AS request_type,
          arr.val_frm AS value_from,
          arr.val_to AS value_to,
          arr.status AS status,
          arr.change_reason AS reason

      FROM app_receipt_request arr

      LEFT JOIN rh_rcl rcl
          ON arr.recpt_unqid = rcl.rcl_2

      WHERE
          LOWER(LTRIM(RTRIM(arr.status))) IN ('complete', 'completed')
          AND arr.approvedate IS NOT NULL
          AND CAST(arr.approvedate AS DATE) = CAST(GETDATE() AS DATE)

      ORDER BY arr.approvedate DESC;
    `);

    // ==================================================
    // LOG RESULT
    // ==================================================

    console.log("==============================================");
    console.log("TODAY COMPLETE RECEIPT RESULT");
    console.log("ROWS :", result.recordset.length);
    console.log("==============================================");

    if (result.recordset.length > 0) {
      console.log(
        "FIRST COMPLETED RECEIPT:",
        JSON.stringify(result.recordset[0], null, 2),
      );
    } else {
      console.log("NO COMPLETED RECEIPTS FOUND FOR TODAY");
    }

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    // ==================================================
    // ERROR
    // ==================================================

    console.error("");
    console.error("==============================================");
    console.error("❌ TODAY COMPLETE RECEIPT API ERROR");
    console.error("==============================================");
    console.error("ERROR :", err.message);
    console.error("STACK :", err.stack);
    console.error("==============================================");

    return res.status(500).json({
      success: false,
      message: "Failed to fetch today's completed receipts",
      error: err.message,
      data: [],
    });
  } finally {
    // ==================================================
    // DO NOT CLOSE POOL
    // ==================================================
    // openPool() is managed by the dynamic pool manager.
    // Do NOT call pool.close() here.
  }
});

// ======================================================
// POST /api/challan/receipt/update
// Update Receipt Request
// ======================================================

router.post("/receipt/update", async (req, res) => {
  let pool;

  try {
    // ==================================================
    // AUTHENTICATION
    // ==================================================

    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ==================================================
    // DATABASE
    // ==================================================

    const databaseName = decoded.currentDatabase;

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    // ==================================================
    // GET VALUES FROM FLUTTER
    // ==================================================

    const { request_unqid, recpt_unqid, req_type, val_to } = req.body;

    // ==================================================
    // DEBUG
    // ==================================================

    console.log("");
    console.log("==============================================");
    console.log("       UPDATE RECEIPT REQUEST API");
    console.log("==============================================");
    console.log("DATABASE      :", databaseName);
    console.log("request_unqid :", request_unqid);
    console.log("recpt_unqid   :", recpt_unqid);
    console.log("req_type      :", req_type);
    console.log("val_to        :", val_to);
    console.log("==============================================");

    // ==================================================
    // VALIDATION
    // ==================================================

    // app_receipt_request.unqid
    if (!request_unqid) {
      return res.status(400).json({
        success: false,
        message: "request_unqid is required",
      });
    }

    // rh_rcl.rcl_2
    if (!recpt_unqid) {
      return res.status(400).json({
        success: false,
        message: "recpt_unqid is required",
      });
    }

    if (!req_type) {
      return res.status(400).json({
        success: false,
        message: "req_type is required",
      });
    }

    if (val_to === undefined || val_to === null) {
      return res.status(400).json({
        success: false,
        message: "val_to is required",
      });
    }

    // ==================================================
    // OPEN DATABASE
    // ==================================================

    pool = await openPool(databaseName);

    if (!pool) {
      throw new Error(`Unable to connect to database: ${databaseName}`);
    }

    // ==================================================
    // CALL STORED PROCEDURE
    // ==================================================

    const result = await pool
      .request()

      // @what
      .input("what", sql.NVarChar(50), "Update")

      // @unqid
      // This is rh_rcl.rcl_2
      .input("unqid", sql.NVarChar(50), String(recpt_unqid).trim())

      // @request_unqid
      // This is app_receipt_request.unqid
      .input("request_unqid", sql.NVarChar(50), String(request_unqid).trim())

      // @req_type
      .input("req_type", sql.NVarChar(50), String(req_type).trim())

      // @to
      .input("to", sql.NVarChar(sql.MAX), String(val_to))

      .execute("A_SP_FOR_UpdateReceiptRequest");

    // ==================================================
    // DEBUG SP RESULT
    // ==================================================

    console.log("");
    console.log("==============================================");
    console.log("       UPDATE SP RESULT");
    console.log("==============================================");
    console.log(result.recordset);
    console.log("==============================================");

    // ==================================================
    // CHECK SP RESULT
    // ==================================================

    const spStatus = result.recordset?.[0]?.Status;

    console.log("SP STATUS:", spStatus);

    if (spStatus !== "Success") {
      return res.status(400).json({
        success: false,
        message: result.recordset?.[0]?.Message || "Receipt update failed",
        data: result.recordset || [],
      });
    }

    // ==================================================
    // UPDATE STATUS + APPROVED DATE
    // ==================================================
    // IMPORTANT:
    // This executes ONLY after the stored procedure succeeds.
    //
    // approvedate = exact date/time when receipt was completed.
    // ==================================================

    const completionResult = await pool
      .request()
      .input("request_unqid", sql.NVarChar(100), String(request_unqid).trim())
      .query(`
        UPDATE app_receipt_request
        SET
            status = 'complete',
            approvedate = GETDATE()
        WHERE unqid = @request_unqid;
      `);

    console.log("==============================================");
    console.log("RECEIPT COMPLETION UPDATED");
    console.log("REQUEST UNQID :", request_unqid);
    console.log("STATUS        : complete");
    console.log("APPROVEDATE   : GETDATE()");
    console.log("ROWS UPDATED  :", completionResult.rowsAffected?.[0] ?? 0);
    console.log("==============================================");

    // ==================================================
    // SUCCESS RESPONSE
    // ==================================================

    return res.json({
      success: true,
      message: "Receipt updated successfully",
      data: result.recordset || [],
      request_unqid: request_unqid,
      recpt_unqid: recpt_unqid,
      request_status: "complete",
    });
  } catch (err) {
    // ==================================================
    // ERROR
    // ==================================================

    console.error("❌ UPDATE RECEIPT ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Receipt update failed",
      error: err.message,
    });
  } finally {
    // ==================================================
    // DO NOT CLOSE POOL
    // ==================================================
    // Dynamic pool manager handles the connection.
  }
});
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/sales-comparison
// Returns sales comparison data (current vs previous period) for a given period.
// Query params: period = today_vs_yesterday | thisweek_vs_lastweek |
//               thismonth_vs_lastmonth | thisquarter_vs_lastquarter | thisyear_vs_lastyear
// SP mode: SalesComparisonShowdata
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sales-comparison", async (req, res) => {
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

    const period = (req.query.period || "today_vs_yesterday").trim();

    console.log("📊 SALES COMPARISON — DB:", databaseName, "Period:", period);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix1", sql.NVarChar(50), "")
      .input("what", sql.NVarChar(50), "SalesComparisonShowdata")
      .input("FromDate", sql.NVarChar(50), "")
      .input("ToDate", sql.NVarChar(50), "")
      .input("period", sql.NVarChar(50), period)
      .execute("A_SP_FOR_ApplicationChallangrid");

    if (!result.recordset || result.recordset.length === 0) {
      return res.json({ success: true, data: {} });
    }

    return res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error("❌ SALES COMPARISON ERROR:", err.message);
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
// GET /api/challan/new/receipt-grid?customerId=X
// Calls A_SP_FOR_Challan @what='griddata11' @sp_469=customerId
// Returns receipt rows + totals (3 record sets)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/receipt-grid", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const customerId = (req.query.customerId || "").trim();
    if (!customerId)
      return res
        .status(400)
        .json({ success: false, message: "customerId required" });

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "griddata11")
      .input("sp_469", sql.NVarChar(50), customerId)
      .execute("A_SP_FOR_Challan");

    const rows = result.recordsets[0] || [];
    const rcTotal = result.recordsets[1]?.[0] || { rcamt: 0 };
    const fiTotal = result.recordsets[2]?.[0] || { fiamt: 0 };
    const custTotal = result.recordsets[3]?.[0] || { camt: 0 };

    return res.json({ success: true, rows, rcTotal, fiTotal, custTotal });
  } catch (err) {
    console.error("RECEIPT-GRID ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/load/:sp462
// Calls A_SP_FOR_Challan @what='Edit' — full row for editing
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/load/:sp462", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const { sp462 } = req.params;
    if (!sp462)
      return res
        .status(400)
        .json({ success: false, message: "sp462 required" });

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "Edit")
      .input("sp_462", sql.NVarChar(50), sp462)
      .execute("A_SP_FOR_Challan");

    if (!result.recordset || result.recordset.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Challan not found" });

    return res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error("CHALLAN LOAD ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/challan/new/update
// Calls A_SP_FOR_Challan @what='update' with all sp fields
// ─────────────────────────────────────────────────────────────────────────────
router.post("/new/update", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase, userId } = decoded;
    if (!currentDatabase)
      return res
        .status(400)
        .json({ success: false, message: "Database not found in token" });

    const data = { ...req.body };
    data.sp_463 = data.sp_463 || userId;
    data.sp_464 = data.sp_464 || getClientIp(req);

    if (!data.sp_462 || data.sp_462 === "0")
      return res.status(400).json({
        success: false,
        message: "sp_462 (challan id) required for update",
      });

    pool = await openPool(currentDatabase);
    const request = pool.request();
    request.input("prefix", sql.NVarChar(50), "rh_");
    request.input("what", sql.NVarChar(50), "update");

    const maxFields = {
      sp_524: true,
      sp_577: true,
      sp_581: true,
      sp_585: true,
      sp_590: true,
      sp_591: true,
      sp_592: true,
      sp_593: true,
    };
    for (let i = 461; i <= 654; i++) {
      const key = `sp_${i}`;
      let val = data[key];
      if (val === null || val === undefined) val = "";
      if (Array.isArray(val)) val = val[0] ?? "";
      if (typeof val === "object" && val !== null) val = "";
      val = String(val).trim();
      if (maxFields[key]) {
        request.input(key, sql.NVarChar(sql.MAX), val);
      } else if (key === "sp_616") {
        request.input(key, sql.NVarChar(500), val);
      } else {
        request.input(key, sql.NVarChar(50), val);
      }
    }
    request.input("pageno", sql.NVarChar(50), String(data.pageno || ""));
    request.input(
      "rows_count",
      sql.NVarChar(50),
      String(data.rows_count || ""),
    );

    const result = await request.execute("A_SP_FOR_Challan");
    const msg = result.recordset?.[0]?.err || "Updated successfully";
    return res.json({ success: true, message: msg });
  } catch (err) {
    console.error("CHALLAN UPDATE ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/customers-by-type?type=CSD|dealer|stb|usedcar|booking
// Returns appropriate customer list based on challan type
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/customers-by-type", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const type = (req.query.type || "booking").toLowerCase();

    const whatMap = {
      booking: "custname",
      csd: "csdname",
      dealer: "dealername",
      stb: "stbname",
      usedcar: "usedcar",
    };
    const what = whatMap[type] || "custname";

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), what)
      .execute("A_SP_FOR_Challan");

    return res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error("CUSTOMERS-BY-TYPE ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/cities?stateId=X
// Calls A_SP_FOR_Challan @what='city' — city list for Add City dialog
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/cities", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "city")
      .execute("A_SP_FOR_Challan");

    return res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error("CITIES ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/tcs-data?date=DD/MM/YYYY
// Calls A_SP_FOR_Challan @what='tcsdata' @sp_467=date
// Returns TCS percentage for the given date
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/tcs-data", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const date = (req.query.date || "").trim();

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "tcsdata")
      .input("sp_467", sql.NVarChar(50), date)
      .execute("A_SP_FOR_Challan");

    const row = result.recordset?.[0] || {};
    return res.json({ success: true, tcs: row.tcs ?? row.sp_648 ?? 0 });
  } catch (err) {
    console.error("TCS-DATA ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/own-rto?branchId=X
// Calls A_SP_FOR_Challan @what='ownrto' @sp_594=branchId
// Returns own-branch RTO city row (rate, tax, green, reg, etc.)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/own-rto", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const branchId = (req.query.branchId || "").trim();

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "ownrto")
      .input("sp_594", sql.NVarChar(50), branchId)
      .execute("A_SP_FOR_Challan");

    const row = result.recordset?.[0] || null;
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error("OWN-RTO ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/hpn-branches?hpnId=X
// Calls A_SP_FOR_Challan @what='branchhpndata' @sp_605=hpnId
// Returns child branch list for a hypothecation parent
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/hpn-branches", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const hpnId = (req.query.hpnId || "").trim();

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "branchhpndata")
      .input("sp_605", sql.NVarChar(50), hpnId)
      .execute("A_SP_FOR_Challan");

    return res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error("HPN-BRANCHES ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/challan/new/:sp462
// Calls A_SP_FOR_Challan @what='delete_Raja'
// Admin-only, checks if SI exists and if STB transferred
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/new/:sp462", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase, userId, utg } = decoded;
    const { sp462 } = req.params;
    const sp469 = (req.query.custId || "").trim(); // customer id needed by SP

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "delete_Raja")
      .input("sp_462", sql.NVarChar(50), sp462)
      .input("sp_463", sql.NVarChar(50), userId)
      .input("sp_469", sql.NVarChar(50), sp469)
      .execute("A_SP_FOR_Challan");

    const msg = result.recordset?.[0]?.err || "Deleted";
    const isError =
      String(msg).startsWith("E") ||
      String(msg).toLowerCase().includes("invoice") ||
      String(msg).toLowerCase().includes("branch");
    return res.json({ success: !isError, message: msg });
  } catch (err) {
    console.error("CHALLAN DELETE ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/retail-support?prefix=&variant=&model=&vinno=&challandate=
// Calls A_SP_FOR_Challan @what='Retail_support'
// Returns corporate/exchange/loyalty/dealer scheme amounts from booking master
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/retail-support", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const {
      variant = "",
      model = "",
      vinno = "",
      challandate = "",
    } = req.query;

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "Retail_support")
      .input("sp_471", sql.NVarChar(50), variant)
      .input("sp_470", sql.NVarChar(50), model)
      .input("sp_473", sql.NVarChar(50), vinno)
      .input("sp_467", sql.NVarChar(50), challandate)
      .execute("A_SP_FOR_Challan");

    const row = result.recordset?.[0] || {};
    return res.json({
      success: true,
      data: {
        exchange: row.exchange ?? 0,
        corporate: row.Corporate ?? 0,
        dealer: row.dealer ?? 0,
        loyality: row.loyality ?? 0,
      },
    });
  } catch (err) {
    console.error("RETAIL-SUPPORT ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/areas
// Calls A_SP_FOR_Challan @what='area'
// Returns area list
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/areas", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "area")
      .execute("A_SP_FOR_Challan");

    return res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error("AREAS ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});
// ============================================================
// CHALLAN GRID - ASP.NET FRM_CHALLAN_GRID equivalent
// ============================================================

// GET /api/challan/grid
// ASP.NET: Getreceipt / grid1
router.get("/grid", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      currentDatabase,
      userId,
      UTUNQ,
      utunq,
      branchid,
      BRANCHUNQ,
      prefix: tokenPrefix,
    } = decoded;

    if (!currentDatabase) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    console.log("decoded by us:", decoded);

    const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);

    const prefix = tokenPrefix ?? decoded.prefix ?? "RH_";

    const tl = UTUNQ ?? utunq ?? decoded.tl ?? "";

    const branch = branchid ?? BRANCHUNQ ?? decoded.branch ?? "";

    pool = await openPool(currentDatabase);
    console.log("tl:", tl);
    const request = pool.request();

    request.input("prefix", sql.NVarChar(50), prefix);

    request.input("what", sql.NVarChar(50), "grid1");

    request.input("pageno", sql.NVarChar(50), String(page));

    request.input(
      "sp_551",
      sql.NVarChar(50),
      "4848C835-2A09-4A80-A7E2-383C95926C54",
    );

    request.input("sp_594", sql.NVarChar(50), branch);

    request.input("sp_463", sql.NVarChar(50), userId ?? "");

    const result = await request.execute("A_SP_FOR_Challan");

    return res.json({
      success: true,
      data: result.recordset || [],
      page,
    });
  } catch (err) {
    console.error("❌ CHALLAN GRID ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
});

// ============================================================
// CHALLAN GRID PAGE
// ASP.NET: Getreceiptpage
// ============================================================

router.get("/grid/page", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      currentDatabase,
      userId,
      UTUNQ,
      utunq,
      branchid,
      BRANCHUNQ,
      prefix: tokenPrefix,
    } = decoded;

    if (!currentDatabase) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);

    const search = String(req.query.search || "").trim();

    const prefix = tokenPrefix ?? decoded.prefix ?? "RH_";

    const tl = UTUNQ ?? utunq ?? decoded.tl ?? "";

    const branch = branchid ?? BRANCHUNQ ?? decoded.branch ?? "";

    pool = await openPool(currentDatabase);

    const request = pool.request();

    request.input("prefix", sql.NVarChar(50), prefix);

    request.input("pageno", sql.NVarChar(50), String(page));

    request.input("sp_551", sql.NVarChar(50), tl);

    request.input("sp_594", sql.NVarChar(50), branch);

    request.input("sp_463", sql.NVarChar(50), userId ?? "");

    let result;

    if (search === "") {
      // ASP.NET:
      // @what='grid1'
      request.input("what", sql.NVarChar(50), "grid1");

      result = await request.execute("A_SP_FOR_Challan");
    } else {
      // ASP.NET:
      // @what='search'
      // @sp_469=search
      request.input("what", sql.NVarChar(50), "search");

      request.input("sp_469", sql.NVarChar(50), search);

      result = await request.execute("A_SP_FOR_Challan");
    }

    return res.json({
      success: true,
      data: result.recordset || [],
      page,
      search,
    });
  } catch (err) {
    console.error("❌ CHALLAN GRID PAGE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
});

// ============================================================
// CHALLAN GRID SEARCH
// ASP.NET: getsearch
// ============================================================

router.get("/grid/search", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      currentDatabase,
      userId,
      UTUNQ,
      utunq,
      branchid,
      BRANCHUNQ,
      prefix: tokenPrefix,
    } = decoded;

    if (!currentDatabase) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    const search = String(req.query.search || "").trim();

    if (!search) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);

    const prefix = tokenPrefix ?? decoded.prefix ?? "RH_";

    const tl = UTUNQ ?? utunq ?? decoded.tl ?? "";

    const branch = branchid ?? BRANCHUNQ ?? decoded.branch ?? "";

    pool = await openPool(currentDatabase);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), prefix)
      .input("what", sql.NVarChar(50), "search")
      .input("pageno", sql.NVarChar(50), String(page))
      .input("sp_469", sql.NVarChar(50), search)
      .input("sp_551", sql.NVarChar(50), tl)
      .input("sp_594", sql.NVarChar(50), branch)
      .input("sp_463", sql.NVarChar(50), userId ?? "")
      .execute("A_SP_FOR_Challan");

    return res.json({
      success: true,
      data: result.recordset || [],
      page,
      search,
    });
  } catch (err) {
    console.error("❌ CHALLAN SEARCH ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
});

// ============================================================
// CHALLAN GRID TOTAL
// ASP.NET: totalrow
// Uses Cls_challan.proc_total_row equivalent:
// empty search -> pageno
// search -> cl_likepage
// ============================================================

router.get("/grid/total", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      currentDatabase,
      UTUNQ,
      utunq,
      branchid,
      BRANCHUNQ,
      prefix: tokenPrefix,
    } = decoded;

    if (!currentDatabase) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    const search = String(req.query.search || "").trim();

    const prefix = tokenPrefix ?? decoded.prefix ?? "RH_";

    const tl = UTUNQ ?? utunq ?? decoded.tl ?? "";

    const branch = branchid ?? BRANCHUNQ ?? decoded.branch ?? "";

    pool = await openPool(currentDatabase);

    const request = pool.request();

    request.input("prefix", sql.NVarChar(50), prefix);

    if (search === "") {
      request.input("what", sql.NVarChar(50), "pageno");

      request.input("sp_551", sql.NVarChar(50), tl);

      request.input("sp_594", sql.NVarChar(50), branch);
    } else {
      request.input("what", sql.NVarChar(50), "cl_likepage");

      request.input("sp_594", sql.NVarChar(50), branch);

      request.input("sp_469", sql.NVarChar(50), search);
    }

    const result = await request.execute("A_SP_FOR_Challan");

    let total = 0;

    if (result.recordset?.length > 0) {
      const first = result.recordset[0];

      const firstValue = Object.values(first)[0];

      total = parseInt(firstValue, 10) || 0;
    }

    return res.json({
      success: true,
      total,
    });
  } catch (err) {
    console.error("❌ CHALLAN TOTAL ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
});

// ============================================================
// CHALLAN GRID DELETE
// ASP.NET: DeletegRecptData
// Calls:
// A_SP_FOR_Challan
// @what='delete_Raja'
// @sp_462=unqid
// @sp_463=group
// ============================================================

router.post("/grid/delete", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { currentDatabase, utg, group, prefix: tokenPrefix } = decoded;

    if (!currentDatabase) {
      return res.status(400).json({
        success: false,
        message: "Database not found in token",
      });
    }

    const unqid = String(req.body.unqid ?? req.body.sp_462 ?? "").trim();

    if (!unqid) {
      return res.status(400).json({
        success: false,
        message: "unqid is required",
      });
    }

    const prefix = tokenPrefix ?? decoded.prefix ?? "RH_";

    const userGroup = group ?? utg ?? "";

    pool = await openPool(currentDatabase);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), prefix)
      .input("what", sql.NVarChar(50), "delete_Raja")
      .input("sp_462", sql.NVarChar(100), unqid)
      .input("sp_463", sql.NVarChar(100), userGroup)
      .execute("A_SP_FOR_Challan");

    return res.json({
      success: true,
      data: result.recordset || [],
      message: result.recordset?.[0]?.err ?? "Record deleted successfully",
    });
  } catch (err) {
    console.error("❌ CHALLAN DELETE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
});
// ═══════════════════════════════════════════════════════════════════════════
// NEW CHALLAN — DROPDOWN / FORM SUPPORT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/customers
// Returns booking customers (VA table joined with m1) – mirrors custname SP
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/customers", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    if (!currentDatabase)
      return res
        .status(400)
        .json({ success: false, message: "Database not found" });

    pool = await openPool(currentDatabase);
    const result = await pool.request().query(`
      SELECT DISTINCT
        m1.m1_2  AS data,
        m1.m1_7  AS value,
        m1.m1_47 AS mobile,
        m1.m1_11 AS address,
        m1.m1_37 AS gstin,
        m1.m1_40 AS panno,
        m1.m1_48 AS aadhar,
        m1.m1_51 AS title,
        m1.m1_50 AS fathername
      FROM rh_va AS va
      INNER JOIN rh_m1 AS m1 ON m1.m1_2 = va.va_23
      WHERE va.va_23 NOT IN (
        SELECT sp_469 FROM rh_sp_46 WHERE sp_469 = va.va_23
      )
      ORDER BY value ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("CHALLAN NEW CUSTOMERS ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/models
// Returns vehicle models
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/models", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    pool = await openPool(currentDatabase);
    const result = await pool.request().query(`
      SELECT sp_202 AS data, sp_207 AS value
      FROM rh_sp_20
      ORDER BY sp_207 ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("CHALLAN MODELS ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/variants?modelId=...
// Returns variants for a given model
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/variants", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const modelId = (req.query.modelId || "").trim();
    if (!modelId)
      return res
        .status(400)
        .json({ success: false, message: "modelId required" });

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("modelId", sql.NVarChar(50), modelId).query(`
        SELECT sp_20_2 AS data, sp_20_3 AS value, sp_20_4 AS fuel
        FROM rh_sp_20_c
        WHERE sp_20_1 = @modelId AND sp_20_37 = 'active'
        ORDER BY sp_20_3 ASC
      `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("CHALLAN VARIANTS ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/colors?variantId=...
// Returns colors available in stock for a given variant
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/colors", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const variantId = (req.query.variantId || "").trim();
    if (!variantId)
      return res
        .status(400)
        .json({ success: false, message: "variantId required" });

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("variantId", sql.NVarChar(50), variantId).query(`
        SELECT DISTINCT
          sp3.sp_47 AS data,
          sp14.sp_147 AS value
        FROM rh_sp_3 AS sp3
        LEFT JOIN rh_sp_14 AS sp14 ON sp14.sp_142 = sp3.sp_47
        WHERE sp3.sp_46 = @variantId AND sp3.sp_68 != '0'
        ORDER BY value ASC
      `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("CHALLAN COLORS ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/vins?variantId=...&colorId=...&challanType=...
// Returns available VINs for the selected variant + color
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/vins", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const variantId = (req.query.variantId || "").trim();
    const colorId = (req.query.colorId || "").trim();
    const challanType = (req.query.challanType || "Customer Challan").trim();

    if (!variantId)
      return res
        .status(400)
        .json({ success: false, message: "variantId required" });

    pool = await openPool(currentDatabase);
    const request = pool
      .request()
      .input("variantId", sql.NVarChar(50), variantId)
      .input("colorId", sql.NVarChar(50), colorId);

    let query = `
      SELECT
        sp_55 AS data,
        sp_55 AS value,
        sp_71 AS fsccode,
        sp_49 AS mfcyr,
        sp_56 AS location,
        sp_54 AS engine,
        sp_67 AS price
      FROM rh_sp_3
      WHERE sp_46 = @variantId
        AND sp_68 != '0'
    `;
    if (colorId) query += " AND sp_47 = @colorId";

    // For inter-dealer challan exclude 1A-class and already booked
    if (challanType === "Inter Delear Challan") {
      query += " AND sp_70 != '1A' AND sp_55 NOT IN (SELECT va_29 FROM rh_va)";
    }

    query += " ORDER BY sp_55 ASC";
    const result = await request.query(query);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("CHALLAN VINS ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/variant-details?variantId=...&challanDate=...&stateId=...
// Returns variant pricing/charges details from rh_sp_37_c
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/variant-details", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const variantId = (req.query.variantId || "").trim();
    const challanDate = (
      req.query.challanDate || new Date().toISOString().slice(0, 10)
    ).trim();
    const stateId = (req.query.stateId || "").trim();

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("variantId", sql.NVarChar(50), variantId)
      .input("challanDate", sql.NVarChar(50), challanDate)
      .input("stateId", sql.NVarChar(50), stateId).query(`
        SELECT TOP 1
          sp_37_6  AS cess,
          sp_37_7  AS gstunq,
          (SELECT sp_228 FROM rh_sp_22 WHERE sp_222 = sp_37_7) AS gst,
          sp_37_8  AS rtorate,
          sp_37_9  AS rtosurcharge,
          sp_37_10 AS greentax,
          sp_37_11 AS odrate,
          sp_37_12 AS thirdparty,
          sp_37_13 AS zd,
          sp_37_14 AS ep,
          sp_37_15 AS pb,
          sp_37_16 AS kp,
          sp_37_17 AS fasttag,
          sp_37_18 AS handlingchrg,
          sp_37_19 AS trc,
          sp_37_20 AS numberplatecharge,
          sp_37_21 AS regfee,
          sp_37_22 AS paiddriver,
          sp_37_23 AS pacover,
          sp_37_24 AS smartcard,
          sp_37_25 AS other,
          sp_37_26 AS duplicate,
          sp_37_27 AS hpn,
          sp_37_36 AS exshowroom,
          sp_37_48 AS cng,
          sp_37_53 AS bhperc,
          sp_37_54 AS bhyear
        FROM rh_sp_37_c
        WHERE sp_37_2 = @variantId
          AND sp_37_46 = @stateId
          AND dbo.getformatteddate(@challanDate) BETWEEN sp_37_34
              AND (CASE WHEN sp_37_35 = '1900-01-01 00:00:00.000' THEN GETUTCDATE() ELSE sp_37_35 END)
      `);
    return res.json({ success: true, data: result.recordset[0] || null });
  } catch (err) {
    console.error("CHALLAN VARIANT DETAILS ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/rto-cities
// Returns all RTO cities
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/rto-cities", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    pool = await openPool(currentDatabase);
    const result = await pool.request().query(`
      SELECT
        sp_332 AS data, sp_337 AS value,
        sp_339 AS rrate, sp_340 AS rtax, sp_341 AS rgreen,
        sp_342 AS rreg,  sp_343 AS rhpn,  sp_344 AS rduplicate,
        sp_345 AS rsmartcard, sp_346 AS rother, sp_347 AS trc
      FROM rh_sp_33
      ORDER BY sp_337 ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("CHALLAN RTO CITIES ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/hpn-list
// Returns hypothecation (finance) company list
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/hpn-list", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    pool = await openPool(currentDatabase);
    const result = await pool.request().query(`
      SELECT hp_2 AS data, hp_7 AS value
      FROM rh_hp
      ORDER BY hp_7 ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("CHALLAN HPN LIST ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/states
// Returns states list
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/states", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    pool = await openPool(currentDatabase);
    const result = await pool.request().query(`
      SELECT sp_777 AS data, sp_777 AS value
      FROM rh_sp_77
      ORDER BY sp_777 ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("CHALLAN STATES ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/branches
// Returns branch list
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/branches", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    pool = await openPool(currentDatabase);
    const result = await pool.request().query(`
      SELECT sp_602 AS data, sp_607 AS value
      FROM rh_sp_60
      ORDER BY sp_607 ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("CHALLAN BRANCHES ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/insurance-companies
// Returns insurance companies (m1 with m1_49 = 'INCU')
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/insurance-companies", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    pool = await openPool(currentDatabase);
    const result = await pool.request().query(`
      SELECT m1_2 AS data, m1_7 AS value
      FROM rh_m1
      WHERE m1_49 = 'INCU'
      ORDER BY m1_7 ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("CHALLAN INS COMPANIES ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/next-challan-no
// Returns the next auto-incremented challan number
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/next-challan-no", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    pool = await openPool(currentDatabase);
    const result = await pool.request().query(`
      SELECT ISNULL(MAX(CAST(sp_468 AS NUMERIC(18,0))), 0) + 1 AS nextNo
      FROM rh_sp_46
      WHERE ISNUMERIC(sp_468) = 1
    `);
    return res.json({
      success: true,
      nextNo: result.recordset[0]?.nextNo ?? 1,
    });
  } catch (err) {
    console.error("CHALLAN NEXT NO ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/challan/new/save
// Saves a new challan by calling A_SP_FOR_Challan with @what = 'insert'
// ─────────────────────────────────────────────────────────────────────────────
router.post("/new/save", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase, userId } = decoded;
    if (!currentDatabase)
      return res
        .status(400)
        .json({ success: false, message: "Database not found" });

    const data = { ...req.body };
    // Inject server-side values
    data.sp_463 = userId;
    data.sp_464 = getClientIp(req);

    // Required field check
    if (!data.sp_469)
      return res
        .status(400)
        .json({ success: false, message: "Customer (sp_469) is required" });
    if (!data.sp_470)
      return res
        .status(400)
        .json({ success: false, message: "Model (sp_470) is required" });
    if (!data.sp_471)
      return res
        .status(400)
        .json({ success: false, message: "Variant (sp_471) is required" });
    if (!data.sp_472)
      return res
        .status(400)
        .json({ success: false, message: "Color (sp_472) is required" });
    if (!data.sp_473)
      return res
        .status(400)
        .json({ success: false, message: "VIN (sp_473) is required" });

    console.log(
      "🚗 CHALLAN SAVE — DB:",
      currentDatabase,
      "Customer:",
      data.sp_469,
      "VIN:",
      data.sp_473,
    );

    pool = await openPool(currentDatabase);

    const request = pool.request();
    // All sp_461 to sp_654 + child parameters
    for (let i = 461; i <= 654; i++) {
      const key = `sp_${i}`;
      let value = data[key];
      if (value === null || value === undefined) value = "";
      if (Array.isArray(value)) value = value[0] ?? "";
      if (typeof value === "object" && value !== null) value = "";
      value = String(value).trim();

      const maxCols = [
        "sp_524",
        "sp_577",
        "sp_581",
        "sp_585",
        "sp_589",
        "sp_590",
        "sp_591",
        "sp_592",
        "sp_593",
      ];
      if (maxCols.includes(key)) {
        request.input(key, sql.NVarChar(sql.MAX), value);
      } else if (key === "sp_616") {
        request.input(key, sql.NVarChar(500), value);
      } else {
        request.input(key, sql.NVarChar(50), value);
      }
    }

    // Child table columns
    request.input("sp_46_1", sql.VarChar(50), String(data.sp_469 || ""));
    request.input("sp_46_2", sql.VarChar(50), "");
    request.input("sp_46_3", sql.VarChar(50), "");
    request.input("sp_46_4", sql.VarChar(50), "");
    request.input("sp_46_5", sql.VarChar(50), "");
    request.input("sp_46_6", sql.VarChar(50), "");
    request.input("sp_46_7", sql.VarChar(50), "");
    request.input("sp_46_8", sql.VarChar(50), "0");
    request.input("sp_46_9", sql.VarChar(50), "0");
    request.input("pageno", sql.NVarChar(50), String(data.pageno || ""));
    request.input("rows_count", sql.NVarChar(50), "");
    request.input("what", sql.NVarChar(50), "insert");
    request.input("prefix", sql.NVarChar(50), String(data.prefix || "rh_"));

    const result = await request.execute("A_SP_FOR_Challan");

    const errVal = result.recordset?.[0]?.err ?? "";
    console.log("CHALLAN SAVE RESULT:", errVal);

    if (String(errVal).startsWith("E")) {
      return res.status(400).json({ success: false, message: errVal });
    }

    // Extract the new challan UNQID from the result
    const newId = String(errVal).replace("Save successfully|", "").trim();

    // Add creator to chat members table so they can access the challan
    try {
      await pool
        .request()
        .input("challanId", sql.NVarChar(100), newId)
        .input("userId", sql.NVarChar(100), userId)
        .input("userName", sql.NVarChar(200), decoded.userName || userId)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM MA_ChallanChatMembers WHERE ChallanId = @challanId AND UserId = @userId)
          INSERT INTO MA_ChallanChatMembers (ChallanId, UserId, UserName, IsActive, JoinedAt)
          VALUES (@challanId, @userId, @userName, 1, GETDATE())
        `);
    } catch (_) {
      // Non-fatal – the challan is already saved
    }

    return res.json({
      success: true,
      message: "Challan saved successfully",
      challanId: newId,
    });
  } catch (err) {
    console.error("❌ CHALLAN SAVE ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/challan/new/receipt-amounts?customerId=...
// Returns total amounts received from receipts for a customer
// ─────────────────────────────────────────────────────────────────────────────
router.get("/new/receipt-amounts", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentDatabase } = decoded;
    const customerId = (req.query.customerId || "").trim();
    if (!customerId)
      return res
        .status(400)
        .json({ success: false, message: "customerId required" });

    pool = await openPool(currentDatabase);
    const result = await pool
      .request()
      .input("customerId", sql.NVarChar(50), customerId).query(`
        SELECT
          ISNULL(SUM(rcl_58), 0) AS totalRcAmt,
          ISNULL(SUM(CASE WHEN rcl_66 = 'Finance' THEN rcl_58 ELSE 0 END), 0) AS financeAmt,
          ISNULL(SUM(CASE WHEN rcl_66 != 'Finance' AND rcl_66 NOT IN ('Insurance','Accessories') THEN rcl_58 ELSE 0 END), 0) AS customerAmt
        FROM rh_rcl
        WHERE rcl_11 = @customerId
          AND rcl_85 = '1900-01-01 00:00:00.000'
          AND rcl_66 NOT IN ('Accessories', 'Insurance')
      `);
    return res.json({
      success: true,
      data: result.recordset[0] || {
        totalRcAmt: 0,
        financeAmt: 0,
        customerAmt: 0,
      },
    });
  } catch (err) {
    console.error("CHALLAN RC AMT ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

((module.exports = router), openCommunicationPool);
