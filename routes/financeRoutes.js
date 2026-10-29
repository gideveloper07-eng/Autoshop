const express = require("express");
const jwt = require("jsonwebtoken");
const sql = require("mssql");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const FormData = require("form-data");
const dns = require("dns");
const http = require("http");

const router = express.Router();
const openPool = require("../utils/dynamicPoolManager");

// ============================================================
// LOCAL IIS ROUTING
// Connect to local IIS while preserving the hostname binding.
// ============================================================

function localIisLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  if (String(hostname).toLowerCase() === "myautoshop365.com") {
    return callback(null, "127.0.0.1", 4);
  }

  return dns.lookup(hostname, options || {}, callback);
}

const localIisHttpAgent = new http.Agent({
  keepAlive: true,
  lookup: localIisLookup,
});

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
function safeNumeric(value, fallback = "0.00") {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const text = String(value).trim();

  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return fallback;
  }

  return text;
}
router.post("/save", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  const body = req.body || {};

  // =====================================================
  // 1. CUSTOMER IS OPTIONAL
  // =====================================================
  const customerId = String(body.customerId || "").trim();

  // =====================================================
  // 2. FINANCE OPERATION
  // =====================================================
  const financeId = String(body.financeId || "").trim();
  const what = financeId ? "update" : "insert";

  const userId = session.decoded.userId || session.decoded.user_id || "";

  // =====================================================
  // 3. GET CLIENT IP
  // =====================================================
  const ip = String(
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || "",
  )
    .split(",")[0]
    .trim();

  // =====================================================
  // 4. PREPARE STORED PROCEDURE PARAMETERS
  // =====================================================
  const fields = {
    prefix: "rh_",
    sp_672: financeId,
    sp_673: userId,
    sp_674: ip,

    sp_677: body.entryDate || new Date().toISOString().slice(0, 10),

    // Customer details are optional
    sp_678: customerId,
    sp_679: getFirstValue(body.contact, body.contactNo, "0"),
    sp_680: body.address || "",
    sp_681: body.tlId || "",
    sp_682: body.scId || "",
    sp_683: body.modelId || "",
    sp_684: body.variantId || "",
    sp_685: getFirstValue(body.colorId, body.colourId, ""),
    sp_686: body.bookingDate || "",

    // Finance details are optional
    sp_687: body.financeArrangement || "In",
    sp_688: body.financerId || "",
    sp_689: getFirstValue(body.branchId, body.financerBranchId, ""),
    sp_690: body.concerningName || "",
    sp_691: body.concerningMobile || "",
    sp_692: body.status || "Pending",
    sp_693: body.financeDate || "",
    sp_694: body.remark || "",
    sp_695: body.receiptId || "",
    sp_696: safeNumeric(body.loanAmount),
    sp_697: body.expectedDelivery || "",

    // Uploaded document path
    sp_698: String(body.doUpload ?? body.DOUPLOAD ?? "").trim(),

    // Company branch ID
    sp_699: String(body.companyBranchId ?? body.sp_699 ?? "").trim(),

    sp_700: safeNumeric(body.disbursedAmount),
  };

  // =====================================================
  // 5. EXECUTE STORED PROCEDURE
  // =====================================================
  try {
    console.log("----------------------------------------");
    console.log("FINANCE SAVE DEBUG - START");
    console.log("Database:", session.database);
    console.log("Operation:", what);
    console.log("Finance ID:", financeId || "(new record)");
    console.log("Customer ID:", customerId || "(not selected)");
    console.log("Company Branch ID:", fields.sp_699 || "(empty)");
    console.log("Document path present:", Boolean(fields.sp_698));
    console.log("----------------------------------------");

    const result = await withPool(session.database, (pool) =>
      runFinance(pool, what, fields),
    );

    const row = result?.recordset?.[0] || {};

    console.log("FINANCE SAVE DEBUG - RESULT");
    console.log("Result row:", row);
    console.log("Rows affected:", result?.rowsAffected);

    // =====================================================
    // 6. DETECT STORED PROCEDURE FAILURE
    // =====================================================
    const rawMessage =
      row.err ??
      row.error ??
      row.ErrorMessage ??
      row.message ??
      row.Message ??
      "";

    const procedureMessage = String(rawMessage).trim();

    const isSuccessMessage = /\b(success|successfully|saved|updated)\b/i.test(
      procedureMessage,
    );

    const statusValue = String(row.success ?? row.Success ?? row.status ?? "")
      .trim()
      .toLowerCase();

    const explicitlyFailed =
      ["false", "0", "fail", "failed", "error"].includes(statusValue) ||
      (Boolean(procedureMessage) &&
        !isSuccessMessage &&
        (/\b(error|failed|failure|invalid|cannot)\b/i.test(procedureMessage) ||
          Boolean(row.error) ||
          Boolean(row.ErrorMessage)));

    if (explicitlyFailed) {
      console.error("FINANCE SAVE - PROCEDURE FAILURE:", row);

      return res.status(400).json({
        success: false,
        message: procedureMessage || "Finance details could not be saved.",
        data: row,
      });
    }

    // =====================================================
    // 7. SUCCESS RESPONSE
    // =====================================================
    const message =
      procedureMessage ||
      (what === "insert" ? "Save Successfully" : "Update Successfully");

    console.log("FINANCE SAVE - COMPLETED");
    console.log("Message:", message);
    console.log("----------------------------------------");

    return res.json({
      success: true,
      message,
      data: row,
      financeId: row.sp_672 || row.financeId || financeId || null,
    });
  } catch (err) {
    // =====================================================
    // 8. SQL / SERVER ERROR
    // =====================================================
    console.error("----------------------------------------");
    console.error("FINANCE SAVE DEBUG - ERROR");
    console.error("Operation:", what);
    console.error("Database:", session.database);
    console.error("Error message:", err?.message);
    console.error("Error code:", err?.code);
    console.error("SQL original error:", err?.originalError?.message);
    console.error("SQL number:", err?.number);
    console.error("----------------------------------------");

    return sendServerError(res, "Unable to save finance details.", err);
  }
});

