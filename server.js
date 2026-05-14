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

// ─────────────────────────────────────────────────────
// DYNAMIC LOGIN API
// ─────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  let dynamicPool;

  try {
    const { databaseName, userId, password } = req.body;

    console.log("🔐 Login Request");

    console.log("Database:", databaseName);
    console.log("User ID:", userId);

    // ── VALIDATION ─────────────────────────────
    if (!databaseName || !userId || !password) {
      return res.status(400).json({
        success: false,
        message: "databaseName, userId and password are required",
      });
    }

    // ── DB CONFIG ──────────────────────────────
    const dbConfig = {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "1433"),

      database: databaseName,

      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    };

    // ── CONNECT ────────────────────────────────
    dynamicPool = await new sql.ConnectionPool(dbConfig).connect();

    console.log("✅ Connected");

    // ── LOGIN QUERY ────────────────────────────
    const userResult = await dynamicPool
      .request()
      .input("userId", sql.NVarChar, userId)
      .input("password", sql.NVarChar, password).query(`
        SELECT TOP 1 *
        FROM rh_secut
        WHERE uti = @userId
        AND utp = @password
      `);

    console.log(userResult.recordset);

    // ── SUCCESS ────────────────────────────────
    if (userResult.recordset.length > 0) {
      const user = userResult.recordset[0];

      const jwt = require("jsonwebtoken");
      const token = jwt.sign(
        { userId: user.uti, database: databaseName },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        success: true,
        token,

        userId: user.uti || userId,
        name: user.uti || "",
        email: "",

        databaseName,
      });
    }

    // ── INVALID LOGIN ──────────────────────────
    return res.status(401).json({
      success: false,
      message: "Invalid User ID or Password",
    });
  } catch (error) {
    console.error("❌ LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  } finally {
    if (dynamicPool) {
      await dynamicPool.close();
    }
  }
});

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
