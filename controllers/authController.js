const jwt = require("jsonwebtoken");
const { sql } = require("../config/db");
const { decodeToken } = require("../middleware/authMiddleware");
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
async function openMasterPool() {
  const pool = await new sql.ConnectionPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "1433"),
    database: "CMPY_AUTOSHOP",
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
  let masterPool;
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
           utnm,
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
    let clientId = null;
    let userGuid = null;
    let accessibleDatabases = [];
    let propertyCode = null;
    let propertyName = null;

    try {
      masterPool = await openMasterPool();

      const clientResult = await masterPool
        .request()
        .input("db", sql.NVarChar, databaseName).query(`
   SELECT
    unqid,
    propertycode,
    propertyname
FROM MA_ClientMaster
WHERE propertydb = @db
    `);

      clientId = clientResult.recordset[0]?.unqid ?? null;
      propertyCode = clientResult.recordset[0]?.propertycode ?? null;
      propertyName = clientResult.recordset[0]?.propertyname ?? null;

      console.log("Client Result:", clientResult.recordset);
      console.log("ClientId:", clientId);
      console.log("PropertyCode:", propertyCode);
      console.log("PropertyName:", propertyName);

      if (clientId) {
        const userGuidResult = await masterPool
          .request()
          .input("clientId", sql.UniqueIdentifier, clientId)
          .input("loginId", sql.NVarChar, userId).query(`
        SELECT UserGuid
        FROM MA_MasterUsers
        WHERE ClientId=@clientId
        AND LoginId=@loginId
      `);

        userGuid = userGuidResult.recordset[0]?.UserGuid ?? null;

        if (userGuid) {
          const accessResult = await masterPool
            .request()
            .input("userGuid", sql.UniqueIdentifier, userGuid).query(`
          SELECT
              CM.unqid,
              CM.propertycode,
              CM.propertyname,
              CM.propertydb
          FROM MA_UserDatabaseAccess UA
          INNER JOIN MA_ClientMaster CM
              ON UA.ClientId = CM.unqid
          WHERE UA.UserGuid = @userGuid
        `);

          accessibleDatabases = accessResult.recordset;
        }
      }
    } catch (e) {
      console.log("Master lookup skipped:", e.message);
    }
    const isAdmin = String(user.uti).trim().toLowerCase() === "adm";
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

    // Identity (never changes after login)
    const loginDatabase = databaseName;
    const loginPropertyCode = propertyCode;
    const loginPropertyName = propertyName;
    const loginClientId = clientId;

    // Working dealership (changes after switch)
    const currentDatabase = databaseName;
    const currentPropertyCode = propertyCode;
    const currentPropertyName = propertyName;
    const currentClientId = clientId;

    const token = jwt.sign(
      {
        userId: user.uti,
        userName: user.utnm,

        // Permanent Login Identity
        loginDatabase,
        loginPropertyCode,
        loginPropertyName,
        loginClientId,

        // Current Working Dealership
        currentDatabase,
        currentPropertyCode,
        currentPropertyName,
        currentClientId,

        userGuid,
        utg: user.UTG || user.utg,
        isAdmin,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    return res.json({
      success: true,
      token,

      userId: user.uti,
      userName: user.utnm,
      name: user.utnm,

      // Permanent Login Identity
      loginDatabase,
      loginPropertyCode,
      loginPropertyName,
      loginClientId,

      // Current Working Dealership
      currentDatabase,
      currentPropertyCode,
      currentPropertyName,
      currentClientId,

      // Backward compatibility (existing Flutter code)
      databaseName: currentDatabase,
      propertyCode: currentPropertyCode,
      propertyName: currentPropertyName,
      clientId: currentClientId,

      userGuid,
      accessibleDatabases,
      utg: user.UTG || user.utg,
      isAdmin,
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
    if (masterPool) await masterPool.close();
  }
};
const switchDatabase = async (req, res) => {
  let masterPool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { clientId } = req.body;

    masterPool = await openMasterPool();

    const accessResult = await masterPool
      .request()
      .input("userGuid", sql.UniqueIdentifier, decoded.userGuid)
      .input("clientId", sql.UniqueIdentifier, clientId).query(`
        SELECT
            CM.unqid,
            CM.propertycode,
            CM.propertyname,
            CM.propertydb
        FROM MA_UserDatabaseAccess UA
        INNER JOIN MA_ClientMaster CM
            ON UA.ClientId = CM.unqid
        WHERE UA.UserGuid = @userGuid
          AND UA.ClientId = @clientId
      `);

    if (accessResult.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const db = accessResult.recordset[0];

    // Create a new token while preserving login identity.
    const token = jwt.sign(
      {
        userId: decoded.userId,
        userName: decoded.userName,

        // ===== LOGIN IDENTITY (Never changes) =====
        loginDatabase: decoded.loginDatabase,
        loginPropertyCode: decoded.loginPropertyCode,
        loginPropertyName: decoded.loginPropertyName,
        loginClientId: decoded.loginClientId,

        // ===== CURRENT WORKING DEALERSHIP =====
        currentDatabase: db.propertydb,
        currentPropertyCode: db.propertycode,
        currentPropertyName: db.propertyname,
        currentClientId: db.unqid,

        userGuid: decoded.userGuid,
        utg: decoded.utg,
        isAdmin: decoded.isAdmin,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    return res.json({
      success: true,
      token,

      // Current dealership
      currentDatabase: db.propertydb,
      currentPropertyCode: db.propertycode,
      currentPropertyName: db.propertyname,
      currentClientId: db.unqid,

      // Backward compatibility
      databaseName: db.propertydb,
      propertyCode: db.propertycode,
      propertyName: db.propertyname,
      clientId: db.unqid,
    });
  } catch (err) {
    console.error("SWITCH DATABASE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (masterPool) {
      await masterPool.close();
    }
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

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  switchDatabase,
};