// ============================================================
// FINANCE GRID
// GET /api/finance/grid?page=1&search=
// Stored procedure: A_SP_FOR_FINANCE_DETAIL_NEW
// ============================================================

router.get("/grid", async (req, res) => {
  const session = auth(req, res);
  if (!session) return;

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const search = String(req.query.search || "").trim();

  try {
    const result = await withPool(session.database, async (pool) => {
      const request = pool.request();

      request
        .input("prefix", sql.NVarChar(50), "rh_")
        .input("what", sql.NVarChar(50), search ? "search" : "griddata")
        .input("pageno", sql.NVarChar(50), String(page));

      if (search) {
        request.input("sp_677", sql.NVarChar(50), search);
      }

      return request.execute("A_SP_FOR_FINANCE_DETAIL_NEW");
    });

    return res.json({
      success: true,
      page,
      pageSize: 10,
      data: result.recordset || [],
      hasMore: (result.recordset || []).length === 10,
    });
  } catch (err) {
    console.error("FINANCE GRID ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load finance grid.",
      error: err.message,
    });
  }
});

// ============================================================
// UPLOAD FINANCE DO IMAGE
// POST /api/finance/upload
// ============================================================

// ============================================================
// UPLOAD FINANCE DO IMAGE
// POST /api/finance/upload
// ============================================================

