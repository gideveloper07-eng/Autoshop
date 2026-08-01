const express = require("express");

const router = express.Router();

const sql = require("mssql");

const {
  registerUser,
  loginUser,
  logoutUser,
  switchDatabase,
} = require("../controllers/authController");

const { decodeToken, verifyToken } = require("../middleware/authMiddleware");
const openPool = require("../utils/dynamicPoolManager");
// async function openPool(databaseName) {
//   const pool = await new sql.ConnectionPool({
//     user: process.env.DB_USER,

//     password: process.env.DB_PASSWORD,

//     server: process.env.DB_HOST,

//     port: parseInt(process.env.DB_PORT || "1433"),

//     database: databaseName,

//     options: {
//       encrypt: false,

//       trustServerCertificate: true,
//     },
//   }).connect();

//   return pool;
// }

async function openCommunicationPool() {
  return await new sql.ConnectionPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "1433"),
    database: "AUTOSHOP_COMMUNICATION",
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  }).connect();
}

router.post("/switch-database", verifyToken, switchDatabase);
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

    const userId = decoded.userId;

    const propertyCode = decoded.loginPropertyCode || decoded.propertyCode;

    const databaseName = decoded.currentDatabase || decoded.loginDatabase;

    const { token, platform, deviceModel, appVersion } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token required",
      });
    }

    pool = await openCommunicationPool();

    await pool
      .request()
      .input("userId", sql.NVarChar(100), userId)
      .input("propertyCode", sql.NVarChar(50), propertyCode)
      .input("databaseName", sql.NVarChar(100), databaseName)
      .input("deviceToken", sql.NVarChar(sql.MAX), token)
      .input("platform", sql.NVarChar(20), platform || "android")
      .input("deviceModel", sql.NVarChar(100), deviceModel || "")
      .input("appVersion", sql.NVarChar(20), appVersion || "").query(`
IF EXISTS
(
    SELECT 1
    FROM MA_UserDevices
    WHERE DeviceToken=@deviceToken
)
BEGIN

    UPDATE MA_UserDevices
    SET
        UserId=@userId,
        PropertyCode=@propertyCode,
        DatabaseName=@databaseName,
        Platform=@platform,
        DeviceModel=@deviceModel,
        AppVersion=@appVersion,
        IsActive=1,
        LastUpdated=GETDATE()

    WHERE DeviceToken=@deviceToken;

END
ELSE
BEGIN

    INSERT INTO MA_UserDevices
    (
        UserId,
        PropertyCode,
        DatabaseName,
        DeviceToken,
        Platform,
        DeviceModel,
        AppVersion,
        IsActive,
        CreatedOn,
        LastUpdated
    )
    VALUES
    (
        @userId,
        @propertyCode,
        @databaseName,
        @deviceToken,
        @platform,
        @deviceModel,
        @appVersion,
        1,
        GETDATE(),
        GETDATE()
    );

END
`);

    return res.json({
      success: true,
      message: "FCM token saved.",
    });
  } catch (err) {
    console.error("SAVE FCM TOKEN ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
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

    const databaseName = decoded.currentDatabase || decoded.loginDatabase;

    const userId = decoded.userId;

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
    // if (pool) await pool.close();
  }
});

module.exports = router;
