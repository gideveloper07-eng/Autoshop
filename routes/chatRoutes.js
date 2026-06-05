const express = require("express");
const router = express.Router();
const sql = require("mssql");

const { decodeToken } = require("../middleware/authMiddleware");

async function openPool(databaseName) {
  return await new sql.ConnectionPool({
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
}

// ── POST /api/chat/send ──────────────────────────────────────────────────────
router.post("/send", async (req, res) => {
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

    const { challanId, messageText, senderName } = req.body;

    pool = await openPool(databaseName);

    await pool
      .request()
      .input("challanId", sql.VarChar, challanId)
      .input("userId", sql.VarChar, userId)
      .input("senderName", sql.VarChar, senderName)
      .input("messageText", sql.VarChar(sql.MAX), messageText).query(`
        INSERT INTO MA_ChallanChat
        (
            ChatId,
            ChallanId,
            SenderUserId,
            SenderName,
            MessageText,
            MessageTime,
            IsRead
        )
        VALUES
        (
            NEWID(),
            @challanId,
            @userId,
            @senderName,
            @messageText,
            GETDATE(),
            0
        )
      `);

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── POST /api/chat/mark-read/:challanId ──────────────────────────────────────
// Marks all messages in a challan as read for the current user
// (only marks messages sent by OTHER users)
router.post("/mark-read/:challanId", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName, userId } = decoded;
    const { challanId } = req.params;

    pool = await openPool(databaseName);

    await pool
      .request()
      .input("challanId", sql.VarChar, challanId)
      .input("userId", sql.VarChar, userId).query(`
        UPDATE MA_ChallanChat
        SET IsRead = 1
        WHERE ChallanId = @challanId
          AND SenderUserId <> @userId
          AND IsRead = 0
      `);

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── GET /api/chat/unread-count/:challanId ────────────────────────────────────
// IMPORTANT: This must be declared BEFORE GET /:challanId to avoid conflict.
// Returns the count of unread messages sent by others for a given challan.
router.get("/unread-count/:challanId", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName, userId } = decoded;
    const { challanId } = req.params;

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("challanId", sql.VarChar, challanId)
      .input("userId", sql.VarChar, userId).query(`
        SELECT COUNT(*) AS UnreadCount
        FROM MA_ChallanChat
        WHERE ChallanId = @challanId
          AND SenderUserId <> @userId
          AND IsRead = 0
      `);

    const count = result.recordset[0]?.UnreadCount ?? 0;

    return res.json({ success: true, count });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── GET /api/chat/:challanId ─────────────────────────────────────────────────
// Fetch all messages for a challan (wildcard — must be LAST)
router.get("/:challanId", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database: databaseName } = decoded;

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("challanId", sql.VarChar, req.params.challanId).query(`
        SELECT
            ChatId,
            SenderUserId,
            SenderName,
            MessageText,
            MessageTime
        FROM MA_ChallanChat
        WHERE ChallanId = @challanId
        ORDER BY MessageTime
      `);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

module.exports = router;