router.post(
  "/upload",

  // ----------------------------------------------------------
  // AUTHENTICATION
  // ----------------------------------------------------------
  (req, res, next) => {
    const session = auth(req, res);

    if (!session) return;

    req.financeSession = session;
    next();
  },

  upload.single("file"),

  async (req, res) => {
    const session = req.financeSession;

    // --------------------------------------------------------
    // VALIDATE IMAGE
    // --------------------------------------------------------
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
      // ------------------------------------------------------
      // COMPANY AND FILE DETAILS
      // ------------------------------------------------------
      const companyCode = safeSegment(
        session.decoded.loginPropertyCode ||
          session.decoded.loginPropertyCode ||
          "default",
      );

      const customerSegment = safeSegment(customerId);

      const extension = path.extname(req.file.originalname || "").toLowerCase();

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

      // ------------------------------------------------------
      // CONFIGURATION
      // ------------------------------------------------------
      const secret = process.env.FINANCE_UPLOAD_SECRET;

      const endpoint =
        process.env.FINANCE_ASPNET_UPLOAD_URL ||
        "http://127.0.0.1/FinanceImageUpload.aspx";

      if (!secret) {
        console.error("Finance upload secret is not configured.");

        return res.status(500).json({
          success: false,
          message: "Upload service is not configured.",
        });
      }

      const endpointUrl = new URL(endpoint);

      // Allow only the local IIS upload endpoint.
      if (
        endpointUrl.protocol !== "http:" ||
        !["127.0.0.1", "localhost"].includes(
          endpointUrl.hostname.toLowerCase(),
        ) ||
        endpointUrl.pathname !== "/FinanceImageUpload.aspx"
      ) {
        console.error("Invalid local IIS upload endpoint:", endpoint);

        return res.status(500).json({
          success: false,
          message: "Invalid local IIS upload endpoint configuration.",
        });
      }

      // ------------------------------------------------------
      // BUILD MULTIPART REQUEST
      // ------------------------------------------------------
      const form = new FormData();

      form.append("companyCode", companyCode);
      form.append("fileName", fileName);

      form.append("file", req.file.buffer, {
        filename: fileName,
        contentType: req.file.mimetype,
      });

      // ------------------------------------------------------
      // FORWARD IMAGE TO LOCAL IIS
      // ------------------------------------------------------
      const response = await axios.post(endpoint, form, {
        headers: {
          ...form.getHeaders(),
          Host: "myautoshop365.com",
          "X-Upload-Secret": secret,
        },
        maxBodyLength: 11 * 1024 * 1024,
        maxContentLength: 11 * 1024 * 1024,
        timeout: 30000,
      });

      // ------------------------------------------------------
      // PARSE ASP.NET RESPONSE
      //
      // The ASP.NET page may return JSON followed by Web Forms
      // HTML. Extract the first complete JSON object.
      // ------------------------------------------------------
      let result = response.data;

      if (typeof result === "string") {
        const start = result.indexOf('{"success":true');

        if (start === -1) {
          console.error(
            "ASP.NET response did not contain a success JSON object:",
            result,
          );

          return res.status(502).json({
            success: false,
            message: "Website server returned an invalid response.",
          });
        }

        const jsonText = result.slice(start);

        let depth = 0;
        let inString = false;
        let escaped = false;
        let end = -1;

        for (let i = 0; i < jsonText.length; i++) {
          const char = jsonText[i];

          if (inString) {
            if (escaped) {
              escaped = false;
            } else if (char === "\\") {
              escaped = true;
            } else if (char === '"') {
              inString = false;
            }

            continue;
          }

          if (char === '"') {
            inString = true;
          } else if (char === "{") {
            depth++;
          } else if (char === "}") {
            depth--;

            if (depth === 0) {
              end = i + 1;
              break;
            }
          }
        }

        if (end === -1) {
          console.error("Incomplete JSON returned by ASP.NET.");

          return res.status(502).json({
            success: false,
            message: "Incomplete JSON returned by website server.",
          });
        }

        try {
          result = JSON.parse(jsonText.slice(0, end));
        } catch (parseError) {
          console.error("ASP.NET JSON parsing error:", parseError.message);

          return res.status(502).json({
            success: false,
            message: "Could not parse the website upload response.",
          });
        }
      }

      // ------------------------------------------------------
      // VALIDATE ASP.NET RESPONSE
      // ------------------------------------------------------
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

      // ------------------------------------------------------
      // NORMALIZE RETURNED PATH
      // ------------------------------------------------------
      const doUpload = result.path
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");

      // ------------------------------------------------------
      // VALIDATE RETURNED PATH
      // ------------------------------------------------------
      const expectedPrefix = `upload/doupload/${companyCode}/`;

      if (
        !doUpload.startsWith(expectedPrefix) ||
        doUpload.includes("..") ||
        doUpload.includes("\\") ||
        doUpload.includes(":") ||
        doUpload.includes("?") ||
        doUpload.includes("#")
      ) {
        console.error("ASP.NET returned an invalid upload path:", doUpload);

        return res.status(502).json({
          success: false,
          message: "Website server returned an invalid image path.",
        });
      }

      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------
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
        endpoint:
          process.env.FINANCE_ASPNET_UPLOAD_URL ||
          "http://127.0.0.1/FinanceImageUpload.aspx",
        status: err.response?.status,
        response:
          typeof err.response?.data === "string"
            ? err.response.data.slice(0, 2000)
            : err.response?.data,
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
