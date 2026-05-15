const express = require("express");
const cors = require("cors");
const https = require("https");
const http_mod = require("http");
const sql = require("mssql");

require("dotenv").config();

const { getPool } = require("./config/db");
const initDb = require("./config/initDb");

// ── ROUTES ───────────────────────────────────────────
const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const adminRoutes = require("./routes/adminRoutes");
const publicRoutes = require("./routes/publicRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const agentRoutes = require("./routes/agentRoutes");

const app = express();

// ── MIDDLEWARE ───────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// ── ROUTES ───────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/agent", agentRoutes);

// ── HEALTH CHECK ─────────────────────────────────────
app.get("/", (_, res) => {
  res.json({
    status: "ok",
    db: "SQL Server",
    time: Date.now(),
  });
});

app.get("/ping", (_, res) => {
  res.json({
    pong: true,
  });
});

// ─────────────────────────────────────────────────────
// VALIDATE COMPANY API
// ─────────────────────────────────────────────────────
app.post("/api/validate-company", async (req, res) => {
  try {
    const { companyCode } = req.body;

    console.log("🔍 validate-company called:", companyCode);

    if (!companyCode) {
      return res.status(400).json({
        success: false,
        databaseName: "",
        companyName: "",
        message: "Company code is required",
      });
    }

    const pool = await getPool();

    // ── FIND COMPANY ───────────────────────────────
    const result = await pool
      .request()
      .input("companyCode", sql.NVarChar, companyCode).query(`
        SELECT 
          cmp_11,   -- Company Code
          cmp_12,   -- Database Name
          cmp_8     -- Company Name
        FROM cmpy
        WHERE UPPER(cmp_11) = UPPER(@companyCode)
      `);

    console.log("📦 Result:", result.recordset);

    // ── COMPANY FOUND ─────────────────────────────
    if (result.recordset.length > 0) {
      const row = result.recordset[0];

      return res.json({
        success: true,
        companyCode: row.cmp_11 || "",
        databaseName: row.cmp_12 || "",
        companyName: row.cmp_8 || "",
      });
    }

    // ── COMPANY NOT FOUND ─────────────────────────
    return res.json({
      success: false,
      databaseName: "",
      companyName: "",
      message: "Invalid company code",
    });
  } catch (error) {
    console.error("❌ Validate Company Error:", error);

    return res.status(500).json({
      success: false,
      databaseName: "",
      companyName: "",
      error: error.message,
    });
  }
});

// NOTE: /api/auth/login and /api/auth/logout are handled by authRoutes (routes/authRoutes.js)

// ─────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    // ── DEFAULT DB CONNECTION ────────────────────
    await getPool();

    console.log("✅ SQL Server Connected");

    // ── INIT DB ──────────────────────────────────
    await initDb();

    // ── START SERVER ─────────────────────────────
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    // ── SELF PING ────────────────────────────────
    const RENDER_URL = process.env.RENDER_URL || `http://localhost:${PORT}`;

    setInterval(
      () => {
        const url = new URL(RENDER_URL + "/ping");

        const mod = url.protocol === "https:" ? https : http_mod;

        const req = mod.get(url.toString(), (res) => {
          console.log(`🏓 Self-ping: ${res.statusCode}`);
        });

        req.on("error", (e) => {
          console.log("Ping error:", e.message);
        });

        req.end();
      },
      14 * 60 * 1000,
    );
  } catch (err) {
    console.error("❌ Failed to connect to SQL Server:", err.message);

    process.exit(1);
  }
})();
