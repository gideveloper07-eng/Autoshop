const { sql } = require("../config/db");
const { decodeToken } = require("../middleware/authMiddleware");

// IMPORTANT:
// Use the shared dynamic pool manager.
// DO NOT create/close a new pool inside this controller.
const openPool = require("../utils/dynamicPoolManager");

// ============================================================
// GET NOTIFICATIONS
// GET /api/notifications
// ============================================================
const getNotifications = async (req, res) => {
  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const databaseName =
      decoded.currentDatabase || decoded.loginDatabase || decoded.database;

    const { userId } = decoded;

    if (!databaseName || !userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token database/user information",
      });
    }

    const pool = await openPool(databaseName);

    const result = await pool.request().input("userId", sql.NVarChar, userId)
      .query(`
        SELECT
          id,
          user_id,
          title,
          message,
          type,
          reference_id,
          is_read,
          created_on
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
  }

  // ❌ DO NOT CLOSE pool here.
  // dynamicPoolManager owns the shared connection.
};

// ============================================================
// GET UNREAD COUNT
// GET /api/notifications/unread-count
// ============================================================
const getUnreadNotificationCount = async (req, res) => {
  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const databaseName =
      decoded.currentDatabase || decoded.loginDatabase || decoded.database;

    const { userId } = decoded;

    if (!databaseName || !userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token database/user information",
      });
    }

    const pool = await openPool(databaseName);

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
  }

  // ❌ DO NOT CLOSE pool here.
};

// ============================================================
// MARK NOTIFICATION AS READ
// POST /api/notifications/read/:id
// ============================================================
const markNotificationAsRead = async (req, res) => {
  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const databaseName =
      decoded.currentDatabase || decoded.loginDatabase || decoded.database;

    const { userId } = decoded;
    const { id } = req.params;

    if (!databaseName || !userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token database/user information",
      });
    }

    const pool = await openPool(databaseName);

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
  }

  // ❌ DO NOT CLOSE pool here.
};

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
};
