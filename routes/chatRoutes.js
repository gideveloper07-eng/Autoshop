const express = require("express");
const router = express.Router();
const sql = require("mssql");
const openCommunicationPool = require("../utils/communicationPool");
const openMasterPool = require("../utils/masterPool");
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

async function findUserInDatabase(databaseName, receiverGuid) {
  let pool;

  try {
    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("guid", sql.UniqueIdentifier, receiverGuid).query(`
        SELECT TOP (1)
            utunqid,
            uti,
            utnm
        FROM rh_secut
        WHERE utunqid=@guid
      `);

    if (result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0];
  } finally {
    if (pool) await pool.close();
  }
}

async function findUserByGuid(decoded, receiverGuid) {
  // -------------------------
  // Employee
  // -------------------------
  if (!decoded.isAdmin) {
    const user = await findUserInDatabase(decoded.loginDatabase, receiverGuid);

    if (!user) return null;

    return {
      userId: user.uti,
      userGuid: user.utunqid,
      userName: user.utnm,

      database: decoded.loginDatabase,
      propertyCode: decoded.loginPropertyCode,
      propertyName: decoded.loginPropertyName,
      clientId: decoded.loginClientId,
    };
  }
  // Admin
  let masterPool;

  try {
    masterPool = await openMasterPool();
    console.log("masterPool =", masterPool);
    console.log("typeof masterPool =", typeof masterPool);
    const access = await masterPool
      .request()
      .input("guid", sql.UniqueIdentifier, decoded.userGuid).query(`
        SELECT
            CM.unqid,
            CM.propertydb,
            CM.propertycode,
            CM.propertyname
        FROM MA_UserDatabaseAccess UA
        INNER JOIN MA_ClientMaster CM
            ON UA.ClientId=CM.unqid
        WHERE UA.UserGuid=@guid
      `);

    for (const company of access.recordset) {
      const user = await findUserInDatabase(company.propertydb, receiverGuid);

      if (user) {
        return {
          userId: user.uti,
          userGuid: user.utunqid,
          userName: user.utnm,

          database: company.propertydb,
          propertyCode: company.propertycode,
          propertyName: company.propertyname,
          clientId: company.unqid,
        };
      }
    }

    return null;
  } finally {
    if (masterPool) await masterPool.close();
  }
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

    // Permanent Login Identity
    const userId = decoded.userId;
    const propertyCode = decoded.loginPropertyCode || decoded.propertyCode;
    const clientId = decoded.loginClientId || decoded.clientId;

    const isAdmin = decoded.isAdmin;

    console.log("========= MY CHATS =========");
    console.log("User :", userId);
    console.log("Login Property :", propertyCode);
    console.log("Client :", clientId);
    console.log("============================");

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
  } finally {
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
  }
});
// ── POST /api/chat/send ──────────────────────────────────────────────────────
// ── POST /api/chat/send-message ── (alias — same logic, new path) ────────────
// Both paths handled by a shared handler so existing integrations keep working
async function handleChatSend(req, res) {
  let pool;

  try {
    console.log("========== SEND CHAT ==========");
    console.log("REQUEST BODY:", req.body);

    // ------------------------------------------------
    // Decode login token
    // ------------------------------------------------
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ------------------------------------------------
    // Permanent sender identity from token
    // ------------------------------------------------
    const userId = decoded.userId || decoded.uti;

    const senderName =
      decoded.userName || decoded.name || req.body.senderName || userId;

    const senderDatabase =
      decoded.loginDatabase || decoded.database || req.body.databaseName;

    const senderPropertyCode =
      decoded.loginPropertyCode || decoded.propertyCode;

    const senderClientId = decoded.loginClientId || decoded.clientId || null;

    // ------------------------------------------------
    // Request values
    // ------------------------------------------------
    const {
      challanId,
      challanNo,
      messageText,
      messageType = "TEXT",
      documentId = null,

      // Optional for challan/group chat
      receiverUserId = null,
      receiverName = null,
      receiverDatabase = null,
      receiverPropertyCode = null,
    } = req.body;

    // ------------------------------------------------
    // Validation
    // ------------------------------------------------
    if (!challanId) {
      return res.status(400).json({
        success: false,
        message: "challanId is required.",
      });
    }

    if (messageType === "TEXT" && (!messageText || messageText.trim() === "")) {
      return res.status(400).json({
        success: false,
        message: "Message text is required.",
      });
    }

    if (messageType === "DOCUMENT" && !documentId) {
      return res.status(400).json({
        success: false,
        message: "documentId is required.",
      });
    }

    // ------------------------------------------------
    // Open communication database
    // ------------------------------------------------
    pool = await openCommunicationPool();

    // ------------------------------------------------
    // Ensure sender is a challan member
    // ------------------------------------------------
    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("userName", sql.NVarChar(200), senderName || userId)
      .input("databaseName", sql.NVarChar(100), senderDatabase)
      .input("propertyCode", sql.NVarChar(50), senderPropertyCode)
      .input("clientId", sql.UniqueIdentifier, senderClientId).query(`
        IF NOT EXISTS
        (
          SELECT 1
          FROM MA_ChallanChatMembers
          WHERE ChallanId = @challanId
            AND UserId = @userId
            AND PropertyCode = @propertyCode
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
            @userId,
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

    // ------------------------------------------------
    // Resolve receiver only for direct chat
    // ------------------------------------------------
    let receiver = null;

    if (receiverUserId && receiverUserId.toString().trim() !== "") {
      let receiverGuid = receiverUserId.toString().trim();

      const finalReceiverDatabase = receiverDatabase || senderDatabase;

      const guidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

      // Convert normal employee ID into GUID
      if (!guidRegex.test(receiverGuid)) {
        let employeePool;

        try {
          employeePool = await openPool(finalReceiverDatabase);

          const employeeResult = await employeePool
            .request()
            .input("userId", sql.NVarChar(100), receiverGuid).query(`
                SELECT TOP 1
                  utunqid
                FROM rh_secut
                WHERE uti = @userId
              `);

          if (employeeResult.recordset.length === 0) {
            return res.status(404).json({
              success: false,
              message: "Receiver not found.",
            });
          }

          receiverGuid = employeeResult.recordset[0].utunqid;
        } finally {
          if (employeePool) {
            await employeePool.close();
          }
        }
      }

      receiver = await findUserByGuid(decoded, receiverGuid);

      if (!receiver) {
        return res.status(404).json({
          success: false,
          message: "Receiver not found.",
        });
      }

      // ----------------------------------------------
      // Ensure direct-chat receiver is a member
      // ----------------------------------------------
      await pool
        .request()
        .input("challanId", sql.NVarChar(100), challanId)
        .input("receiverId", sql.NVarChar(100), receiver.userId)
        .input(
          "receiverName",
          sql.NVarChar(200),
          receiver.userName || receiverName || receiver.userId,
        )
        .input(
          "databaseName",
          sql.NVarChar(100),
          receiver.database || finalReceiverDatabase,
        )
        .input(
          "propertyCode",
          sql.NVarChar(50),
          receiver.propertyCode || receiverPropertyCode,
        )
        .input("clientId", sql.UniqueIdentifier, receiver.clientId || null)
        .input("addedBy", sql.NVarChar(100), userId).query(`
          IF NOT EXISTS
          (
            SELECT 1
            FROM MA_ChallanChatMembers
            WHERE ChallanId = @challanId
              AND UserId = @receiverId
              AND PropertyCode = @propertyCode
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
              @receiverId,
              @receiverName,
              @addedBy,
              GETDATE(),
              1,
              @databaseName,
              @propertyCode,
              @clientId
            )
          END
        `);
    }

    // ------------------------------------------------
    // Insert message
    // ------------------------------------------------
    const chatId = randomUUID();

    await pool
      .request()
      .input("chatId", sql.UniqueIdentifier, chatId)
      .input("challanId", sql.NVarChar(100), challanId)
      .input("senderUserId", sql.NVarChar(100), userId)
      .input("senderName", sql.NVarChar(200), senderName || userId)
      .input("messageText", sql.NVarChar(sql.MAX), messageText || "")
      .input("messageType", sql.VarChar(20), messageType)
      .input("documentId", sql.UniqueIdentifier, documentId || null)
      .input("databaseName", sql.NVarChar(100), senderDatabase)
      .input("receiverId", sql.NVarChar(100), receiver?.userId || null)
      .input("propertyCode", sql.NVarChar(50), senderPropertyCode)
      .input("senderPropertyCode", sql.NVarChar(50), senderPropertyCode)
      .input(
        "receiverPropertyCode",
        sql.NVarChar(50),
        receiver?.propertyCode || receiverPropertyCode || null,
      )
      .input(
        "clientId",
        sql.UniqueIdentifier,
        receiver?.clientId || senderClientId || null,
      ).query(`
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
          @chatId,
          @challanId,
          @senderUserId,
          @senderName,
          @messageText,
          GETDATE(),
          0,
          @messageType,
          @documentId,
          @databaseName,
          @receiverId,
          @propertyCode,
          @senderPropertyCode,
          @receiverPropertyCode,
          @clientId
        )
      `);

    // ------------------------------------------------
    // Get notification receivers
    // ------------------------------------------------
    let notificationUsers = [];

    if (receiver) {
      // Direct chat
      notificationUsers = [
        {
          UserId: receiver.userId,
          UserName: receiver.userName || receiver.userId,
          PropertyCode: receiver.propertyCode,
          DatabaseName: receiver.database,
          ClientId: receiver.clientId,
        },
      ];
    } else {
      // Challan/group chat:
      // notify every active member except sender
      const memberResult = await pool
        .request()
        .input("challanId", sql.NVarChar(100), challanId)
        .input("senderUserId", sql.NVarChar(100), userId)
        .input("senderPropertyCode", sql.NVarChar(50), senderPropertyCode)
        .query(`
          SELECT
            UserId,
            UserName,
            PropertyCode,
            DatabaseName,
            ClientId
          FROM MA_ChallanChatMembers
          WHERE ChallanId = @challanId
            AND IsActive = 1
            AND NOT
            (
              UserId = @senderUserId
              AND PropertyCode =
                  @senderPropertyCode
            )
        `);

      notificationUsers = memberResult.recordset;
    }

    // ------------------------------------------------
    // Send push notifications
    // ------------------------------------------------
    for (const member of notificationUsers) {
      try {
        await sendPushNotification(
          pool,
          member.UserId,
          senderName || userId,
          messageText || "New message",
          {
            type: "challan_chat",
            chatId,
            challanId,
            challanNo: challanNo?.toString() || "",
            senderId: userId?.toString() || "",
            senderName: senderName?.toString() || "",
            senderPropertyCode: senderPropertyCode?.toString() || "",
            receiverPropertyCode: member.PropertyCode?.toString() || "",
          },
        );
      } catch (notificationError) {
        console.error("PUSH NOTIFICATION ERROR:", notificationError.message);
      }
    }

    console.log("MESSAGE SENT:", chatId);

    // ------------------------------------------------
    // Success response
    // ------------------------------------------------
    return res.status(200).json({
      success: true,
      message: "Message sent successfully.",
      data: {
        chatId,
        challanId,
        challanNo,
        senderUserId: userId,
        senderName,
        databaseName: senderDatabase,
        senderPropertyCode,
        receiverUserId: receiver?.userId || null,
        receiverName: receiver?.userName || null,
        receiverPropertyCode: receiver?.propertyCode || null,
        messageText: messageText || "",
        messageType,
        documentId,
      },
    });
  } catch (error) {
    console.error("SEND CHAT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to send message.",
      detail:
        error.originalError?.info?.message ||
        error.originalError?.message ||
        null,
    });
  }
}

router.post("/send", handleChatSend);
router.post("/send-message", handleChatSend);

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

    // Permanent login identity
    const userId = decoded.userId;
    const propertyCode = decoded.loginPropertyCode || decoded.propertyCode;
    const clientId = decoded.loginClientId || decoded.clientId;

    const { challanId } = req.params;

    console.log("========= MARK READ =========");
    console.log("User :", userId);
    console.log("Property :", propertyCode);
    console.log("Client :", clientId);
    console.log("Challan :", challanId);
    console.log("=============================");

    pool = await openCommunicationPool();

    //----------------------------------------------------
    // Verify membership
    //----------------------------------------------------

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

    if (!decoded.isAdmin && access.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    //----------------------------------------------------
    // Mark messages as read
    //----------------------------------------------------

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("propertyCode", sql.NVarChar(20), propertyCode) // ADD THIS
      .input("clientId", sql.UniqueIdentifier, clientId || null).query(`
    UPDATE MA_ChallanChat
    SET IsRead = 1
    WHERE ChallanId = @challanId
      AND ReceiverId = @userId
      AND ReceiverPropertyCode = @propertyCode
      AND IsRead = 0
      AND (@clientId IS NULL OR ClientId = @clientId)
  `);

    return res.json({
      success: true,
      message: "Messages marked as read.",
    });
  } catch (err) {
    console.error("MARK READ ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
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

      // Permanent identity
      const userId = decoded.userId;
      const senderPropertyCode =
        decoded.loginPropertyCode || decoded.propertyCode;

      const { receiverId, receiverPropertyCode } = req.params;

      console.log("========= DIRECT CHAT =========");
      console.log("User :", userId);
      console.log("Sender Property :", senderPropertyCode);
      console.log("Receiver :", receiverId);
      console.log("Receiver Property :", receiverPropertyCode);
      console.log("===============================");

      pool = await openCommunicationPool();

      const result = await pool
        .request()
        .input("userId", sql.NVarChar(100), userId)
        .input("senderPropertyCode", sql.NVarChar(50), senderPropertyCode)
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
                CAST(c.TaskId AS NVARCHAR(50)) AS TaskId,

                d.DocumentNo,
                d.DocumentType,
                d.FileName,

                t.AssignedTo,
                t.AssignedTo AS AssignedToName,
                t.Priority,
                t.Status AS TaskStatus,
                t.TaskDescription

            FROM MA_ChallanChat c

            LEFT JOIN MA_ChatDocuments d
                ON c.DocumentId = d.DocumentId

            LEFT JOIN MA_ChatTasks t
                ON c.TaskId = t.TaskId

            WHERE
            (
                c.SenderUserId = @userId
                AND c.SenderPropertyCode = @senderPropertyCode
                AND c.ReceiverId = @receiverId
                AND c.ReceiverPropertyCode = @receiverPropertyCode
            )

            OR

            (
                c.SenderUserId = @receiverId
                AND c.SenderPropertyCode = @receiverPropertyCode
                AND c.ReceiverId = @userId
                AND c.ReceiverPropertyCode = @senderPropertyCode
            )

            ORDER BY c.MessageTime ASC
        `);

      // Mark incoming messages as read
      await pool
        .request()
        .input("userId", sql.NVarChar(100), userId)
        .input("senderPropertyCode", sql.NVarChar(50), senderPropertyCode)
        .input("receiverId", sql.NVarChar(100), receiverId)
        .input("receiverPropertyCode", sql.NVarChar(50), receiverPropertyCode)
        .query(`
            UPDATE MA_ChallanChat
            SET IsRead = 1
            WHERE
                SenderUserId = @receiverId
                AND SenderPropertyCode = @receiverPropertyCode
                AND ReceiverId = @userId
                AND ReceiverPropertyCode = @senderPropertyCode
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
    } finally {
      // Don't close shared Communication pool - it's reusable
      // pool is only closed on application shutdown in communicationPool.js
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

      // Permanent login identity
      const userId = decoded.userId;
      const propertyCode = decoded.loginPropertyCode || decoded.propertyCode;
      const clientId = decoded.loginClientId || decoded.clientId;

      const { receiverId, receiverPropertyCode } = req.params;

      console.log("========= UNREAD COUNT =========");
      console.log("User :", userId);
      console.log("Property :", propertyCode);
      console.log("Receiver :", receiverId);
      console.log("Receiver Property :", receiverPropertyCode);
      console.log("===============================");

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
      SenderUserId = @receiverId
  AND SenderPropertyCode = @receiverPropertyCode

  AND ReceiverId = @userId
  AND ReceiverPropertyCode = @propertyCode

  AND IsRead = 0

  AND (@clientId IS NULL OR ClientId = @clientId)
`);

      return res.json({
        success: true,
        count: result.recordset[0].UnreadCount,
      });
    } catch (err) {
      console.error("UNREAD COUNT ERROR:", err);

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      // Don't close shared Communication pool - it's reusable
      // pool is only closed on application shutdown in communicationPool.js
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
    console.log("========= GET DOCUMENTS =========", decoded);
    // Permanent login identity
    const userId = decoded.userId;

    // Current selected company
    const propertyCode =
      decoded.currentPropertyCode || decoded.loginPropertyCode;

    const databaseName = decoded.currentDatabase || decoded.loginDatabase;

    const clientId = decoded.currentClientId || decoded.loginClientId;

    const isAdmin = decoded.isAdmin;
    const receiverPropertyCode = (req.query.receiverPropertyCode || "")
      .trim()
      .toUpperCase();

    const receiverCompanyName = (req.query.receiverCompanyName || "").trim();

    const currentPropertyCode = (propertyCode || "").trim().toUpperCase();

    if (
      receiverPropertyCode.isNotEmpty &&
      receiverPropertyCode !== currentPropertyCode
    ) {
      return res.json({
        success: true,
        requireSwitch: true,
        message: `Please switch company to ${receiverCompanyName} to fetch documents.`,
        data: [],
      });
    }
    console.log("========= DOCUMENTS =========");
    console.log("User :", userId);
    console.log("Database :", databaseName);
    console.log("Property :", propertyCode);
    console.log("Client :", clientId);
    console.log("=============================");

    pool = await openCommunicationPool();

    let result;

    //----------------------------------------------------
    // ADMIN → ALL DOCUMENTS OF LOGIN COMPANY
    //----------------------------------------------------

    if (isAdmin) {
      result = await pool
        .request()
        .input("propertyCode", sql.NVarChar(20), receiverPropertyCode).query(`
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
WHERE PropertyCode=@propertyCode
ORDER BY CreatedDate DESC
`);
    }

    //----------------------------------------------------
    // USER → ONLY DOCUMENTS OF CHALLANS THEY BELONG TO
    //----------------------------------------------------
    else {
      result = await pool
        .request()
        .input("userId", sql.NVarChar(100), userId)
        .input("propertyCode", sql.NVarChar(20), receiverPropertyCode).query(`
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
   AND d.PropertyCode = m.PropertyCode
WHERE
    m.UserId=@userId
    AND m.PropertyCode=@propertyCode
    AND m.IsActive=1
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
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
  }
});

// ── GET /api/chat/:challanId ─────────────────────────────────────────────────

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

    // Permanent Login Identity
    const userId = decoded.userId;
    const propertyCode = decoded.loginPropertyCode || decoded.propertyCode;
    const clientId = decoded.loginClientId || decoded.clientId;
    const isAdmin = decoded.isAdmin;

    const { documentId } = req.params;

    console.log("========= GET DOCUMENT =========");
    console.log("User :", userId);
    console.log("Property :", propertyCode);
    console.log("Client :", clientId);
    console.log("Document :", documentId);
    console.log("================================");

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
    console.error("GET DOCUMENT ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
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

    //----------------------------------------------------
    // Login Identity (Never Changes)
    //----------------------------------------------------

    const userId = decoded.userId;
    const userName = decoded.userName;

    const loginDatabase = decoded.loginDatabase || decoded.database;

    const loginPropertyCode = decoded.loginPropertyCode || decoded.propertyCode;

    const loginClientId = decoded.loginClientId || decoded.clientId;

    //----------------------------------------------------
    // Current Working Dealership
    //----------------------------------------------------

    const currentDatabase = decoded.currentDatabase || decoded.database;

    const currentPropertyCode =
      decoded.currentPropertyCode || decoded.propertyCode;

    const currentClientId = decoded.currentClientId || decoded.clientId;

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

    console.log("========== CREATE TASK ==========");
    console.log("Login DB :", loginDatabase);
    console.log("Current DB :", currentDatabase);
    console.log("Login Property :", loginPropertyCode);
    console.log("Current Property :", currentPropertyCode);
    console.log("=================================");

    //----------------------------------------------------
    // BUSINESS DATABASE
    // Read Challan Owner
    //----------------------------------------------------

    businessPool = await openPool(currentDatabase);

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

    //----------------------------------------------------
    // Security
    //----------------------------------------------------

    const access = await communicationPool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("propertyCode", sql.NVarChar(20), loginPropertyCode).query(`
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
      .input("DatabaseName", sql.NVarChar(100), loginDatabase)
      .input("PropertyCode", sql.NVarChar(20), loginPropertyCode)
      .input("ClientId", sql.UniqueIdentifier, loginClientId || null).query(`
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

      .input("DatabaseName", sql.NVarChar(100), loginDatabase)

      .input("PropertyCode", sql.NVarChar(20), loginPropertyCode)

      .input("SenderPropertyCode", sql.NVarChar(20), loginPropertyCode)

      .input("ReceiverPropertyCode", sql.NVarChar(20), currentPropertyCode)

      .input("ClientId", sql.UniqueIdentifier, loginClientId || null)

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
    console.error("CREATE TASK ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
      detail: err.originalError?.message,
    });
  } finally {
    // Close temporary database pool, but don't close shared Communication pool
    if (businessPool) {
      try {
        await businessPool.close();
      } catch (closeErr) {
        console.warn("Error closing business pool:", closeErr.message);
      }
    }
    // communicationPool is shared and will be closed on application shutdown
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

    //----------------------------------------------------
    // Login Identity (Chat Identity)
    //----------------------------------------------------

    const userId = decoded.userId;

    const propertyCode = decoded.loginPropertyCode || decoded.propertyCode;

    const clientId = decoded.loginClientId || decoded.clientId;

    const isAdmin = decoded.isAdmin;

    const { challanId } = req.params;

    console.log("========== GET MEMBERS ==========");
    console.log("User :", userId);
    console.log("Property :", propertyCode);
    console.log("Client :", clientId);
    console.log("Challan :", challanId);
    console.log("=================================");

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
  } finally {
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
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

    //----------------------------------------------------
    // Login Identity (Admin)
    //----------------------------------------------------

    const addedBy = decoded.userId;

    const loginDatabase = decoded.loginDatabase || decoded.database;

    const loginPropertyCode = decoded.loginPropertyCode || decoded.propertyCode;

    const loginClientId = decoded.loginClientId || decoded.clientId;

    //----------------------------------------------------
    // Member To Be Added
    //----------------------------------------------------

    const { challanId, userId, userName, databaseName, receiverPropertyCode } =
      req.body;

    if (!challanId || !userId || !userName) {
      return res.status(400).json({
        success: false,
        message: "challanId, userId and userName are required",
      });
    }

    pool = await openCommunicationPool();

    console.log("========== ADD MEMBER ==========");
    console.log("Admin :", addedBy);
    console.log("Admin Property :", loginPropertyCode);
    console.log("Member :", userId);
    console.log("Member Property :", receiverPropertyCode);
    console.log("===============================");

    //----------------------------------------------------
    // Add / Reactivate Member
    //----------------------------------------------------

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("userId", sql.NVarChar(100), userId)
      .input("userName", sql.NVarChar(500), userName)
      .input("addedBy", sql.NVarChar(100), addedBy)
      .input("databaseName", sql.NVarChar(100), databaseName || loginDatabase)
      .input("propertyCode", sql.NVarChar(20), receiverPropertyCode)
      .input("clientId", sql.UniqueIdentifier, loginClientId || null).query(`
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
      .input("databaseName", sql.NVarChar(100), loginDatabase)
      .input("propertyCode", sql.NVarChar(20), loginPropertyCode)
      .input("senderPropertyCode", sql.NVarChar(20), loginPropertyCode)
      .input("receiverPropertyCode", sql.NVarChar(20), receiverPropertyCode)
      .input("clientId", sql.UniqueIdentifier, loginClientId || null)
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
  } finally {
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
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

    //----------------------------------------------------
    // Login Identity (Admin)
    //----------------------------------------------------

    const removedBy = decoded.userId;

    const loginDatabase = decoded.loginDatabase || decoded.database;

    const loginPropertyCode = decoded.loginPropertyCode || decoded.propertyCode;

    const loginClientId = decoded.loginClientId || decoded.clientId;

    //----------------------------------------------------
    // Request
    //----------------------------------------------------

    const { challanId, userId, userName, databaseName, receiverPropertyCode } =
      req.body;

    if (!challanId || !userId) {
      return res.status(400).json({
        success: false,
        message: "challanId and userId are required",
      });
    }

    if (!receiverPropertyCode || !databaseName) {
      return res.status(400).json({
        success: false,
        message: "receiverPropertyCode and databaseName are required",
      });
    }

    pool = await openCommunicationPool();

    console.log("========== REMOVE MEMBER ==========");
    console.log("Admin :", removedBy);
    console.log("Admin Property :", loginPropertyCode);
    console.log("Member :", userId);
    console.log("Member Property :", receiverPropertyCode);
    console.log("===================================");

    //----------------------------------------------------
    // Remove Member
    //----------------------------------------------------

    await pool
      .request()
      .input("challanId", sql.NVarChar(100), challanId)
      .input("memberUserId", sql.NVarChar(100), userId)
      .input("removedBy", sql.NVarChar(100), removedBy)
      .input("propertyCode", sql.NVarChar(20), receiverPropertyCode).query(`
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
      .input("databaseName", sql.NVarChar(100), loginDatabase)
      .input("propertyCode", sql.NVarChar(20), loginPropertyCode)
      .input("senderPropertyCode", sql.NVarChar(20), loginPropertyCode)
      .input("receiverPropertyCode", sql.NVarChar(20), receiverPropertyCode)
      .input("clientId", sql.UniqueIdentifier, loginClientId || null)
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
  } finally {
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
  }
});
// ── GET /api/chat/individual-tasks ───────────────────────────────────────────
// Returns individual tasks (GroupId=NULL) for the logged-in user
// from the communication DB — filtered by current company's database name.
router.get("/get-tasks", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userId = decoded.userId;
    const isAdmin = decoded.isAdmin || false;
    const clientId = decoded.loginClientId || decoded.clientId || null;
    const currentDatabase =
      decoded.currentDatabase || decoded.loginDatabase || decoded.database;

    pool = await new sql.ConnectionPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "1433"),
      database: process.env.COMM_DB,
      options: { encrypt: false, trustServerCertificate: true },
    }).connect();

    let result;
    if (isAdmin) {
      result = await pool
        .request()
        .input("currentDB", sql.NVarChar(50), currentDatabase || null).query(`
          SELECT
            CAST(t.TaskId     AS NVARCHAR(50))  AS TaskId,
            CAST(t.ChallanId  AS NVARCHAR(100)) AS ChallanId,
            CAST(t.GroupId    AS NVARCHAR(50))  AS GroupId,
            t.TaskTitle,
            t.TaskDescription,
            t.AssignedBy,
            t.AssignedTo,
            t.AssignedTo AS AssignedToName,
            t.Priority,
            t.Status,
            t.StartDate,
            t.DueDate,
            t.CreatedDate,
            t.DatabaseName,
            t.PropertyCode,
            CASE
              WHEN t.GroupId   IS NOT NULL THEN 'Group'
              WHEN t.ChallanId IS NOT NULL THEN 'Challan'
              ELSE 'Individual'
            END AS TaskSource
          FROM MA_ChatTasks t
          WHERE t.DatabaseName = @currentDB
          ORDER BY t.CreatedDate DESC;
        `);
    } else {
      result = await pool.request().input("UserId", sql.NVarChar(100), userId)
        .query(`
          SELECT
            CAST(t.TaskId     AS NVARCHAR(50))  AS TaskId,
            CAST(t.ChallanId  AS NVARCHAR(100)) AS ChallanId,
            CAST(t.GroupId    AS NVARCHAR(50))  AS GroupId,
            t.TaskTitle,
            t.TaskDescription,
            t.AssignedBy,
            t.AssignedTo,
            t.AssignedTo AS AssignedToName,
            t.Priority,
            t.Status,
            t.StartDate,
            t.DueDate,
            t.CreatedDate,
            t.DatabaseName,
            t.PropertyCode,
            CASE
              WHEN t.GroupId   IS NOT NULL THEN 'Group'
              WHEN t.ChallanId IS NOT NULL THEN 'Challan'
              ELSE 'Individual'
            END AS TaskSource
          FROM MA_ChatTasks t
          WHERE
            LOWER(ISNULL(t.AssignedTo,'')) = LOWER(@UserId)
            OR LOWER(ISNULL(t.AssignedBy,'')) = LOWER(@UserId)
          ORDER BY t.CreatedDate DESC;
        `);
    }

    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("GET TASKS ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── GET /api/chat/individual-tasks ────────────────────────────────────────────
// Returns ONLY direct-chat tasks (GroupId=NULL, ChallanId=NULL)
router.get("/individual-tasks", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userId = decoded.userId;

    pool = await openCommunicationPool();

    const result = await pool
      .request()
      .input("UserId", sql.NVarChar(100), userId).query(`
        SELECT
          CAST(TaskId AS NVARCHAR(50)) AS TaskId,
          NULL                         AS ChallanId,
          NULL                         AS GroupId,
          TaskTitle,
          TaskDescription,
          AssignedBy,
          AssignedTo,
          AssignedTo AS AssignedToName,
          Priority,
          Status,
          StartDate,
          DueDate,
          CreatedDate,
          DatabaseName,
          PropertyCode,
          'Individual' AS TaskSource
        FROM MA_ChatTasks
        WHERE
          GroupId   IS NULL
          AND ChallanId IS NULL
          AND (
            LOWER(ISNULL(AssignedTo,'')) = LOWER(@UserId)
            OR LOWER(ISNULL(AssignedBy,'')) = LOWER(@UserId)
          )
        ORDER BY CreatedDate DESC;
      `);

    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("GET INDIVIDUAL TASKS ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── POST /api/chat/create-individual-task ─────────────────────────────────────
// Creates a task for a direct (1-on-1) chat.
// GroupId = NULL, ChallanId = NULL in MA_ChatTasks (communication DB).
// A TASK-type message is inserted into MA_ChallanChat using the same
// ChallanId="0001" convention used by direct messages.
router.post("/create-individual-task", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    //----------------------------------------------------
    // Use CURRENT working company (switches when user switches company)
    // This matches how documents work — currentPropertyCode, not loginPropertyCode
    //----------------------------------------------------
    const userId = decoded.userId;
    const userName = decoded.userName || decoded.userId;
    const currentDatabase =
      decoded.currentDatabase || decoded.loginDatabase || decoded.database;
    const currentPropertyCode =
      decoded.currentPropertyCode ||
      decoded.loginPropertyCode ||
      decoded.propertyCode;
    const currentClientId =
      decoded.currentClientId || decoded.loginClientId || decoded.clientId;
    const loginPropertyCode = decoded.loginPropertyCode;
    const {
      receiverId,
      receiverPropertyCode,
      taskTitle,
      taskDescription,
      startDate,
      dueDate,
      priority,
    } = req.body;

    if (!receiverId || !taskTitle) {
      return res.status(400).json({
        success: false,
        message: "receiverId and taskTitle are required",
      });
    }

    console.log("========== CREATE INDIVIDUAL TASK ==========");
    console.log("AssignedBy      :", userId);
    console.log("AssignedTo      :", receiverId);
    console.log("Current DB      :", currentDatabase);
    console.log("Current Property:", currentPropertyCode);
    console.log("============================================");

    const taskId = randomUUID();

    pool = await openCommunicationPool();

    //----------------------------------------------------
    // Insert Task (GroupId=NULL, ChallanId=NULL)
    //----------------------------------------------------
    await pool
      .request()
      .input("TaskId", sql.UniqueIdentifier, taskId)
      .input("TaskTitle", sql.NVarChar(400), taskTitle)
      .input("TaskDescription", sql.NVarChar(sql.MAX), taskDescription || "")
      .input("AssignedBy", sql.NVarChar(200), userId)
      .input("AssignedTo", sql.NVarChar(200), receiverId)
      .input("StartDate", sql.DateTime, startDate || null)
      .input("DueDate", sql.DateTime, dueDate || null)
      .input("Priority", sql.NVarChar(40), priority || "Medium")
      .input("DatabaseName", sql.NVarChar(100), currentDatabase)
      .input("PropertyCode", sql.NVarChar(20), currentPropertyCode)
      .input("ClientId", sql.UniqueIdentifier, currentClientId || null).query(`
INSERT INTO MA_ChatTasks
(
    TaskId,
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
    // Insert TASK message into MA_ChallanChat
    // (ChallanId="0001" is the convention for direct messages)
    //----------------------------------------------------
    await pool
      .request()
      .input("TaskId", sql.UniqueIdentifier, taskId)
      .input("SenderUserId", sql.NVarChar(100), userId)
      .input("SenderName", sql.NVarChar(200), userName)
      .input("MessageText", sql.NVarChar(sql.MAX), taskTitle)
      .input("DatabaseName", sql.NVarChar(100), currentDatabase)
      .input("PropertyCode", sql.NVarChar(20), currentPropertyCode)
      .input("SenderPropertyCode", sql.NVarChar(20), loginPropertyCode)
      .input(
        "ReceiverPropertyCode",
        sql.NVarChar(20),
        receiverPropertyCode || currentPropertyCode,
      )
      .input("ClientId", sql.UniqueIdentifier, currentClientId || null)
      .input("ReceiverId", sql.NVarChar(100), receiverId).query(`
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
    '0001',
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
    console.error("CREATE INDIVIDUAL TASK ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
      detail: err.originalError?.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});
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

    // Permanent Login Identity
    const userId = decoded.userId;
    const propertyCode = decoded.loginPropertyCode || decoded.propertyCode;
    const clientId = decoded.loginClientId || decoded.clientId;
    const isAdmin = decoded.isAdmin;

    const { challanId } = req.params;

    console.log("========= GET CHAT =========");
    console.log("User :", userId);
    console.log("Property :", propertyCode);
    console.log("Client :", clientId);
    console.log("Challan :", challanId);
    console.log("============================");

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
    c.ChallanId=@challanId
    AND c.MessageType<>'TASK'
    AND (@clientId IS NULL OR c.ClientId=@clientId)

UNION ALL

SELECT
    CAST(t.TaskId AS NVARCHAR(50)) AS ChatId,

    t.AssignedBy AS SenderUserId,

    ISNULL(byUser.UserName,t.AssignedBy) AS SenderName,

    NULL AS SenderPropertyCode,
    NULL AS ReceiverId,
    NULL AS ReceiverPropertyCode,

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
       ON toUser.UserId=t.AssignedTo
      AND toUser.ChallanId=t.ChallanId

LEFT JOIN MA_ChallanChatMembers byUser
       ON byUser.UserId=t.AssignedBy
      AND byUser.ChallanId=t.ChallanId

WHERE
    t.ChallanId=@challanId
    AND (@clientId IS NULL OR t.ClientId=@clientId)

ORDER BY MessageTime ASC
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
  } finally {
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
  }
});

// ── POST /api/chat/update-task-status ────────────────────────────────────────
// Updates a task's status in MA_ChatTasks (communication DB).
// Used by the task dashboard for both challan tasks and individual tasks.
router.post("/update-task-status", async (req, res) => {
  let pool;
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { taskId, status } = req.body;
    if (!taskId || !status) {
      return res
        .status(400)
        .json({ success: false, message: "taskId and status are required" });
    }

    pool = await openCommunicationPool();

    await pool
      .request()
      .input("TaskId", sql.NVarChar(50), taskId)
      .input("Status", sql.NVarChar(50), status).query(`
        UPDATE MA_ChatTasks
        SET Status = @Status
        WHERE TaskId = CONVERT(UNIQUEIDENTIFIER, @TaskId)
      `);

    return res.json({ success: true, message: "Task status updated" });
  } catch (err) {
    console.error("UPDATE TASK STATUS ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

module.exports = router;
