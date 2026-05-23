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

    await pool
      .request()

      .input("user_id", sql.NVarChar, userId)

      .input("fcm_token", sql.NVarChar(sql.MAX), token).query(`
          INSERT INTO app_user_devices (
            user_id,
            fcm_token
          )
          VALUES (
            @user_id,
            @fcm_token
          )
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
module.exports = router;
