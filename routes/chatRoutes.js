const express = require("express");
const router = express.Router();
const sql = require("mssql");

const { decodeToken } = require("../middleware/authMiddleware");
const { sendPushNotification } = require("../utils/pushNotificationHelper");

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

    // ── INSERT MESSAGE ────────────────────────────────────────────────
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

    // ── RESPOND IMMEDIATELY so the sender is not kept waiting ─────────
    res.json({ success: true });

    // ── PUSH NOTIFICATIONS (fire-and-forget after response) ───────────
    // Find all distinct users who have participated in this challan chat,
    // excluding the sender — notify them all.
    try {
      const participantsResult = await pool
        .request()
        .input("challanId", sql.VarChar, challanId)
        .input("senderId", sql.VarChar, userId).query(`
          SELECT DISTINCT SenderUserId
          FROM MA_ChallanChat
          WHERE ChallanId = @challanId
            AND SenderUserId <> @senderId
        `);

      const participantIds = participantsResult.recordset.map(
        (r) => r.SenderUserId,
      );

      // Also notify the challan owner (sp_462 → look up via challan details)
      // if they are not already in the participant list.
      // We store challan owner separately when available.
      // For now, notify all found participants.

      const shortMessage =
        messageText.length > 60
          ? messageText.substring(0, 57) + "..."
          : messageText;

      for (const recipientId of participantIds) {
        // sendPushNotification handles missing tokens gracefully
        sendPushNotification(
          pool,
          recipientId,
          `New message from ${senderName}`,
          shortMessage,
          {
            type: "CHAT_MESSAGE",
            challanId: challanId,
            senderName: senderName,
          },
        ).catch((e) =>
          console.error("PUSH NOTIFY ERROR for", recipientId, e.message),
        );
      }
    } catch (notifyErr) {
      // Never let notification errors bubble up — message was already sent
      console.error("CHAT PUSH NOTIFICATION ERROR:", notifyErr.message);
    }
  } catch (err) {
    console.error(err);
    // Only send error response if headers not already sent
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: err.message });
    }
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
