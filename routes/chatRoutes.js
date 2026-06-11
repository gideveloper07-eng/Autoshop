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
// ── POST /api/chat/send ─────────────────────────────────────────────
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

    const {
      challanId,
      messageText,
      senderName,
      challanNo,
      messageType,
      documentId,
    } = req.body;

    pool = await openPool(databaseName);

    // INSERT CHAT MESSAGE
    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("senderName", sql.NVarChar(500), senderName)
      .input("messageText", sql.NVarChar(sql.MAX), messageText)
      .input("messageType", sql.VarChar(20), messageType || "TEXT")
      .input("documentId", sql.UniqueIdentifier, documentId || null).query(`
      INSERT INTO MA_ChallanChat
      (
          ChatId,
          ChallanId,
          SenderUserId,
          SenderName,
          MessageText,
          MessageType,
          DocumentId,
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
          @messageType,
          @documentId,
          GETDATE(),
          0
      )
  `);

    // SEND PUSH NOTIFICATIONS
    try {
      const shortMessage =
        messageText.length > 60
          ? messageText.substring(0, 57) + "..."
          : messageText;

      // Fetch the challan number (sp_468) for this challanId so we can
      // show "Challan Chat - 982" instead of the raw GUID in the notification
      let challanNo = challanId;
      try {
        const challanResult = await pool
          .request()
          .input("challanId", sql.VarChar, challanId).query(`
            SELECT TOP 1 sp_468
            FROM MA_SP_462
            WHERE sp_462 = @challanId
          `);
        if (
          challanResult.recordset.length > 0 &&
          challanResult.recordset[0].sp_468
        ) {
          challanNo = challanResult.recordset[0].sp_468.toString();
        }
      } catch (e) {
        // sp_468 lookup failed — fall back to challanId, not a critical error
        console.log("CHALLAN NO LOOKUP SKIPPED:", e.message);
      }

      // Use challanNo passed from client (already known by Flutter)
      // Fall back to challanId if not provided
      const displayChallanNo = challanNo || challanId;

      const deviceResult = await pool
        .request()
        .input("senderId", sql.NVarChar, userId).query(`
          SELECT DISTINCT
            user_id
          FROM app_user_devices
          WHERE user_id <> @senderId
            AND fcm_token IS NOT NULL
            AND fcm_token <> ''
        `);

      console.log(
        `CHAT PUSH: found ${deviceResult.recordset.length} device users to notify`,
      );

      for (const row of deviceResult.recordset) {
        try {
          await sendPushNotification(
            pool,
            row.user_id,
            `New message from ${senderName}`,
            shortMessage,
            {
              type: "CHAT_MESSAGE",
              challanId: challanId,
              challanNo: displayChallanNo,
              senderName: senderName,
            },
          );
        } catch (pushErr) {
          console.error(
            "PUSH NOTIFY ERROR FOR USER:",
            row.user_id,
            pushErr.message,
          );
        }
      }
    } catch (notifyErr) {
      console.error("CHAT PUSH NOTIFICATION ERROR:", notifyErr.message);
    }

    return res.json({
      success: true,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) {
      await pool.close();
    }
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
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId).query(`
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
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId).query(`
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
router.get("/documents", async (req, res) => {
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

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Database not found",
      });
    }

    pool = await openPool(databaseName);

    const result = await pool.request().query(`
      SELECT
          DocumentId,
          DocumentType,
          DocumentNo,
          FileName,
          FilePath,
          CreatedDate
      FROM MA_ChatDocuments
      ORDER BY CreatedDate DESC
    `);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("GET DOCUMENTS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
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
      .input("challanId", sql.NVarChar(100), req.params.challanId).query(`
SELECT
    c.ChatId,
    c.SenderUserId,
    c.SenderName,
    c.MessageText,
    c.MessageType,
    c.DocumentId,
    c.MessageTime,

    d.DocumentNo,
    d.DocumentType,
    d.FileName

FROM MA_ChallanChat c

LEFT JOIN MA_ChatDocuments d
    ON c.DocumentId = d.DocumentId

WHERE c.ChallanId = @challanId

ORDER BY c.MessageTime
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
router.get("/document/:documentId", async (req, res) => {
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

    const { documentId } = req.params;

    const result = await pool
      .request()
      .input("documentId", sql.UniqueIdentifier, documentId).query(`
          SELECT
              DocumentId,
              DocumentType,
              DocumentNo,
              FileName,
              FilePath
          FROM MA_ChatDocuments
          WHERE DocumentId = @documentId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const doc = result.recordset[0];

    return res.json({
      success: true,
      data: doc,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});
// ── GET /api/chat/debug/tokens ───────────────────────────────────────────────
// DEBUG: lists all FCM tokens in the database for the logged-in user's company
// Call this from browser: GET https://api.myautoshop365.com/api/chat/debug/tokens
// with Authorization header to verify tokens are saved
router.get("/debug/tokens", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded) return res.status(401).json({ success: false });

    const { database: databaseName } = decoded;
    pool = await openPool(databaseName);

    const result = await pool.request().query(`
      SELECT user_id,
             LEFT(fcm_token, 30) + '...' AS token_preview,
             created_on
      FROM app_user_devices
      ORDER BY created_on DESC
    `);

    return res.json({
      success: true,
      count: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

module.exports = router;
