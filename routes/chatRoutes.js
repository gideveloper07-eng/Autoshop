const express = require("express");
const router = express.Router();
const sql = require("mssql");
const openCommunicationPool = require("../utils/communicationPool");
const { randomUUID } = require("crypto");

const { decodeToken } = require("../middleware/authMiddleware");
const { sendPushNotification } = require("../utils/pushNotificationHelper");
const { getAccessibleDatabases } = require("../utils/databaseAccessHelper");

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

// ── Helper: resolve DB for a challan chat ─────────────────────────────────────
// DatabaseName is stored in MA_ChallanChatMembers (set when member is added).
// If not found there, fall back to the logged-in user's DB.
async function getChallanDatabase(challanId, userGuid, fallbackDb) {
  let pool;
  try {
    pool = await openPool(fallbackDb);
    const result = await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId).query(`
        SELECT TOP 1 DatabaseName
        FROM MA_ChallanChatMembers
        WHERE ChallanId = @challanId
          AND ISNULL(DatabaseName,'') <> ''
      `);
    const dbName = result.recordset[0]?.DatabaseName;
    return dbName && dbName.trim() !== "" ? dbName.trim() : fallbackDb;
  } catch {
    return fallbackDb;
  }
}
router.get("/my-chats", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database, propertyCode, clientId, userId, isAdmin } = decoded;

    pool = await openCommunicationPool();

    let result;

    if (isAdmin) {
      result = await pool
        .request()
        .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
SELECT
    c.ChallanId,
    MAX(c.MessageTime) AS LastMessageTime,
    MAX(c.DatabaseName) AS DatabaseName,
    MAX(c.PropertyCode) AS PropertyCode,
    MAX(c.ClientId) AS ClientId
FROM MA_ChallanChat c
WHERE
    (@clientId IS NULL OR c.ClientId=@clientId)
GROUP BY c.ChallanId
ORDER BY LastMessageTime DESC
`);
    } else {
      result = await pool
        .request()
        .input("userId", sql.NVarChar(100), userId)
        .input("propertyCode", sql.NVarChar(20), propertyCode)
        .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
SELECT
    c.ChallanId,
    MAX(c.MessageTime) AS LastMessageTime,
    MAX(c.DatabaseName) AS DatabaseName,
    MAX(c.PropertyCode) AS PropertyCode,
    MAX(c.ClientId) AS ClientId
FROM MA_ChallanChat c
INNER JOIN MA_ChallanChatMembers m
    ON c.ChallanId = m.ChallanId
WHERE
    m.UserId=@userId
    AND m.PropertyCode=@propertyCode
    AND m.IsActive=1
    AND (@clientId IS NULL OR c.ClientId=@clientId)
GROUP BY c.ChallanId
ORDER BY LastMessageTime DESC
`);
    }

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("MY CHATS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
// ── POST /api/chat/send ──────────────────────────────────────────────────────
router.post("/send", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    console.log("Decoded Token:", decoded);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database, propertyCode, clientId, userId, isAdmin, userGuid } =
      decoded;

    const {
      challanId,
      challanNo,
      senderName,
      messageText = "",
      messageType = "TEXT",
      documentId = null,

      receiverUserId,
      receiverName,
      receiverPropertyCode,
    } = req.body;

    if (!challanId) {
      return res.status(400).json({
        success: false,
        message: "ChallanId is required",
      });
    }

    pool = await openCommunicationPool();

    //----------------------------------------------------
    // Ensure Sender Member
    //----------------------------------------------------

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("userName", sql.NVarChar(200), senderName || userId)
      .input("propertyCode", sql.NVarChar(20), propertyCode)
      .input("databaseName", sql.NVarChar(100), database)
      .input("userGuid", sql.UniqueIdentifier, userGuid)
      .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
IF NOT EXISTS
(
    SELECT 1
    FROM MA_ChallanChatMembers
    WHERE ChallanId=@challanId
      AND (UserId=@userId or UserId=@userGuid)
      AND PropertyCode=@propertyCode
)
BEGIN

INSERT INTO MA_ChallanChatMembers
(
    MemberId,
    ChallanId,
    UserId,
    UserName,
    AddedBy,
    AddedOn,
    IsActive,
    DatabaseName,
    PropertyCode,
    ClientId
)
VALUES
(
    NEWID(),
    @challanId,
    @userGuid,
    @userName,
    @userId,
    GETDATE(),
    1,
    @databaseName,
    @propertyCode,
    @clientId
)

END
`);

    //----------------------------------------------------
    // Ensure Receiver Member
    //----------------------------------------------------

    if (userGuid) {
      await pool
        .request()
        .input("challanId", sql.NVarChar(100), challanId)
        .input("receiverId", sql.NVarChar(100), userGuid)
        .input(
          "receiverName",
          sql.NVarChar(200),
          receiverName || receiverUserId,
        )
        .input(
          "receiverPropertyCode",
          sql.NVarChar(20),
          receiverPropertyCode || propertyCode,
        )
        .input("databaseName", sql.NVarChar(100), database)
        .input("clientId", sql.UniqueIdentifier, clientId || null)
        .input("addedBy", sql.NVarChar(100), userId).query(`
IF NOT EXISTS
(
    SELECT 1
    FROM MA_ChallanChatMembers
    WHERE ChallanId=@challanId
      AND (UserId=@userGuid or UserId=@receiverId)
      AND PropertyCode=@receiverPropertyCode
)
BEGIN

INSERT INTO MA_ChallanChatMembers
(
    MemberId,
    ChallanId,
    UserId,
    UserName,
    AddedBy,
    AddedOn,
    IsActive,
    DatabaseName,
    PropertyCode,
    ClientId
)
VALUES
(
    NEWID(),
    @challanId,
    @userGuid,
    @receiverName,
    @addedBy,
    GETDATE(),
    1,
    @databaseName,
    @receiverPropertyCode,
    @clientId
)

END
`);
    }

    //----------------------------------------------------
    // Security
    //----------------------------------------------------

    if (!isAdmin) {
      const access = await pool
        .request()
        .input("challanId", sql.NVarChar(100), challanId)
        .input("userId", sql.NVarChar(100), userId)
        .input("propertyCode", sql.NVarChar(20), propertyCode).query(`
SELECT 1
FROM MA_ChallanChatMembers
WHERE ChallanId=@challanId
AND UserId=@userId
AND PropertyCode=@propertyCode
AND IsActive=1
`);

      if (access.recordset.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Access denied.",
        });
      }
    }

    //----------------------------------------------------
    // Insert Message
    //----------------------------------------------------

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("senderUserId", sql.NVarChar(100), userId)
      .input("senderName", sql.NVarChar(200), senderName || userId)
      .input("messageText", sql.NVarChar(sql.MAX), messageText)
      .input("messageType", sql.VarChar(20), messageType)
      .input("documentId", sql.UniqueIdentifier, documentId)
      .input("databaseName", sql.NVarChar(100), database)
      .input("propertyCode", sql.NVarChar(20), propertyCode)
      .input("senderPropertyCode", sql.NVarChar(20), propertyCode)
      .input(
        "receiverPropertyCode",
        sql.NVarChar(20),
        receiverPropertyCode || propertyCode,
      )
      .input("clientId", sql.UniqueIdentifier, clientId || null)
      .input("receiverId", sql.NVarChar(100), userGuid).query(`
INSERT INTO MA_ChallanChat
(
    ChatId,
    ChallanId,
    SenderUserId,
    SenderName,
    MessageText,
    MessageTime,
    IsRead,
    MessageType,
    DocumentId,
    DatabaseName,
    ReceiverId,
    PropertyCode,
    SenderPropertyCode,
    ReceiverPropertyCode,
    ClientId
)
VALUES
(
    NEWID(),
    @challanId,
    @senderUserId,
    @senderName,
    @messageText,
    GETDATE(),
    0,
    @messageType,
    @documentId,
    @databaseName,
    @userGuid,
    @propertyCode,
    @senderPropertyCode,
    @receiverPropertyCode,
    @clientId
)
`);

    //----------------------------------------------------
    // Notification
    //----------------------------------------------------

    let receivers;

    if (receiverUserId) {
      receivers = [
        {
          UserId: receiverUserId,
        },
      ];
    } else {
      const result = await pool
        .request()
        .input("challanId", sql.NVarChar(100), challanId)
        .input("senderId", sql.NVarChar(100), userId).query(`
SELECT UserId
FROM MA_ChallanChatMembers
WHERE ChallanId=@challanId
AND UserId<>@senderId
AND IsActive=1
`);

      receivers = result.recordset;
    }

    for (const member of receivers) {
      try {
        await sendPushNotification(
          pool,
          member.UserId,
          senderName || userId,
          messageText || "New Message",
          {
            type: "challan_chat",
            challanId,
            challanNo: challanNo || "",
            senderId: userId,
          },
        );
      } catch (err) {
        console.error(err.message);
      }
    }

    return res.json({
      success: true,
      message: "Message sent successfully.",
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
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
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { propertyCode, clientId, userId } = decoded;

    const { challanId } = req.params;

    pool = await openCommunicationPool();

    // Optional security check
    const access = await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("propertyCode", sql.NVarChar(20), propertyCode).query(`
SELECT 1
FROM MA_ChallanChatMembers
WHERE ChallanId=@challanId
  AND UserId=@userId
  AND PropertyCode=@propertyCode
  AND IsActive=1
`);

    if (access.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
UPDATE MA_ChallanChat
SET IsRead = 1
WHERE ChallanId = @challanId
  AND SenderUserId <> @userId
  AND IsRead = 0
  AND (@clientId IS NULL OR ClientId=@clientId)
`);

    return res.json({
      success: true,
      message: "Messages marked as read.",
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// ── GET /api/chat/unread-count/:challanId ────────────────────────────────────
// -- GET /api/chat/direct-messages/:receiverId -----------------------------
// Loads direct chat history from MA_ChallanChat for the current user and receiver.
router.get(
  "/direct-messages/:receiverId/:receiverPropertyCode",
  async (req, res) => {
    let pool;

    try {
      const decoded = decodeToken(req);

      if (!decoded) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const { userId, propertyCode } = decoded;
      const { receiverId, receiverPropertyCode } = req.params;

      // Open the central communication database
      pool = await openCommunicationPool();

      const result = await pool
        .request()
        .input("userId", sql.NVarChar(100), userId)
        .input("propertyCode", sql.NVarChar(50), propertyCode)
        .input("receiverId", sql.NVarChar(100), receiverId)
        .input("receiverPropertyCode", sql.NVarChar(50), receiverPropertyCode)
        .query(`
        SELECT
            CAST(c.ChatId AS NVARCHAR(50)) AS ChatId,
            c.SenderUserId,
            c.SenderName,
            c.SenderPropertyCode,
            c.ReceiverId,
            c.ReceiverPropertyCode,
            c.MessageText,
            c.MessageType,
            c.DocumentId,
            c.MessageTime,
            c.IsRead,

            d.DocumentNo,
            d.DocumentType,
            d.FileName,

            NULL AS TaskId,
            NULL AS AssignedTo,
            NULL AS AssignedToName,
            NULL AS Priority,
            NULL AS TaskStatus,
            NULL AS TaskDescription

        FROM MA_ChallanChat c

        LEFT JOIN MA_ChatDocuments d
            ON c.DocumentId = d.DocumentId

        WHERE
        (
            c.SenderUserId = @userId
            AND c.SenderPropertyCode = @propertyCode
            AND c.ReceiverId = @receiverId
            AND c.ReceiverPropertyCode = @receiverPropertyCode
        )
        OR
        (
            c.SenderUserId = @receiverId
            AND c.SenderPropertyCode = @receiverPropertyCode
            AND c.ReceiverId = @userId
            AND c.ReceiverPropertyCode = @propertyCode
        )

        ORDER BY c.MessageTime ASC
      `);

      // Mark received messages as read
      await pool
        .request()
        .input("userId", sql.NVarChar(100), userId)
        .input("propertyCode", sql.NVarChar(50), propertyCode)
        .input("receiverId", sql.NVarChar(100), receiverId)
        .input("receiverPropertyCode", sql.NVarChar(50), receiverPropertyCode)
        .query(`
        UPDATE MA_ChallanChat
        SET IsRead = 1
        WHERE
            SenderUserId = @receiverId
            AND SenderPropertyCode = @receiverPropertyCode
            AND ReceiverId = @userId
            AND ReceiverPropertyCode = @propertyCode
            AND ISNULL(IsRead,0)=0
      `);

      return res.json({
        success: true,
        data: result.recordset,
      });
    } catch (err) {
      console.error("GET DIRECT MESSAGES ERROR:", err);

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  },
);
// IMPORTANT: This must be declared BEFORE GET /:challanId to avoid conflict.
// Returns the count of unread messages sent by others for a given challan.
router.get(
  "/unread-count/:receiverId/:receiverPropertyCode",
  async (req, res) => {
    let pool;

    try {
      const decoded = decodeToken(req);

      if (!decoded) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const { userId, propertyCode, clientId } = decoded;
      const { receiverId, receiverPropertyCode } = req.params;

      pool = await openCommunicationPool();

      const result = await pool
        .request()
        .input("userId", sql.NVarChar(100), userId)
        .input("propertyCode", sql.NVarChar(20), propertyCode)
        .input("receiverId", sql.NVarChar(100), receiverId)
        .input("receiverPropertyCode", sql.NVarChar(20), receiverPropertyCode)
        .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
SELECT COUNT(*) AS UnreadCount
FROM MA_ChallanChat
WHERE
    SenderUserId=@receiverId
AND SenderPropertyCode=@receiverPropertyCode

AND ReceiverId=@userId
AND ReceiverPropertyCode=@propertyCode

AND IsRead=0

AND (@clientId IS NULL OR ClientId=@clientId)
`);

      return res.json({
        success: true,
        count: result.recordset[0].UnreadCount,
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
  },
);

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

    const { propertyCode, clientId, userId, isAdmin } = decoded;

    pool = await openCommunicationPool();

    let result;

    //----------------------------------------------------
    // ADMIN → ALL DOCUMENTS
    //----------------------------------------------------

    if (isAdmin) {
      result = await pool
        .request()
        .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
SELECT
    DocumentId,
    DocumentType,
    DocumentNo,
    FileName,
    FilePath,
    ReferenceId,
    DatabaseName,
    PropertyCode,
    ClientId,
    CreatedDate
FROM MA_ChatDocuments
WHERE (@clientId IS NULL OR ClientId=@clientId)
ORDER BY CreatedDate DESC
`);
    }

    //----------------------------------------------------
    // USER → ONLY DOCUMENTS OF CHALLANS
    // THEY BELONG TO
    //----------------------------------------------------
    else {
      result = await pool
        .request()
        .input("userId", sql.NVarChar(100), userId)
        .input("propertyCode", sql.NVarChar(20), propertyCode)
        .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
SELECT DISTINCT
    d.DocumentId,
    d.DocumentType,
    d.DocumentNo,
    d.FileName,
    d.FilePath,
    d.ReferenceId,
    d.DatabaseName,
    d.PropertyCode,
    d.ClientId,
    d.CreatedDate
FROM MA_ChatDocuments d
INNER JOIN MA_ChallanChatMembers m
    ON d.ReferenceId = m.ChallanId
WHERE
    m.UserId=@userId
    AND m.PropertyCode=@propertyCode
    AND m.IsActive=1
    AND (@clientId IS NULL OR d.ClientId=@clientId)
ORDER BY d.CreatedDate DESC
`);
    }

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
  }
});

// ── GET /api/chat/:challanId ─────────────────────────────────────────────────

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

    const { propertyCode, clientId, userId, isAdmin } = decoded;

    const { challanId } = req.params;

    pool = await openCommunicationPool();

    //----------------------------------------------------
    // Security
    //----------------------------------------------------

    if (!isAdmin) {
      const access = await pool
        .request()
        .input("challanId", sql.NVarChar(100), challanId)
        .input("userId", sql.NVarChar(100), userId)
        .input("propertyCode", sql.NVarChar(20), propertyCode).query(`
SELECT 1
FROM MA_ChallanChatMembers
WHERE ChallanId=@challanId
  AND UserId=@userId
  AND PropertyCode=@propertyCode
  AND IsActive=1
`);

      if (access.recordset.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
    }

    //----------------------------------------------------
    // Messages + Tasks
    //----------------------------------------------------

    const result = await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
SELECT
    CAST(c.ChatId AS NVARCHAR(50)) AS ChatId,
    c.SenderUserId,
    c.SenderName,
    c.MessageText,
    c.MessageType,
    c.DocumentId,
    c.MessageTime,
    c.IsRead,

    d.DocumentNo,
    d.DocumentType,
    d.FileName,

    NULL AS TaskId,
    NULL AS AssignedTo,
    NULL AS AssignedToName,
    NULL AS Priority,
    NULL AS TaskStatus,
    NULL AS TaskDescription

FROM MA_ChallanChat c

LEFT JOIN MA_ChatDocuments d
       ON c.DocumentId=d.DocumentId

WHERE c.ChallanId=@challanId
AND c.MessageType<>'TASK'
AND (@clientId IS NULL OR c.ClientId=@clientId)

UNION ALL

SELECT

    CAST(t.TaskId AS NVARCHAR(50)) AS ChatId,

    t.AssignedBy AS SenderUserId,

    ISNULL(byUser.UserName,t.AssignedBy) AS SenderName,

    t.TaskTitle AS MessageText,

    'TASK' AS MessageType,

    NULL AS DocumentId,

    t.CreatedDate AS MessageTime,

    1 AS IsRead,

    NULL AS DocumentNo,
    NULL AS DocumentType,
    NULL AS FileName,

    CAST(t.TaskId AS NVARCHAR(50)) AS TaskId,

    t.AssignedTo,

    ISNULL(toUser.UserName,t.AssignedTo) AS AssignedToName,

    t.Priority,

    t.Status AS TaskStatus,

    t.TaskDescription

FROM MA_ChatTasks t

LEFT JOIN MA_ChallanChatMembers toUser
ON  toUser.UserId=t.AssignedTo
AND toUser.ChallanId=t.ChallanId

LEFT JOIN MA_ChallanChatMembers byUser
ON  byUser.UserId=t.AssignedBy
AND byUser.ChallanId=t.ChallanId

WHERE t.ChallanId=@challanId
AND (@clientId IS NULL OR t.ClientId=@clientId)

ORDER BY MessageTime;
`);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("GET CHAT ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
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

    const { propertyCode, clientId, userId, isAdmin } = decoded;

    const { documentId } = req.params;

    pool = await openCommunicationPool();

    //----------------------------------------------------
    // Get Document
    //----------------------------------------------------

    const docResult = await pool
      .request()
      .input("documentId", sql.UniqueIdentifier, documentId)
      .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
SELECT *
FROM MA_ChatDocuments
WHERE DocumentId=@documentId
  AND (@clientId IS NULL OR ClientId=@clientId)
`);

    if (docResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const document = docResult.recordset[0];

    //----------------------------------------------------
    // Security
    //----------------------------------------------------

    if (!isAdmin) {
      const access = await pool
        .request()
        .input("challanId", sql.NVarChar(100), document.ReferenceId)
        .input("userId", sql.NVarChar(100), userId)
        .input("propertyCode", sql.NVarChar(20), propertyCode).query(`
SELECT 1
FROM MA_ChallanChatMembers
WHERE ChallanId=@challanId
  AND UserId=@userId
  AND PropertyCode=@propertyCode
  AND IsActive=1
`);

      if (access.recordset.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
    }

    return res.json({
      success: true,
      data: document,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
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
  }
});

router.post("/create-task", async (req, res) => {
  let businessPool;
  let communicationPool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database, propertyCode, clientId, userId, userName } = decoded;

    const {
      challanId,
      taskTitle,
      taskDescription,
      startDate,
      dueDate,
      priority,
    } = req.body;

    if (!challanId || !taskTitle) {
      return res.status(400).json({
        success: false,
        message: "challanId and taskTitle are required",
      });
    }

    //----------------------------------------------------
    // BUSINESS DATABASE
    // Read Challan Owner
    //----------------------------------------------------

    businessPool = await openPool(database);

    const challanResult = await businessPool
      .request()
      .input("challanId", sql.NVarChar(100), challanId).query(`
SELECT
    sp_463 AS UserId,
    sp_468 AS ChallanNo
FROM rh_sp_46
WHERE sp_462=@challanId
`);

    if (challanResult.recordset.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid challan",
      });
    }

    const assignedTo = challanResult.recordset[0].UserId;
    const taskId = randomUUID();

    //----------------------------------------------------
    // COMMUNICATION DATABASE
    //----------------------------------------------------

    communicationPool = await openCommunicationPool();

    // Optional Security Check
    const access = await communicationPool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("propertyCode", sql.NVarChar(20), propertyCode).query(`
SELECT 1
FROM MA_ChallanChatMembers
WHERE ChallanId=@challanId
AND UserId=@userId
AND PropertyCode=@propertyCode
AND IsActive=1
`);

    if (access.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    //----------------------------------------------------
    // Insert Task
    //----------------------------------------------------

    await communicationPool
      .request()
      .input("TaskId", sql.UniqueIdentifier, taskId)
      .input("ChallanId", sql.NVarChar(100), challanId)
      .input("TaskTitle", sql.NVarChar(400), taskTitle)
      .input("TaskDescription", sql.NVarChar(sql.MAX), taskDescription || "")
      .input("AssignedBy", sql.NVarChar(200), userId)
      .input("AssignedTo", sql.NVarChar(200), assignedTo)
      .input("StartDate", sql.DateTime, startDate || null)
      .input("DueDate", sql.DateTime, dueDate || null)
      .input("Priority", sql.NVarChar(40), priority || "Medium")
      .input("DatabaseName", sql.NVarChar(100), database)
      .input("PropertyCode", sql.NVarChar(20), propertyCode)
      .input("ClientId", sql.UniqueIdentifier, clientId || null).query(`
INSERT INTO MA_ChatTasks
(
    TaskId,
    ChallanId,
    TaskTitle,
    TaskDescription,
    AssignedBy,
    AssignedTo,
    StartDate,
    DueDate,
    Priority,
    Status,
    CreatedDate,
    DatabaseName,
    PropertyCode,
    ClientId
)
VALUES
(
    @TaskId,
    @ChallanId,
    @TaskTitle,
    @TaskDescription,
    @AssignedBy,
    @AssignedTo,
    @StartDate,
    @DueDate,
    @Priority,
    'Pending',
    GETDATE(),
    @DatabaseName,
    @PropertyCode,
    @ClientId
)
`);

    //----------------------------------------------------
    // Insert Chat Message
    //----------------------------------------------------

    await communicationPool
      .request()
      .input("TaskId", sql.UniqueIdentifier, taskId)
      .input("ChallanId", sql.NVarChar(100), challanId)
      .input("SenderUserId", sql.NVarChar(100), userId)
      .input("SenderName", sql.NVarChar(200), userName || userId)
      .input("MessageText", sql.NVarChar(sql.MAX), taskTitle)
      .input("DatabaseName", sql.NVarChar(100), database)
      .input("PropertyCode", sql.NVarChar(20), propertyCode)
      .input("SenderPropertyCode", sql.NVarChar(20), propertyCode)
      .input("ReceiverPropertyCode", sql.NVarChar(20), propertyCode)
      .input("ClientId", sql.UniqueIdentifier, clientId || null)
      .input("ReceiverId", sql.NVarChar(100), assignedTo).query(`
INSERT INTO MA_ChallanChat
(
    ChatId,
    ChallanId,
    SenderUserId,
    SenderName,
    MessageText,
    MessageTime,
    IsRead,
    MessageType,
    TaskId,
    DatabaseName,
    ReceiverId,
    PropertyCode,
    SenderPropertyCode,
    ReceiverPropertyCode,
    ClientId
)
VALUES
(
    NEWID(),
    @ChallanId,
    @SenderUserId,
    @SenderName,
    @MessageText,
    GETDATE(),
    0,
    'TASK',
    @TaskId,
    @DatabaseName,
    @ReceiverId,
    @PropertyCode,
    @SenderPropertyCode,
    @ReceiverPropertyCode,
    @ClientId
)
`);

    return res.json({
      success: true,
      taskId,
      message: "Task created successfully",
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
      detail: err.originalError?.message,
    });
  } finally {
    if (businessPool) await businessPool.close();
    if (communicationPool) await communicationPool.close();
  }
});
// ── GET /api/chat/members/:challanId ─────────────────────────────────────────
// Returns all active members of a challan chat group
router.get("/members/:challanId", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { propertyCode, clientId, userId, isAdmin } = decoded;

    const { challanId } = req.params;

    pool = await openCommunicationPool();

    //----------------------------------------------------
    // Security
    //----------------------------------------------------

    if (!isAdmin) {
      const access = await pool
        .request()
        .input("challanId", sql.NVarChar(100), challanId)
        .input("userId", sql.NVarChar(100), userId)
        .input("propertyCode", sql.NVarChar(20), propertyCode).query(`
SELECT 1
FROM MA_ChallanChatMembers
WHERE ChallanId=@challanId
  AND UserId=@userId
  AND PropertyCode=@propertyCode
  AND IsActive=1
`);

      if (access.recordset.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Access denied.",
        });
      }
    }

    //----------------------------------------------------
    // Members
    //----------------------------------------------------

    const result = await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
SELECT
    MemberId,
    UserId,
    UserName,
    AddedBy,
    AddedOn,
    DatabaseName,
    PropertyCode,
    ClientId
FROM MA_ChallanChatMembers
WHERE ChallanId=@challanId
  AND IsActive=1
  AND (@clientId IS NULL OR ClientId=@clientId)
ORDER BY AddedOn
`);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("GET MEMBERS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// ── POST /api/chat/members/add ────────────────────────────────────────────────
// Add a user as a member of a challan chat group
router.post("/members/add", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    //----------------------------------------------------
    // Admin Only
    //----------------------------------------------------

    if (!decoded.isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Admin access only",
      });
    }

    const { database, propertyCode, clientId, userId: addedBy } = decoded;

    const { challanId, userId, userName, databaseName, receiverPropertyCode } =
      req.body;

    if (!challanId || !userId || !userName) {
      return res.status(400).json({
        success: false,
        message: "challanId, userId and userName are required",
      });
    }

    pool = await openCommunicationPool();

    //----------------------------------------------------
    // Add / Reactivate Member
    //----------------------------------------------------

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("userName", sql.NVarChar(500), userName)
      .input("addedBy", sql.NVarChar(100), addedBy)
      .input("databaseName", sql.NVarChar(100), databaseName || database)
      .input(
        "propertyCode",
        sql.NVarChar(20),
        receiverPropertyCode || propertyCode,
      )
      .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
IF EXISTS
(
    SELECT 1
    FROM MA_ChallanChatMembers
    WHERE ChallanId=@challanId
      AND UserId=@userId
      AND PropertyCode=@propertyCode
)
BEGIN

    UPDATE MA_ChallanChatMembers
    SET
        UserName=@userName,
        AddedBy=@addedBy,
        AddedOn=GETDATE(),
        IsActive=1,
        DatabaseName=@databaseName,
        ClientId=@clientId
    WHERE ChallanId=@challanId
      AND UserId=@userId
      AND PropertyCode=@propertyCode

END
ELSE
BEGIN

    INSERT INTO MA_ChallanChatMembers
    (
        MemberId,
        ChallanId,
        UserId,
        UserName,
        AddedBy,
        AddedOn,
        IsActive,
        DatabaseName,
        PropertyCode,
        ClientId
    )
    VALUES
    (
        NEWID(),
        @challanId,
        @userId,
        @userName,
        @addedBy,
        GETDATE(),
        1,
        @databaseName,
        @propertyCode,
        @clientId
    )

END
`);

    //----------------------------------------------------
    // System Message
    //----------------------------------------------------

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("senderUserId", sql.NVarChar(100), addedBy)
      .input(
        "messageText",
        sql.NVarChar(sql.MAX),
        `${userName} was added to the chat`,
      )
      .input("databaseName", sql.NVarChar(100), databaseName || database)
      .input("propertyCode", sql.NVarChar(20), propertyCode)
      .input("senderPropertyCode", sql.NVarChar(20), propertyCode)
      .input(
        "receiverPropertyCode",
        sql.NVarChar(20),
        receiverPropertyCode || propertyCode,
      )
      .input("clientId", sql.UniqueIdentifier, clientId || null)
      .input("receiverId", sql.NVarChar(100), userId).query(`
INSERT INTO MA_ChallanChat
(
    ChatId,
    ChallanId,
    SenderUserId,
    SenderName,
    MessageText,
    MessageTime,
    IsRead,
    MessageType,
    DatabaseName,
    ReceiverId,
    PropertyCode,
    SenderPropertyCode,
    ReceiverPropertyCode,
    ClientId
)
VALUES
(
    NEWID(),
    @challanId,
    @senderUserId,
    'System',
    @messageText,
    GETDATE(),
    0,
    'SYSTEM',
    @databaseName,
    @receiverId,
    @propertyCode,
    @senderPropertyCode,
    @receiverPropertyCode,
    @clientId
)
`);

    return res.json({
      success: true,
      message: `${userName} added successfully`,
    });
  } catch (err) {
    console.error("ADD MEMBER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// ── DELETE /api/chat/members/remove ──────────────────────────────────────────
router.delete("/members/remove", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    //----------------------------------------------------
    // Admin Only
    //----------------------------------------------------

    if (!decoded.isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Admin access only",
      });
    }

    const { database, propertyCode, clientId, userId: removedBy } = decoded;

    const { challanId, userId, userName, databaseName, receiverPropertyCode } =
      req.body;

    if (!challanId || !userId) {
      return res.status(400).json({
        success: false,
        message: "challanId and userId are required",
      });
    }

    pool = await openCommunicationPool();

    //----------------------------------------------------
    // Remove Member
    //----------------------------------------------------

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input(
        "propertyCode",
        sql.NVarChar(20),
        receiverPropertyCode || propertyCode,
      ).query(`
UPDATE MA_ChallanChatMembers
SET
    IsActive = 0,
    AddedBy = @removedBy,
    AddedOn = GETDATE()
WHERE ChallanId=@challanId
  AND UserId=@memberUserId
  AND PropertyCode=@propertyCode
`);

    //----------------------------------------------------
    // System Message
    //----------------------------------------------------

    const displayName = userName || userId;

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("senderUserId", sql.NVarChar(100), removedBy)
      .input(
        "messageText",
        sql.NVarChar(sql.MAX),
        `${displayName} was removed from the chat`,
      )
      .input("databaseName", sql.NVarChar(100), databaseName || database)
      .input("propertyCode", sql.NVarChar(20), propertyCode)
      .input("senderPropertyCode", sql.NVarChar(20), propertyCode)
      .input(
        "receiverPropertyCode",
        sql.NVarChar(20),
        receiverPropertyCode || propertyCode,
      )
      .input("clientId", sql.UniqueIdentifier, clientId || null)
      .input("receiverId", sql.NVarChar(100), userId).query(`
INSERT INTO MA_ChallanChat
(
    ChatId,
    ChallanId,
    SenderUserId,
    SenderName,
    MessageText,
    MessageTime,
    IsRead,
    MessageType,
    DatabaseName,
    ReceiverId,
    PropertyCode,
    SenderPropertyCode,
    ReceiverPropertyCode,
    ClientId
)
VALUES
(
    NEWID(),
    @challanId,
    @senderUserId,
    'System',
    @messageText,
    GETDATE(),
    0,
    'SYSTEM',
    @databaseName,
    @receiverId,
    @propertyCode,
    @senderPropertyCode,
    @receiverPropertyCode,
    @clientId
)
`);

    return res.json({
      success: true,
      message: `${displayName} removed successfully`,
    });
  } catch (err) {
    console.error("REMOVE MEMBER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
module.exports = router;
