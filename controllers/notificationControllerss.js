const { sql } = require("../config/db");
const { decodeToken } = require("../middleware/authMiddleware");
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

const getNotifications = async (req, res) => {
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

    pool = await openPool(databaseName);

    const result = await pool.request().input("userId", sql.NVarChar, userId)
      .query(`
        SELECT *
        FROM app_notifications
        WHERE user_id = @userId
        ORDER BY created_on DESC
      `);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("NOTIFICATION ERROR:", err.message);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
};

const getUnreadNotificationCount = async (req, res) => {
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

    pool = await openPool(databaseName);

    const result = await pool.request().input("userId", sql.NVarChar, userId)
      .query(`
        SELECT COUNT(*) AS unread_count
        FROM app_notifications
        WHERE user_id = @userId
        AND is_read = 0
      `);

    return res.json({
      success: true,
      unread_count: result.recordset[0]?.unread_count ?? 0,
    });
  } catch (err) {
    console.error("UNREAD COUNT ERROR:", err.message);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
};

const markNotificationAsRead = async (req, res) => {
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

    const { id } = req.params;

    pool = await openPool(databaseName);

    await pool
      .request()

      .input("id", sql.NVarChar, id)

      .input("userId", sql.NVarChar, userId).query(`
        UPDATE app_notifications
        SET is_read = 1
        WHERE id = @id
        AND user_id = @userId
      `);

    return res.json({
      success: true,
    });
  } catch (err) {
    console.error("MARK READ ERROR:", err.message);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
};
module.exports = {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
};
