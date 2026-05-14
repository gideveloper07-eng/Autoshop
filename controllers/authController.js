const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const { getPool, sql } = require("../config/db");

// ── REGISTER ──────────────────────────────────────────────────────────────
const registerUser = async (req, res) => {
  try {
    const { name, userId, companyCode, password, email } = req.body;
    if (!name || !userId || !companyCode || !password)
      return res.status(400).json({ message: "name, userId, companyCode and password are required" });

    const pool = await getPool();

    // Check duplicate userId + companyCode combination
    const existing = await pool.request()
      .input("userId",      sql.NVarChar, userId)
      .input("companyCode", sql.NVarChar, companyCode)
      .query("SELECT id FROM Users WHERE userId = @userId AND companyCode = @companyCode");

    if (existing.recordset.length > 0)
      return res.status(400).json({ message: "User already exists for this company" });

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.request()
      .input("name",        sql.NVarChar, name)
      .input("email",       sql.NVarChar, email       || "")
      .input("userId",      sql.NVarChar, userId)
      .input("companyCode", sql.NVarChar, companyCode)
      .input("password",    sql.NVarChar, hashedPassword)
      .query(`
        INSERT INTO Users (name, email, userId, companyCode, password)
        VALUES (@name, @email, @userId, @companyCode, @password)
      `);

    res.json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── LOGIN (3 fields: companyCode + userId + password) ─────────────────────
const loginUser = async (req, res) => {

  let dynamicPool;

  try {

    // ── REQUEST DATA ───────────────────────────
    const {
      databaseName,
      userId,
      password
    } = req.body;

    console.log("🔐 LOGIN REQUEST");
    console.log("Database :", databaseName);
    console.log("User ID  :", userId);

    // ── VALIDATION ─────────────────────────────
    if (
      !databaseName ||
      !userId ||
      !password
    ) {
      return res.status(400).json({
        message:
          "databaseName, userId and password are required"
      });
    }

    // ── DYNAMIC DATABASE CONFIG ────────────────
    const dbConfig = {

      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,

      server: process.env.DB_HOST,

      port: parseInt(
        process.env.DB_PORT || "1433"
      ),

      database: databaseName,

      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    };

    // ── CONNECT DATABASE ───────────────────────
    dynamicPool =
      await new sql.ConnectionPool(dbConfig)
        .connect();

    console.log(
      "✅ Connected to DB:",
      databaseName
    );

    // ── LOGIN QUERY ────────────────────────────
    const result = await dynamicPool
      .request()
      .input("userId", sql.NVarChar, userId)
      .input("password", sql.NVarChar, password)
      .query(`
        SELECT TOP 1 *
        FROM rh_secut
        WHERE uti = @userId
        AND utp = @password
      `);

    console.log(
      "👤 USER RESULT:",
      result.recordset
    );

    // ── USER NOT FOUND ─────────────────────────
    if (result.recordset.length === 0) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    // ── USER FOUND ─────────────────────────────
    const user = result.recordset[0];

    // ── JWT TOKEN ──────────────────────────────
    const token = jwt.sign(
      {
        userId: user.uti,
        database: databaseName,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d"
      }
    );

    // ── SUCCESS RESPONSE ───────────────────────
    res.json({

      success: true,

      token,

      name: user.uti || "",
      email: "",
      userId: user.uti || userId,

      databaseName,
    });

  } catch (err) {

    console.error("❌ LOGIN ERROR:", err);

    res.status(500).json({
      error: err.message
    });

  } finally {

    // ── CLOSE CONNECTION ───────────────────────
    if (dynamicPool) {
      await dynamicPool.close();
    }
  }
};

module.exports = { registerUser, loginUser };
