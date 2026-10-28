const express = require("express");
const jwt = require("jsonwebtoken");
const sql = require("mssql");
const multer = require("multer");
const fs = require("fs/promises");
const path = require("path");

const router = express.Router();
const openPool = require("../utils/dynamicPoolManager");

// ==========================================
// DOCUMENT UPLOAD CONFIGURATION
// ==========================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|png|jpe?g|docx?)$/i.test(file.originalname || "");

    cb(
      allowed
        ? null
        : new Error(
            "Only PDF, PNG, JPG, JPEG, DOC and DOCX files are allowed.",
          ),
      allowed,
    );
  },
});

// ==========================================
// AUTHENTICATION
// ==========================================

function decodeToken(req) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function auth(req, res) {
  const decoded = decodeToken(req);

  if (!decoded) {
    res.status(401).json({
      success: false,
      message: "Unauthorized. Please sign in again.",
    });
    return null;
  }

  const database = decoded.currentDatabase || decoded.database;

  if (!database) {
    res.status(400).json({
      success: false,
      message: "Database not found in token.",
    });
    return null;
  }

  return { decoded, database };
}

// ==========================================
// HELPERS
// ==========================================

function safeSegment(value) {
  return (
    String(value || "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80) || "default"
  );
}

async function runFinance(pool, what, inputs = {}) {
  const request = pool
    .request()
    .input("prefix", sql.NVarChar(50), inputs.prefix || "rh_")
    .input("what", sql.NVarChar(50), what);

  for (const [name, value] of Object.entries(inputs)) {
    if (
      name === "prefix" ||
      name === "what" ||
      value === undefined ||
      value === null
    ) {
      continue;
    }

    request.input(name, sql.NVarChar(sql.MAX), String(value));
  }

  return request.execute("A_SP_FOR_Finance_details");
}

async function withPool(database, callback) {
  const pool = await openPool(database);

  // Assumes openPool returns a request-ready connection pool.
  // If dynamicPoolManager caches shared pools, do not close
  // them per request.
  return callback(pool);
}

// ==========================================
// GET FINANCE CUSTOMERS
// GET /api/finance/customers
// ==========================================

router.get("/customers", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  try {
    const result = await withPool(session.database, (pool) =>
      runFinance(pool, "customer", {
        prefix: "rh_",
      }),
    );

    return res.json({
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    console.error("FINANCE CUSTOMERS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load eligible customers.",
      error: err.message,
    });
  }
});

// ==========================================
// GET FINANCERS / BANKS
// GET /api/finance/banks
// ==========================================

router.get("/banks", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  try {
    const result = await withPool(session.database, (pool) =>
      runFinance(pool, "bank", {
        prefix: "rh_",
      }),
    );

    return res.json({
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    console.error("FINANCE BANKS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load financiers.",
      error: err.message,
    });
  }
});

// ==========================================
// GET FINANCER BRANCHES
// GET /api/finance/banks/:bankId/branches
// ==========================================

router.get("/banks/:bankId/branches", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  try {
    const result = await withPool(session.database, (pool) =>
      runFinance(pool, "branch", {
        prefix: "rh_",
        sp_688: req.params.bankId,
      }),
    );

    return res.json({
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    console.error("FINANCE BRANCHES ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load financier branches.",
      error: err.message,
    });
  }
});

// ==========================================
// GET COMPANY BRANCH BY CUSTOMER
// GET /api/finance/company-branch/:customerId
// ==========================================

router.get("/company-branch/:customerId", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  try {
    const result = await withPool(session.database, (pool) =>
      runFinance(pool, "Brnch", {
        prefix: "rh_",
        sp_699: req.params.customerId,
      }),
    );

    return res.json({
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    console.error("FINANCE COMPANY BRANCH ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load company branch.",
      error: err.message,
    });
  }
});

// ==========================================
// GET FINANCE STATUS HISTORY
// GET /api/finance/history/:financeId
// ==========================================

router.get("/history/:financeId", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  try {
    const result = await withPool(session.database, (pool) =>
      runFinance(pool, "griddetails", {
        prefix: "rh_",
        sp_672: req.params.financeId,
      }),
    );

    return res.json({
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    console.error("FINANCE HISTORY ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load finance history.",
      error: err.message,
    });
  }
});

// ==========================================
// GET EXISTING FINANCE RECORD FOR EDIT
// GET /api/finance/edit/:financeId
// ==========================================

// This uses the legacy stored procedure:
// A_SP_FOR_FINANCE_DETAIL_NEW @what='onedit'

router.get("/edit/:financeId", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  try {
    const result = await withPool(session.database, (pool) =>
      pool
        .request()
        .input("what", sql.NVarChar(50), "onedit")
        .input("sp_672", sql.NVarChar(50), req.params.financeId)
        .execute("A_SP_FOR_FINANCE_DETAIL_NEW"),
    );

    return res.json({
      success: true,
      data: result.recordset?.[0] || null,
    });
  } catch (err) {
    console.error("FINANCE EDIT ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load finance record.",
      error: err.message,
    });
  }
});

