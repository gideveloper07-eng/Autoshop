const jwt = require("jsonwebtoken");
const { sql } = require("../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// Helper: open a dynamic pool to a specific database
// ─────────────────────────────────────────────────────────────────────────────
async function openPool(databaseName) {
  const pool = await new sql.ConnectionPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "1433"),
    database: databaseName,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  }).connect();
  return pool;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN  POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
const loginUser = async (req, res) => {
  let pool;
  try {
    const { databaseName, userId, password, deviceId } = req.body;

    console.log("🔐 LOGIN REQUEST");
    console.log("   Database :", databaseName);
    console.log("   User ID  :", userId);
    console.log("   Device ID:", deviceId);

    // ── 1. Basic validation ──────────────────────────────────────────────────
    if (!databaseName || !userId || !password) {
      return res.status(400).json({
        success: false,
        message: "databaseName, userId and password are required",
      });
    }

    if (!deviceId || String(deviceId).trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Device ID is required",
      });
    }

    const cleanDeviceId = String(deviceId).trim();

    // ── 2. Connect to company database ──────────────────────────────────────
    pool = await openPool(databaseName);
    console.log("✅ Connected to DB:", databaseName);

    // ── 3. Verify credentials ────────────────────────────────────────────────
    const userResult = await pool
      .request()
      .input("userId", sql.NVarChar, userId)
      .input("password", sql.NVarChar, password).query(`
        SELECT TOP 1
          uti,
          is_logged_in,
          logged_device_id,
          last_login,
          utg as utg
        FROM rh_secut
        WHERE uti = @userId
          AND utp = @password
      `);

    if (userResult.recordset.length === 0) {
      console.log("❌ Invalid credentials for:", userId);
      return res.status(401).json({
        success: false,
        message: "Invalid User ID or Password",
      });
    }

    const user = userResult.recordset[0];
    console.log("✅ User found:", user.uti);
    console.log("   is_logged_in    :", user.is_logged_in);
    console.log("   logged_device_id:", user.logged_device_id);
    console.log(user);
    console.log("UTG:", user.utg);
    console.log("UTG CAPS:", user.UTG);
    // ── 4. Device-lock check ─────────────────────────────────────────────────
    // mssql BIT can come back as true/false or 1/0 depending on driver version
    const isLoggedIn = user.is_logged_in === true || user.is_logged_in === 1;
    const oldDeviceId = user.logged_device_id
      ? String(user.logged_device_id).trim()
      : null;

    if (isLoggedIn && oldDeviceId && oldDeviceId !== cleanDeviceId) {
      console.log("🚫 Blocked — already logged in on device:", oldDeviceId);
      return res.status(403).json({
        success: false,
        message: "This account is already logged in on another device",
      });
    }

    // ── 5. Mark as logged in ─────────────────────────────────────────────────
    await pool
      .request()
      .input("userId", sql.NVarChar, userId)
      .input("deviceId", sql.NVarChar, cleanDeviceId).query(`
        UPDATE rh_secut
        SET
          is_logged_in     = 1,
          logged_device_id = @deviceId,
          last_login       = GETDATE()
        WHERE uti = @userId
      `);

    console.log("✅ DB updated — is_logged_in=1, device:", cleanDeviceId);

    // ── 6. Issue JWT ─────────────────────────────────────────────────────────
    const token = jwt.sign(
      {
        userId: user.uti,
        database: databaseName,
        utg: user.UTG || user.utg,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    // ── 7. Respond ───────────────────────────────────────────────────────────
    return res.json({
      success: true,
      token,
      userId: user.uti || userId,
      name: user.uti || userId,
      email: "",
      databaseName,
      utg: user.UTG || user.utg,
      message: "Login Successful",
    });
  } catch (err) {
    console.error("❌ LOGIN ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT  POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
const logoutUser = async (req, res) => {
  let pool;
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const { userId, database: databaseName } = decoded;
    console.log("🚪 LOGOUT — userId:", userId, "db:", databaseName);

    pool = await openPool(databaseName);

    await pool.request().input("userId", sql.NVarChar, userId).query(`
        UPDATE rh_secut
        SET
          is_logged_in     = 0,
          logged_device_id = NULL
        WHERE uti = @userId
      `);

    console.log("✅ DB updated — is_logged_in=0 for:", userId);

    return res.json({ success: true, message: "Logout successful" });
  } catch (err) {
    console.error("❌ LOGOUT ERROR:", err.message);
    return res.status(500).json({ success: false, message: "Server Error" });
  } finally {
    if (pool) await pool.close();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER  POST /api/auth/register  (kept for compatibility)
// ─────────────────────────────────────────────────────────────────────────────
const registerUser = async (req, res) => {
  return res.status(501).json({ message: "Registration not supported" });
};

module.exports = { registerUser, loginUser, logoutUser };
