const express = require("express");
const jwt = require("jsonwebtoken");
const sql = require("mssql");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const FormData = require("form-data");

const router = express.Router();
const openPool = require("../utils/dynamicPoolManager");

// ============================================================
// UPLOAD CONFIGURATION
// ============================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(png|jpe?g|webp)$/i.test(file.originalname || "");

    if (!allowed) {
      return cb(new Error("Only PNG, JPG, JPEG, and WebP images are allowed."));
    }

    cb(null, true);
  },
});

// ============================================================
// AUTHENTICATION
// ============================================================

function decodeToken(req) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch (err) {
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

// ============================================================
// HELPERS
// ============================================================

function safeSegment(value) {
  return (
    String(value || "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80) || "default"
  );
}

function getFirstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
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
  return callback(pool);
}

function sendServerError(res, message, err) {
  console.error(message, err);

  return res.status(500).json({
    success: false,
    message,
    error: err?.message || String(err),
  });
}

// ============================================================
// GET CUSTOMERS
// GET /api/finance/customers
// ============================================================

router.get("/customers", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  try {
    const result = await withPool(session.database, (pool) =>
      runFinance(pool, "customer", {
        prefix: "rh_",
      }),
    );

    res.json({
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    sendServerError(res, "Unable to load eligible customers.", err);
  }
});

// ============================================================
// GET FINANCERS / BANKS
// GET /api/finance/banks
// ============================================================

router.get("/banks", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  try {
    const result = await withPool(session.database, (pool) =>
      runFinance(pool, "bank", {
        prefix: "rh_",
      }),
    );

    res.json({
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    sendServerError(res, "Unable to load financiers.", err);
  }
});

// ============================================================
// GET FINANCER BRANCHES
// GET /api/finance/banks/:bankId/branches
// ============================================================

router.get("/banks/:bankId/branches", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  const bankId = String(req.params.bankId || "").trim();

  if (!bankId) {
    return res.status(400).json({
      success: false,
      message: "Financer ID is required.",
    });
  }

  try {
    const result = await withPool(session.database, (pool) =>
      runFinance(pool, "branch", {
        prefix: "rh_",
        sp_688: bankId,
      }),
    );

    res.json({
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    sendServerError(res, "Unable to load financier branches.", err);
  }
});

// ============================================================
// GET COMPANY BRANCH
// GET /api/finance/company-branch/:customerId
// ============================================================

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

    res.json({
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    sendServerError(res, "Unable to load company branch.", err);
  }
});

// ============================================================
// FINANCE HISTORY
// GET /api/finance/history/:financeId
// ============================================================

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

    res.json({
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    sendServerError(res, "Unable to load finance history.", err);
  }
});

// ============================================================
// GET FINANCE RECORD FOR EDIT
// GET /api/finance/edit/:financeId
// ============================================================

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

    res.json({
      success: true,
      data: result.recordset?.[0] || null,
    });
  } catch (err) {
    sendServerError(res, "Unable to load finance record.", err);
  }
});

// ============================================================
// INSERT / UPDATE FINANCE DETAILS
// POST /api/finance/save
// ============================================================

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
    sp_679: getFirstValue(body.contact, body.contactNo, "0"),
    sp_680: body.address || "",
    sp_681: body.tlId || "",
    sp_682: body.scId || "",
    sp_683: body.modelId || "",
    sp_684: body.variantId || "",
    sp_685: getFirstValue(body.colorId, body.colourId, ""),
    sp_686: body.bookingDate || "",
    sp_687: body.financeArrangement || "In",
    sp_688: body.financerId || "",
    sp_689: getFirstValue(body.branchId, body.financerBranchId, ""),
    sp_690: body.concerningName || "",
    sp_691: body.concerningMobile || "",
    sp_692: body.status || "Pending",
    sp_693: body.financeDate || "",
    sp_694: body.remark || "",
    sp_695: body.receiptId || "",
    sp_696: body.loanAmount || "0.00",
    sp_697: body.expectedDelivery || "",
    // Uploaded document path saved into sp_698.
    sp_698: getFirstValue(body.doUpload, body.DOUPLOAD, ""),
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

    res.json({
      success: true,
      message: String(message),
      data: row,
      financeId: row.sp_672 || financeId || null,
    });
  } catch (err) {
    sendServerError(res, "Unable to save finance details.", err);
  }
});

