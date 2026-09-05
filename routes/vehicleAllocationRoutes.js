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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vehicle-allocation/list
// Returns the vehicle allocation grid (@what = 'grid')
// ─────────────────────────────────────────────────────────────────────────────
router.get("/list", async (req, res) => {
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

    console.log("📋 VEHICLE ALLOCATION LIST — DB:", databaseName);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "grid")
      .input("VA_12", sql.NVarChar(50), "")
      .input("VA_18", sql.NVarChar(50), "")
      .input("VA_23", sql.NVarChar(50), "")
      .input("VA_26", sql.NVarChar(50), "")
      .input("VA_27", sql.NVarChar(50), "")
      .input("VA_28", sql.NVarChar(50), "")
      .input("VA_29", sql.NVarChar(50), "")
      .input("VA_30", sql.NVarChar(50), "")
      .input("pageno", sql.NVarChar(50), "")
      .execute("A_SP_FOR_Vehicle_Allocation");

    console.log(`✅ VA List rows: ${result.recordset.length}`);

    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("❌ VA LIST ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vehicle-allocation/search?q=<term>
// Returns filtered list (@what = 'Search', uses VA_18 as search term)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/search", async (req, res) => {
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

    const searchTerm = str(req.query.q);
    console.log("🔍 VA SEARCH — DB:", databaseName, "term:", searchTerm);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "Search")
      .input("VA_12", sql.NVarChar(50), "")
      .input("VA_18", sql.NVarChar(50), searchTerm)
      .input("VA_23", sql.NVarChar(50), "")
      .input("VA_26", sql.NVarChar(50), "")
      .input("VA_27", sql.NVarChar(50), "")
      .input("VA_28", sql.NVarChar(50), "")
      .input("VA_29", sql.NVarChar(50), "")
      .input("VA_30", sql.NVarChar(50), "")
      .input("pageno", sql.NVarChar(50), "")
      .execute("A_SP_FOR_Vehicle_Allocation");

    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("❌ VA SEARCH ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vehicle-allocation/edit/:va_12
// Returns full record for editing (@what = 'Edit')
// ─────────────────────────────────────────────────────────────────────────────
router.get("/edit/:va_12", async (req, res) => {
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

    const { va_12 } = req.params;
    console.log("📝 VA EDIT — DB:", databaseName, "va_12:", va_12);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "Edit")
      .input("VA_12", sql.NVarChar(50), va_12)
      .input("VA_18", sql.NVarChar(50), "")
      .input("VA_23", sql.NVarChar(50), "")
      .input("VA_26", sql.NVarChar(50), "")
      .input("VA_27", sql.NVarChar(50), "")
      .input("VA_28", sql.NVarChar(50), "")
      .input("VA_29", sql.NVarChar(50), "")
      .input("VA_30", sql.NVarChar(50), "")
      .input("pageno", sql.NVarChar(50), "")
      .execute("A_SP_FOR_Vehicle_Allocation");

    if (!result.recordset || result.recordset.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });
    }

    // Also fetch the VIN list for this edit record
    const vinResult = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "RH_")
      .input("what", sql.NVarChar(50), "vinno_view")
      .input("VA_12", sql.NVarChar(50), va_12)
      .input("VA_18", sql.NVarChar(50), "")
      .input("VA_23", sql.NVarChar(50), "")
      .input("VA_26", sql.NVarChar(50), "")
      .input("VA_27", sql.NVarChar(50), "")
      .input("VA_28", sql.NVarChar(50), "")
      .input("VA_29", sql.NVarChar(50), "")
      .input("VA_30", sql.NVarChar(50), "")
      .input("pageno", sql.NVarChar(50), "")
      .execute("A_SP_FOR_Vehicle_Allocation");

    return res.json({
      success: true,
      data: result.recordset[0],
      vinList: vinResult.recordset || [],
    });
  } catch (err) {
    console.error("❌ VA EDIT ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vehicle-allocation/dropdowns
// Returns all dropdown data: customers, model, variant, colour, location, staff
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

    console.log("📦 VA DROPDOWNS — DB:", databaseName);

    pool = await openPool(databaseName);

    const makeRequest = (what) =>
      pool
        .request()
        .input("prefix", sql.NVarChar(50), "rh_")
        .input("what", sql.NVarChar(50), what)
        .input("VA_12", sql.NVarChar(50), "")
        .input("VA_18", sql.NVarChar(50), "")
        .input("VA_23", sql.NVarChar(50), "")
        .input("VA_26", sql.NVarChar(50), "")
        .input("VA_27", sql.NVarChar(50), "")
        .input("VA_28", sql.NVarChar(50), "")
        .input("VA_29", sql.NVarChar(50), "")
        .input("VA_30", sql.NVarChar(50), "")
        .input("pageno", sql.NVarChar(50), "")
        .execute("A_SP_FOR_Vehicle_Allocation");

    const [customers, models, variants, colours, locations, staff] =
      await Promise.all([
        makeRequest("customer"),
        makeRequest("model"),
        makeRequest("variant"),
        makeRequest("colour"),
        makeRequest("location"),
        makeRequest("staff"),
      ]);

    return res.json({
      success: true,
      data: {
        customers: customers.recordset || [],
        models: models.recordset || [],
        variants: variants.recordset || [],
        colours: colours.recordset || [],
        locations: locations.recordset || [],
        staff: staff.recordset || [],
      },
    });
  } catch (err) {
    console.error("❌ VA DROPDOWNS ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vehicle-allocation/customer-details/:custUnq
// Returns customer details after selection (@what = 'Customer_Name')
// ─────────────────────────────────────────────────────────────────────────────
router.get("/customer-details/:custUnq", async (req, res) => {
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

    const { custUnq } = req.params;

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "Customer_Name")
      .input("VA_12", sql.NVarChar(50), "")
      .input("VA_18", sql.NVarChar(50), "")
      .input("VA_23", sql.NVarChar(50), custUnq)
      .input("VA_26", sql.NVarChar(50), "")
      .input("VA_27", sql.NVarChar(50), "")
      .input("VA_28", sql.NVarChar(50), "")
      .input("VA_29", sql.NVarChar(50), "")
      .input("VA_30", sql.NVarChar(50), "")
      .input("pageno", sql.NVarChar(50), "")
      .execute("A_SP_FOR_Vehicle_Allocation");

    if (!result.recordset || result.recordset.length === 0) {
      return res.json({ success: true, data: null });
    }

    return res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error("❌ VA CUSTOMER DETAILS ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vehicle-allocation/vinno?model=&variant=&colour=
// Returns available VIN numbers (@what = 'vinno')
// ─────────────────────────────────────────────────────────────────────────────
router.get("/vinno", async (req, res) => {
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

    const va26 = str(req.query.model);
    const va27 = str(req.query.variant);
    const va28 = str(req.query.colour);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "vinno")
      .input("VA_12", sql.NVarChar(50), "")
      .input("VA_18", sql.NVarChar(50), "")
      .input("VA_23", sql.NVarChar(50), "")
      .input("VA_26", sql.NVarChar(50), va26)
      .input("VA_27", sql.NVarChar(50), va27)
      .input("VA_28", sql.NVarChar(50), va28)
      .input("VA_29", sql.NVarChar(50), "")
      .input("VA_30", sql.NVarChar(50), "")
      .input("pageno", sql.NVarChar(50), "")
      .execute("A_SP_FOR_Vehicle_Allocation");

    return res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error("❌ VA VINNO ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vehicle-allocation/all-vin-details?model=&variant=&colour=
// Returns full VIN details grid (@what = 'all_vin_details')
// ─────────────────────────────────────────────────────────────────────────────
router.get("/all-vin-details", async (req, res) => {
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

    const va26 = str(req.query.model);
    const va27 = str(req.query.variant);
    const va28 = str(req.query.colour);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "all_vin_details")
      .input("VA_12", sql.NVarChar(50), "")
      .input("VA_18", sql.NVarChar(50), "")
      .input("VA_23", sql.NVarChar(50), "")
      .input("VA_26", sql.NVarChar(50), va26)
      .input("VA_27", sql.NVarChar(50), va27)
      .input("VA_28", sql.NVarChar(50), va28)
      .input("VA_29", sql.NVarChar(50), "")
      .input("VA_30", sql.NVarChar(50), "")
      .input("pageno", sql.NVarChar(50), "")
      .execute("A_SP_FOR_Vehicle_Allocation");

    return res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error("❌ VA ALL-VIN-DETAILS ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vehicle-allocation/fsccode?model=&variant=&colour=
// Returns FSC codes for the model/variant/colour combo (@what = 'fsccode')
// ─────────────────────────────────────────────────────────────────────────────
router.get("/fsccode", async (req, res) => {
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

    const va26 = str(req.query.model);
    const va27 = str(req.query.variant);
    const va28 = str(req.query.colour);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "fsccode")
      .input("VA_12", sql.NVarChar(50), "")
      .input("VA_18", sql.NVarChar(50), "")
      .input("VA_23", sql.NVarChar(50), "")
      .input("VA_26", sql.NVarChar(50), va26)
      .input("VA_27", sql.NVarChar(50), va27)
      .input("VA_28", sql.NVarChar(50), va28)
      .input("VA_29", sql.NVarChar(50), "")
      .input("VA_30", sql.NVarChar(50), "")
      .input("pageno", sql.NVarChar(50), "")
      .execute("A_SP_FOR_Vehicle_Allocation");

    return res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error("❌ VA FSCCODE ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vehicle-allocation/save
// Inserts a new vehicle allocation record (@what = 'insert')
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
      VA_17, VA_18, VA_20, VA_21, VA_22,
      VA_23, VA_24, VA_25, VA_26, VA_27,
      VA_28, VA_29, VA_30,
    } = req.body;

    const clientIp = getClientIp(req);

    console.log("💾 VA SAVE — DB:", databaseName, "VIN:", VA_29);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "insert")
      .input("VA_12", sql.NVarChar(50), "")
      .input("VA_13", sql.NVarChar(50), str(userId))
      .input("VA_14", sql.NVarChar(50), clientIp)
      .input("VA_15", sql.NVarChar(50), "")
      .input("VA_16", sql.NVarChar(50), "")
      .input("VA_17", sql.NVarChar(50), str(VA_17))
      .input("VA_18", sql.NVarChar(50), str(VA_18))
      .input("VA_19", sql.NVarChar(50), "")
      .input("VA_20", sql.NVarChar(50), str(VA_20))
      .input("VA_21", sql.NVarChar(50), str(VA_21))
      .input("VA_22", sql.NVarChar(50), str(VA_22))
      .input("VA_23", sql.NVarChar(50), str(VA_23))
      .input("VA_24", sql.NVarChar(50), str(VA_24))
      .input("VA_25", sql.NVarChar(50), str(VA_25))
      .input("VA_26", sql.NVarChar(50), str(VA_26))
      .input("VA_27", sql.NVarChar(50), str(VA_27))
      .input("VA_28", sql.NVarChar(50), str(VA_28))
      .input("VA_29", sql.NVarChar(50), str(VA_29))
      .input("VA_30", sql.NVarChar(50), str(VA_30))
      .input("VA_31", sql.NVarChar(50), "")
      .input("VA_32", sql.NVarChar(50), "")
      .input("pageno", sql.NVarChar(50), "")
      .execute("A_SP_FOR_Vehicle_Allocation");

    const firstRow = result.recordsets?.[0]?.[0];
    const errMsg = str(firstRow?.err ?? "");

    if (errMsg.startsWith("E01")) {
      return res.status(400).json({ success: false, message: errMsg });
    }

    console.log("✅ VA SAVED:", VA_29);
    return res.json({
      success: true,
      message: "Saved successfully",
      data: result.recordsets,
    });
  } catch (err) {
    console.error("❌ VA SAVE ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/vehicle-allocation/:va_12
// Deletes a vehicle allocation record (@what = 'delete')
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:va_12", async (req, res) => {
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

    const { va_12 } = req.params;
    console.log("🗑️ VA DELETE — DB:", databaseName, "va_12:", va_12);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "delete")
      .input("VA_12", sql.NVarChar(50), va_12)
      .input("VA_18", sql.NVarChar(50), "")
      .input("VA_23", sql.NVarChar(50), "")
      .input("VA_26", sql.NVarChar(50), "")
      .input("VA_27", sql.NVarChar(50), "")
      .input("VA_28", sql.NVarChar(50), "")
      .input("VA_29", sql.NVarChar(50), "")
      .input("VA_30", sql.NVarChar(50), "")
      .input("VA_31", sql.NVarChar(50), "")
      .input("VA_32", sql.NVarChar(50), "")
      .input("pageno", sql.NVarChar(50), "")
      .execute("A_SP_FOR_Vehicle_Allocation");

    const firstRow = result.recordsets?.[0]?.[0];
    const errMsg = str(firstRow?.err ?? "");

    if (errMsg.toLowerCase().includes("challan")) {
      return res.status(400).json({ success: false, message: errMsg });
    }

    return res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    console.error("❌ VA DELETE ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vehicle-allocation/cancel
// Cancels a vehicle allocation record (@what = 'Cancel')
// Body: { va_12, va_31 (reason), va_32 (cancellation date) }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/cancel", async (req, res) => {
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

    const { va_12, va_31, va_32 } = req.body;
    console.log("❌ VA CANCEL — DB:", databaseName, "va_12:", va_12);

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("prefix", sql.NVarChar(50), "rh_")
      .input("what", sql.NVarChar(50), "Cancel")
      .input("VA_12", sql.NVarChar(50), str(va_12))
      .input("VA_18", sql.NVarChar(50), "")
      .input("VA_23", sql.NVarChar(50), "")
      .input("VA_26", sql.NVarChar(50), "")
      .input("VA_27", sql.NVarChar(50), "")
      .input("VA_28", sql.NVarChar(50), "")
      .input("VA_29", sql.NVarChar(50), "")
      .input("VA_30", sql.NVarChar(50), "")
      .input("VA_31", sql.NVarChar(50), str(va_31))
      .input("VA_32", sql.NVarChar(50), str(va_32))
      .input("pageno", sql.NVarChar(50), "")
      .execute("A_SP_FOR_Vehicle_Allocation");

    const firstRow = result.recordsets?.[0]?.[0];
    const errMsg = str(firstRow?.err ?? "");

    if (errMsg.toLowerCase().includes("challan")) {
      return res.status(400).json({ success: false, message: errMsg });
    }

    return res.json({
      success: true,
      message: errMsg || "Cancelled successfully",
    });
  } catch (err) {
    console.error("❌ VA CANCEL ERROR:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
});

module.exports = router;