// ==========================================
// INSERT / UPDATE FINANCE DETAILS
// POST /api/finance/save
// ==========================================

router.post("/save", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  const body = req.body || {};

  const customerId = String(body.customerId || "").trim();

  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: "Select a customer before saving.",
    });
  }

  const financeId = String(body.financeId || "").trim();

  const what = financeId ? "update" : "insert";

  const userId = session.decoded.userId || session.decoded.user_id || "";

  const ip = String(
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || "",
  )
    .split(",")[0]
    .trim();

  const fields = {
    prefix: "rh_",

    sp_672: financeId,
    sp_673: userId,
    sp_674: ip,

    sp_677: body.entryDate || new Date().toISOString().slice(0, 10),

    sp_678: customerId,
    sp_679: body.contact || "0",
    sp_680: body.address || "",

    sp_681: body.tlId || "",
    sp_682: body.scId || "",
    sp_683: body.modelId || "",
    sp_684: body.variantId || "",
    sp_685: body.colorId || "",

    sp_686: body.bookingDate || "",
    sp_687: body.financeArrangement || "In",

    sp_688: body.financerId || "",
    sp_689: body.branchId || "",

    sp_690: body.concerningName || "",
    sp_691: body.concerningMobile || "",

    sp_692: body.status || "Pending",
    sp_693: body.financeDate || "",
    sp_694: body.remark || "",

    sp_695: body.receiptId || "",
    sp_696: body.loanAmount || "0.00",

    sp_697: body.expectedDelivery || "",
    sp_698: body.doUpload || "",

    sp_699: body.companyBranchId || "",
    sp_700: body.disbursedAmount || "0.00",
  };

  try {
    const result = await withPool(session.database, (pool) =>
      runFinance(pool, what, fields),
    );

    const row = result.recordset?.[0] || {};

    const message =
      row.err ||
      row.message ||
      (what === "insert" ? "Save Successfully" : "Update Successfully");

    return res.json({
      success: true,
      message: String(message),
      data: row,
      financeId: row.sp_672 || financeId || null,
    });
  } catch (err) {
    console.error("FINANCE SAVE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to save finance details.",
      error: err.message,
    });
  }
});

// ==========================================
// UPLOAD FINANCE DO DOCUMENT
// POST /api/finance/upload
// ==========================================

router.post("/upload", upload.single("file"), async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Choose a document first.",
    });
  }

  const customerId = String(req.body.customerId || "").trim();

  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: "Select a customer before uploading the document.",
    });
  }

  try {
    const companyCode = safeSegment(session.decoded.companyCode || "default");

    const customerSegment = safeSegment(customerId);

    const extension = path.extname(req.file.originalname).toLowerCase();

    const fileName = `${customerSegment}_DOUPLOAD${extension}`;

    const uploadRoot =
      process.env.FINANCE_UPLOAD_DIR || path.join(process.cwd(), "Upload");

    const destination = path.join(uploadRoot, companyCode);

    await fs.mkdir(destination, {
      recursive: true,
    });

    await fs.writeFile(path.join(destination, fileName), req.file.buffer);

    const doUpload = `~/Upload/${companyCode}/${fileName}`;

    return res.json({
      success: true,
      message: "Document uploaded.",
      data: {
        doUpload,
        fileName,
      },
    });
  } catch (err) {
    console.error("FINANCE UPLOAD ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to upload document.",
      error: err.message,
    });
  }
});

// ==========================================
// UPLOAD ERROR HANDLER
// ==========================================

router.use((err, _req, res, next) => {
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Upload failed.",
    });
  }

  return next();
});

module.exports = router;