// ============================================================
// UPLOAD FINANCE DO IMAGE
// POST /api/finance/upload
//
// Multipart fields:
//   file       = image
//   customerId = selected customer ID
//
// ASP.NET saves the image on the website server.
// Returns data.doUpload for SQL sp_698.
// ============================================================

router.post(
  "/upload",
  (req, res, next) => {
    const session = auth(req, res);
    if (!session) return;

    req.financeSession = session;
    next();
  },
  upload.single("file"),
  async (req, res) => {
    const session = req.financeSession;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "Choose an image first.",
      });
    }

    const customerId = String(req.body.customerId || "").trim();

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Select a customer before uploading.",
      });
    }

    try {
      const companyCode = safeSegment(
        session.decoded.companyCode ||
          session.decoded.company_code ||
          "default",
      );

      const customerSegment = safeSegment(customerId);
      const extension = path.extname(req.file.originalname).toLowerCase();

      if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
        return res.status(400).json({
          success: false,
          message: "Only PNG, JPG, JPEG and WebP images are supported.",
        });
      }

      const uniqueId = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;

      const fileName = `${customerSegment}_DOUPLOAD_${uniqueId}${extension}`;

      const secret = process.env.FINANCE_UPLOAD_SECRET;

      const endpoint =
        process.env.FINANCE_ASPNET_UPLOAD_URL ||
        "https://myautoshop365.com/FinanceImageUpload.aspx";

      if (!secret || !endpoint) {
        console.error("Finance ASP.NET upload configuration is missing.");

        return res.status(500).json({
          success: false,
          message: "Upload service is not configured.",
        });
      }

      // Forward the image to the ASP.NET website server.
      const form = new FormData();

      form.append("companyCode", companyCode);
      form.append("fileName", fileName);

      form.append("file", req.file.buffer, {
        filename: fileName,
        contentType: req.file.mimetype,
      });

      const response = await axios.post(endpoint, form, {
        headers: {
          ...form.getHeaders(),
          "X-Upload-Secret": secret,
        },
        maxBodyLength: 11 * 1024 * 1024,
        maxContentLength: 11 * 1024 * 1024,
        timeout: 30000,
      });

      const result = response.data;

      if (
        !result ||
        result.success !== true ||
        typeof result.path !== "string" ||
        !result.path.trim()
      ) {
        console.error("ASP.NET upload returned an invalid response:", result);

        return res.status(502).json({
          success: false,
          message: "Website server did not confirm the upload.",
        });
      }

      const doUpload = result.path.replace(/^\/+/, "");

      // Accept only the expected website-relative directory.
      const expectedPrefix = `upload/doupload/${companyCode}/`;

      if (
        !doUpload.startsWith(expectedPrefix) ||
        doUpload.includes("..") ||
        doUpload.includes("\\")
      ) {
        console.error("ASP.NET returned an invalid upload path:", doUpload);

        return res.status(502).json({
          success: false,
          message: "Website server returned an invalid image path.",
        });
      }

      console.log("FINANCE DO UPLOAD SUCCESS:", {
        companyCode,
        fileName: result.fileName || fileName,
        savedPath: doUpload,
        bytes: req.file.size,
      });

      return res.json({
        success: true,
        message: "DO image uploaded successfully.",
        data: {
          doUpload,
          fileName: result.fileName || fileName,
        },
        path: doUpload,
        imageUrl: `https://myautoshop365.com/${doUpload}`,
      });
    } catch (err) {
      console.error("FINANCE UPLOAD ERROR:", {
        code: err.code,
        message: err.message,
        endpoint: process.env.FINANCE_ASPNET_UPLOAD_URL,
        status: err.response?.status,
        response: err.response?.data,
      });

      return res.status(502).json({
        success: false,
        message: "Could not upload the image to the website server.",
      });
    }
  },
);

// ============================================================
// ERROR HANDLER
// ============================================================

router.use((err, req, res, next) => {
  console.error("FINANCE ROUTE ERROR:", err);

  res.status(400).json({
    success: false,
    message: err.message || "Upload failed.",
  });
});

module.exports = router;
