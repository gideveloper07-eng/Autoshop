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
    c.IsRead,

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
// Call this from browser: GET http://api.myautoshop365.com/api/chat/debug/tokens
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

// ── GET /api/chat/members/:challanId ─────────────────────────────────────────
// Returns all active members of a challan chat group
router.get("/members/:challanId", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { database: databaseName } = decoded;
    const { challanId } = req.params;
    pool = await openPool(databaseName);

    // Ensure the table exists (auto-create so no manual SQL step needed)
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MA_ChallanChatMembers')
      CREATE TABLE MA_ChallanChatMembers (
        MemberId  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        ChallanId NVARCHAR(100)    NOT NULL,
        UserId    NVARCHAR(100)    NOT NULL,
        UserName  NVARCHAR(500)    NOT NULL,
        AddedBy   NVARCHAR(100)    NOT NULL,
        AddedOn   DATETIME         NOT NULL DEFAULT GETDATE(),
        IsActive  BIT              NOT NULL DEFAULT 1,
        CONSTRAINT UQ_ChallanChatMember UNIQUE (ChallanId, UserId)
      )
    `);

    const result = await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId).query(`
        SELECT MemberId, UserId, UserName, AddedBy, AddedOn
        FROM MA_ChallanChatMembers
        WHERE ChallanId = @challanId AND IsActive = 1
        ORDER BY AddedOn
      `);

    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("GET MEMBERS ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── GET /api/chat/users ───────────────────────────────────────────────────────
// Returns all users in the company for the "Add Member" picker
router.get("/users", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { database: databaseName, userId: currentUserId } = decoded;
    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("currentUserId", sql.NVarChar(100), currentUserId).query(`
        SELECT
          uti  AS UserId,
          utn  AS UserName,
          utg  AS UserGroup
        FROM rh_secut
        WHERE uti <> @currentUserId
        ORDER BY utn
      `);

    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("GET USERS ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── POST /api/chat/members/add ────────────────────────────────────────────────
// Add a user as a member of a challan chat group
router.post("/members/add", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { database: databaseName, userId: addedBy } = decoded;
    const { challanId, userId, userName } = req.body;
    if (!challanId || !userId || !userName) {
      return res
        .status(400)
        .json({
          success: false,
          message: "challanId, userId, userName required",
        });
    }
    pool = await openPool(databaseName);

    // Upsert: if already exists but inactive, reactivate; else insert
    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("userName", sql.NVarChar(500), userName)
      .input("addedBy", sql.NVarChar(100), addedBy).query(`
        IF EXISTS (SELECT 1 FROM MA_ChallanChatMembers WHERE ChallanId = @challanId AND UserId = @userId)
          UPDATE MA_ChallanChatMembers
            SET IsActive = 1, AddedBy = @addedBy, AddedOn = GETDATE()
          WHERE ChallanId = @challanId AND UserId = @userId
        ELSE
          INSERT INTO MA_ChallanChatMembers (ChallanId, UserId, UserName, AddedBy)
          VALUES (@challanId, @userId, @userName, @addedBy)
      `);

    // Post a system message so everyone sees who was added
    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("addedBy", sql.NVarChar(100), addedBy)
      .input(
        "messageText",
        sql.NVarChar(sql.MAX),
        `${userName} was added to the group`,
      ).query(`
        INSERT INTO MA_ChallanChat (ChatId, ChallanId, SenderUserId, SenderName, MessageText, MessageType, MessageTime, IsRead)
        VALUES (NEWID(), @challanId, @addedBy, 'System', @messageText, 'SYSTEM', GETDATE(), 0)
      `);

    return res.json({ success: true, message: `${userName} added to chat` });
  } catch (err) {
    console.error("ADD MEMBER ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── DELETE /api/chat/members/remove ──────────────────────────────────────────
// Remove (soft-delete) a member from a challan chat group
router.delete("/members/remove", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { database: databaseName, userId: removedBy } = decoded;
    const { challanId, userId, userName } = req.body;
    if (!challanId || !userId) {
      return res
        .status(400)
        .json({ success: false, message: "challanId and userId required" });
    }
    pool = await openPool(databaseName);

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId).query(`
        UPDATE MA_ChallanChatMembers
        SET IsActive = 0
        WHERE ChallanId = @challanId AND UserId = @userId
      `);

    // Post system message
    const displayName = userName || userId;
    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("removedBy", sql.NVarChar(100), removedBy)
      .input(
        "messageText",
        sql.NVarChar(sql.MAX),
        `${displayName} was removed from the group`,
      ).query(`
        INSERT INTO MA_ChallanChat (ChatId, ChallanId, SenderUserId, SenderName, MessageText, MessageType, MessageTime, IsRead)
        VALUES (NEWID(), @challanId, @removedBy, 'System', @messageText, 'SYSTEM', GETDATE(), 0)
      `);

    return res.json({
      success: true,
      message: `${displayName} removed from chat`,
    });
  } catch (err) {
    console.error("REMOVE MEMBER ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

module.exports = router;
