const express = require("express");

const router = express.Router();

const sql = require("mssql");

const {
  registerUser,
  loginUser,
  logoutUser,
} = require("../controllers/authController");

const { decodeToken, verifyToken } = require("../middleware/authMiddleware");

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

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.post("/save-fcm-token", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database: databaseName, userId } = decoded;

    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token required",
      });
    }

    pool = await openPool(databaseName);

    // DELETE all old tokens for this user, then insert the new one.
    // This ensures 1 user = 1 token = 1 notification (no duplicates).
    await pool
      .request()
      .input("user_id", sql.NVarChar, userId)
      .input("fcm_token", sql.NVarChar(sql.MAX), token).query(`
        -- Remove all existing tokens for this user
        DELETE FROM app_user_devices
        WHERE user_id = @user_id;

        -- Insert the fresh token
        INSERT INTO app_user_devices (user_id, fcm_token)
        VALUES (@user_id, @fcm_token);
      `);

    return res.json({
      success: true,
    });
  } catch (err) {
    console.error("SAVE FCM ERROR:", err.message);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});
router.post("/activity-log", async (req, res) => {
  let pool;

  try {
    console.log("===== ACTIVITY LOG REQUEST =====");
    console.log("BODY:", req.body);

    const decoded = decodeToken(req);

    console.log("DECODED TOKEN:", decoded);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database: databaseName, userId } = decoded;

    const {
      activityType,
      activityName,
      screenName,
      userName,
      deviceInfo,
      appVersion,
    } = req.body;

    console.log("DATABASE:", databaseName);
    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      req.connection?.remoteAddress ||
      "";
    pool = await openPool(databaseName);

    await pool
      .request()
      .input("userId", sql.VarChar, userId)
      .input("activityType", sql.VarChar, activityType)
      .input("activityName", sql.VarChar, activityName)
      .input("screenName", sql.VarChar, screenName || "")
      .input("deviceInfo", sql.VarChar, deviceInfo || "")
      .input("appVersion", sql.VarChar, appVersion || "")
      .input("ipAddress", sql.VarChar, ipAddress).query(`
    INSERT INTO MA_UserActivityHistory
    (
      UAH_ID,
      UserId,
      ActivityType,
      ActivityName,
      ScreenName,
      ActivityDateTime,
      DeviceInfo,
      AppVersion,
      IPAddress
    )
    VALUES
    (
      NEWID(),
      @userId,
      @activityType,
      @activityName,
      @screenName,
      GETDATE(),
      @deviceInfo,
      @appVersion,
      @ipAddress
    )
  `);

    return res.json({
      success: true,
    });
  } catch (err) {
    console.error("ACTIVITY LOG ERROR:");
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});

module.exports = router;
