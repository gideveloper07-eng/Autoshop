const express = require("express");
const router = express.Router();
const sql = require("mssql");
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
  } finally {
    if (pool) await pool.close();
  }
}
router.get("/my-chats", async (req, res) => {
  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database: currentDb, userGuid, userId, isAdmin } = decoded;

    // Get all dealerships this user can access
    const databases = await getAccessibleDatabases(userGuid, currentDb);

    let allChats = [];

    for (const db of databases) {
      let pool;

      try {
        pool = await openPool(db.database);

        let result;

        if (isAdmin) {
          result = await pool.request().query(`
            SELECT
                c.ChallanId,
                MAX(c.MessageTime) AS LastMessageTime
            FROM MA_ChallanChat c
            GROUP BY c.ChallanId
          `);
        } else {
          result = await pool
            .request()
            .input("userId", sql.NVarChar(100), userId).query(`
              SELECT
                  c.ChallanId,
                  MAX(c.MessageTime) AS LastMessageTime
              FROM MA_ChallanChat c
              INNER JOIN MA_ChallanChatMembers m
                  ON c.ChallanId = m.ChallanId
              WHERE m.UserId = @userId
                AND m.IsActive = 1
              GROUP BY c.ChallanId
            `);
        }

        for (const row of result.recordset) {
          allChats.push({
            ...row,
            DatabaseName: db.database,
            CompanyName: db.companyName,
            CompanyCode: db.companyCode,
          });
        }
      } catch (err) {
        console.error(`Failed loading chats from ${db.database}:`, err.message);
      } finally {
        if (pool) await pool.close();
      }
    }

    // Sort newest first
    allChats.sort((a, b) => {
      return new Date(b.LastMessageTime) - new Date(a.LastMessageTime);
    });

    return res.json({
      success: true,
      data: allChats,
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

    const { database: currentDb, userId, isAdmin } = decoded;

    const {
      challanId,
      messageText,
      senderName,
      challanNo,
      messageType,
      documentId,
      databaseName: bodyDb,
    } = req.body;

    if (!challanId) {
      return res.status(400).json({
        success: false,
        message: "ChallanId is required",
      });
    }

    // Resolve which DB this challan belongs to (employee's company DB)
    const databaseName =
      bodyDb && bodyDb.trim() !== ""
        ? bodyDb.trim()
        : await getChallanDatabase(challanId, decoded.userGuid, currentDb);
    pool = await openPool(databaseName);

    // ─────────────────────────────────────────────
    // SECURITY CHECK
    // ─────────────────────────────────────────────
    if (!isAdmin) {
      const access = await pool
        .request()
        .input("challanId", sql.NVarChar(100), challanId)
        .input("userId", sql.NVarChar(100), userId).query(`
          SELECT 1
          FROM MA_ChallanChatMembers
          WHERE ChallanId = @challanId
            AND UserId = @userId
            AND IsActive = 1
        `);

      if (access.recordset.length === 0) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this chat",
        });
      }
    }

    // ─────────────────────────────────────────────
    // INSERT MESSAGE
    // ─────────────────────────────────────────────
    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("senderName", sql.NVarChar(500), senderName || userId)
      .input("messageText", sql.NVarChar(sql.MAX), messageText || "")
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

    // ─────────────────────────────────────────────
    // SEND PUSH TO CHAT MEMBERS
    // ─────────────────────────────────────────────
    const members = await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("senderId", sql.NVarChar(100), userId).query(`
        SELECT UserId
        FROM MA_ChallanChatMembers
        WHERE ChallanId = @challanId
          AND IsActive = 1
          AND UserId <> @senderId
      `);

    for (const member of members.recordset) {
      try {
        await sendPushNotification(
          pool,
          member.UserId,
          senderName || userId,
          messageText || "New message",
          {
            type: "challan_chat",
            challanId,
            challanNo: challanNo || "",
            senderId: userId,
          },
        );
      } catch (pushErr) {
        console.error(`PUSH ERROR FOR USER ${member.UserId}:`, pushErr.message);
      }
    }

    return res.json({
      success: true,
    });
  } catch (err) {
    console.error("SEND CHAT ERROR:", err);

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

    const { database: currentDb, userId } = decoded;
    const { challanId } = req.params;

    // Resolve which DB this challan belongs to
    const databaseName = await getChallanDatabase(
      challanId,
      decoded.userGuid,
      currentDb,
    );
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

    const { database: currentDb, userId } = decoded;
    const { challanId } = req.params;

    // Resolve which DB this challan belongs to
    const databaseName = await getChallanDatabase(
      challanId,
      decoded.userGuid,
      currentDb,
    );
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

    const { database: databaseName, userId, isAdmin } = decoded;

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Database not found",
      });
    }

    // NOTE: Documents listing uses the logged-in user's DB as the routing DB.
    // Each document row has a DatabaseName column pointing to its actual storage DB.
    // For simple listing we query the current DB; the DatabaseName column is returned
    // so the frontend can route document-specific calls to the right DB.
    pool = await openPool(databaseName);

    let result;

    // ─────────────────────────────────────────
    // ADMIN → ALL DOCUMENTS
    // ─────────────────────────────────────────
    if (isAdmin) {
      result = await pool.request().query(`
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
    }

    // ─────────────────────────────────────────
    // USER → ONLY DOCUMENTS OF CHATS
    // THEY BELONG TO
    // ─────────────────────────────────────────
    else {
      result = await pool.request().input("userId", sql.NVarChar(100), userId)
        .query(`
          SELECT DISTINCT
              d.DocumentId,
              d.DocumentType,
              d.DocumentNo,
              d.FileName,
              d.FilePath,
              d.CreatedDate

          FROM MA_ChatDocuments d

          INNER JOIN MA_ChallanChatMembers m
              ON d.ReferenceId = m.ChallanId

          WHERE m.UserId = @userId
            AND m.IsActive = 1

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

    const { database: currentDb, userId, isAdmin } = decoded;

    // Resolve which DB this challan belongs to
    const databaseName = await getChallanDatabase(
      req.params.challanId,
      decoded.userGuid,
      currentDb,
    );

    // Open DB connection first
    pool = await openPool(databaseName);
    console.log("CHALLAN ID:", req.params.challanId);
    console.log("RUNNING QUERY 1");
    // Non-admin users must be chat members
    if (!isAdmin) {
      const access = await pool
        .request()
        .input("challanId", sql.NVarChar(100), req.params.challanId)
        .input("userId", sql.NVarChar(100), userId).query(`
          SELECT 1
          FROM MA_ChallanChatMembers
          WHERE ChallanId = @challanId
            AND UserId = @userId
            AND IsActive = 1
        `);

      if (access.recordset.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
    }

    console.log("RUNNING QUERY 2");
    // Load chat messages
    const result = await pool
      .request()
      .input("challanId", sql.NVarChar(100), req.params.challanId).query(`
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
    ON c.DocumentId = d.DocumentId
WHERE c.ChallanId = @challanId and c.MESSAGETYPE <> 'TASK'
   UNION ALL

     SELECT
         CAST(t.TaskId AS NVARCHAR(50)) AS ChatId,
        t.AssignedBy AS SenderUserId,
        t.AssignedBy AS SenderName,
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
        ISNULL(s.uti, t.AssignedTo) AS AssignedToName,
        t.Priority,
         t.Status AS TaskStatus,
        t.TaskDescription
     FROM MA_ChatTasks t
     LEFT JOIN rh_secut s
       ON CONVERT(VARCHAR(50), s.utunqid) = t.AssignedTo
    WHERE t.ChallanId = @challanId

      `);

    // ORDER BY MessageTime*/
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
  } finally {
    if (pool) {
      await pool.close();
    }
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

    const { database: databaseName, userId, isAdmin } = decoded;

    pool = await openPool(databaseName);

    // Get document
    const docResult = await pool
      .request()
      .input("challanId", sql.NVarChar(100), document.ReferenceId).query(`
        SELECT *
        FROM MA_ChatDocuments
        WHERE DocumentId = @documentId
      `);

    if (docResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const document = docResult.recordset[0];

    // Admin bypass
    if (!isAdmin) {
      const access = await pool
        .request()
        .input("challanId", sql.UniqueIdentifier, document.ReferenceId)
        .input("userId", sql.NVarChar(100), userId).query(`
          SELECT 1
          FROM MA_ChallanChatMembers
          WHERE ChallanId = @challanId
          AND UserId = @userId
          AND IsActive = 1
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
router.post("/create-task", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database: currentDb, userId, userName } = decoded;

    const {
      challanId,
      taskTitle,
      taskDescription,
      startDate,
      dueDate,
      priority,
      databaseName: bodyDb,
    } = req.body;

    if (!challanId || !taskTitle) {
      return res.status(400).json({
        success: false,
        message: "challanId and taskTitle are required",
      });
    }

    // Resolve which DB this challan belongs to
    const databaseName =
      bodyDb && bodyDb.trim() !== ""
        ? bodyDb.trim()
        : await getChallanDatabase(challanId, decoded.userGuid, currentDb);
    pool = await openPool(databaseName);

    const taskId = randomUUID();

    console.log("================================");
    console.log("CREATE TASK");
    console.log("TaskId:", taskId);
    console.log("ChallanId:", challanId);
    console.log("================================");

    // Find challan owner
    const challanResult = await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId).query(`
        SELECT
            sp_463 AS UserId,
            sp_468 AS ChallanNo
        FROM rh_sp_46
        WHERE sp_462 = @challanId
      `);

    if (challanResult.recordset.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid challan",
      });
    }

    const assignedTo = challanResult.recordset[0].UserId;

    // ==================================================
    // INSERT TASK
    // ==================================================
    await pool
      .request()
      .input("TaskId", sql.UniqueIdentifier, taskId)
      .input("GroupId", sql.UniqueIdentifier, null)
      .input("ChallanId", sql.NVarChar(100), challanId)
      .input("TaskTitle", sql.NVarChar(400), taskTitle)
      .input("TaskDescription", sql.NVarChar(sql.MAX), taskDescription || "")
      .input("AssignedBy", sql.NVarChar(200), userId)
      .input("AssignedTo", sql.NVarChar(200), assignedTo)
      .input("StartDate", sql.DateTime, startDate || null)
      .input("DueDate", sql.DateTime, dueDate || null)
      .input("Priority", sql.NVarChar(40), priority || "Medium").query(`
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
            CreatedDate
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
            GETDATE()
        )
      `);

    console.log("MA_ChatTasks INSERTED");

    // ==================================================
    // INSERT TASK MESSAGE INTO CHAT
    // ==================================================
    await pool
      .request()
      .input("TaskId", sql.UniqueIdentifier, taskId)
      .input("ChallanId", sql.NVarChar(200), challanId)
      .input("SenderUserId", sql.NVarChar(200), userId)
      .input("SenderName", sql.NVarChar(1000), userName || userId)
      .input("MessageText", sql.NVarChar(sql.MAX), taskTitle).query(`
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
            TaskId
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
            @TaskId
        )
      `);

    console.log("MA_ChallanChat INSERTED");

    return res.json({
      success: true,
      taskId,
      message: "Task created successfully",
    });
  } catch (err) {
    console.error("================================");
    console.error("CREATE TASK ERROR");
    console.error("MESSAGE:", err.message);
    console.error("DETAIL:", err.originalError?.message);
    console.error(err);
    console.error("================================");

    return res.status(500).json({
      success: false,
      message: err.message,
      detail: err.originalError?.message,
    });
  } finally {
    if (pool) {
      await pool.close();
    }
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
        DatabaseName NVARCHAR(200) NULL,
        CONSTRAINT UQ_ChallanChatMember UNIQUE (ChallanId, UserId)
      );
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='MA_ChallanChatMembers' AND COLUMN_NAME='DatabaseName')
        ALTER TABLE MA_ChallanChatMembers ADD DatabaseName NVARCHAR(200) NULL;
    `);

    const result = await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId).query(`
        SELECT MemberId, UserId, UserName, AddedBy, AddedOn, DatabaseName
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

    // ADMIN ONLY
    if (!decoded.isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Admin access only",
      });
    }

    const { database: databaseName, userId: addedBy } = decoded;

    const { challanId, userId, userName, databaseName: employeeDb } = req.body;

    if (!challanId || !userId || !userName) {
      return res.status(400).json({
        success: false,
        message: "challanId, userId and userName required",
      });
    }

    pool = await openPool(databaseName);

    // employeeDb = the DB where the challan/employee belongs (Raja's DB, Tata's DB, etc.)
    // We store it in MA_ChallanChatMembers so future reads can route to the right DB.
    const chatDb =
      employeeDb && employeeDb.trim() !== "" ? employeeDb.trim() : databaseName;

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("userName", sql.NVarChar(500), userName)
      .input("addedBy", sql.NVarChar(100), addedBy)
      .input("chatDb", sql.NVarChar(200), chatDb).query(`
        IF EXISTS (
          SELECT 1
          FROM MA_ChallanChatMembers
          WHERE ChallanId = @challanId
            AND UserId = @userId
        )
        BEGIN
          UPDATE MA_ChallanChatMembers
          SET
            IsActive = 1,
            AddedBy = @addedBy,
            AddedOn = GETDATE(),
            DatabaseName = @chatDb
          WHERE ChallanId = @challanId
            AND UserId = @userId
        END
        ELSE
        BEGIN
          INSERT INTO MA_ChallanChatMembers
          (
            ChallanId,
            UserId,
            UserName,
            AddedBy,
            DatabaseName
          )
          VALUES
          (
            @challanId,
            @userId,
            @userName,
            @addedBy,
            @chatDb
          )
        END
      `);

    // System message
    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("addedBy", sql.NVarChar(100), addedBy)
      .input(
        "messageText",
        sql.NVarChar(sql.MAX),
        `${userName} was added to the chat`,
      ).query(`
        INSERT INTO MA_ChallanChat
        (
          ChatId,
          ChallanId,
          SenderUserId,
          SenderName,
          MessageText,
          MessageType,
          MessageTime,
          IsRead
        )
        VALUES
        (
          NEWID(),
          @challanId,
          @addedBy,
          'System',
          @messageText,
          'SYSTEM',
          GETDATE(),
          0
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
  } finally {
    if (pool) {
      await pool.close();
    }
  }
});

// ── DELETE /api/chat/members/remove ──────────────────────────────────────────
// Remove (soft-delete) a member from a challan chat group
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

    // ADMIN ONLY
    if (!decoded.isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Admin access only",
      });
    }

    const { database: databaseName, userId: removedBy } = decoded;

    const { challanId, userId, userName } = req.body;

    if (!challanId || !userId) {
      return res.status(400).json({
        success: false,
        message: "challanId and userId required",
      });
    }

    pool = await openPool(databaseName);

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId).query(`
        UPDATE MA_ChallanChatMembers
        SET IsActive = 0
        WHERE ChallanId = @challanId
          AND UserId = @userId
      `);

    const displayName = userName || userId;

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("removedBy", sql.NVarChar(100), removedBy)
      .input(
        "messageText",
        sql.NVarChar(sql.MAX),
        `${displayName} was removed from the chat`,
      ).query(`
        INSERT INTO MA_ChallanChat
        (
          ChatId,
          ChallanId,
          SenderUserId,
          SenderName,
          MessageText,
          MessageType,
          MessageTime,
          IsRead
        )
        VALUES
        (
          NEWID(),
          @challanId,
          @removedBy,
          'System',
          @messageText,
          'SYSTEM',
          GETDATE(),
          0
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
  } finally {
    if (pool) {
      await pool.close();
    }
  }
});
module.exports = router;
