const express = require("express");
const sql = require("mssql");
const crypto = require("crypto");

const { decodeToken, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

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

// Helper: pass GroupId/ChatId as NVarChar to avoid UniqueIdentifier conversion error
// SQL Server will implicitly cast the string to UNIQUEIDENTIFIER in comparisons/inserts
const asUid = (val) => ({ type: sql.NVarChar(50), value: val });

// ── GET /api/group/users ──────────────────────────────────────────────────────
router.get("/users", verifyToken, async (req, res) => {
  let pool;
  try {
    const databaseName = req.user.database;
    const currentUserId = req.user.userId;

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("currentUserId", sql.NVarChar(100), currentUserId)
      .query(`
        SELECT
          mcm_14 AS UserId,
          mcm_15 AS UserName
        FROM rh_mcm_1
        WHERE mcm_29 = '1900-01-01 00:00:00.000'
          AND mcm_14 <> @currentUserId
        ORDER BY mcm_15
      `);

    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("GET GROUP USERS ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── POST /api/group/create ────────────────────────────────────────────────────
router.post("/create", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName, userId } = decoded;
    const { groupName, members = [] } = req.body;

    if (!groupName || groupName.trim() === "") {
      return res.status(400).json({ success: false, message: "Group name is required" });
    }

    pool = await openPool(databaseName);

    // ── Ensure tables exist (safe, never drops) ─────────────────
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MA_ChatGroups')
        CREATE TABLE MA_ChatGroups (
          GroupId         UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID() PRIMARY KEY,
          GroupName       NVARCHAR(200)     NOT NULL,
          CreatedBy       NVARCHAR(100)     NOT NULL,
          CreatedDate     DATETIME          NOT NULL DEFAULT GETDATE(),
          IsActive        BIT               NOT NULL DEFAULT 1,
          LastMessageTime DATETIME          NULL
        );
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='MA_ChatGroups' AND COLUMN_NAME='LastMessageTime')
        ALTER TABLE MA_ChatGroups ADD LastMessageTime DATETIME NULL;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='MA_ChatGroups' AND COLUMN_NAME='IsActive')
        ALTER TABLE MA_ChatGroups ADD IsActive BIT NOT NULL DEFAULT 1;
      -- Fix CreatedBy if it was incorrectly created as UNIQUEIDENTIFIER
      IF EXISTS (
        SELECT 1 FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('MA_ChatGroups')
          AND c.name = 'CreatedBy'
          AND t.name = 'uniqueidentifier'
      )
        ALTER TABLE MA_ChatGroups ALTER COLUMN CreatedBy NVARCHAR(100) NOT NULL;
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MA_ChatGroupMembers')
        CREATE TABLE MA_ChatGroupMembers (
          MemberId  UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID() PRIMARY KEY,
          GroupId   UNIQUEIDENTIFIER  NOT NULL,
          UserId    NVARCHAR(100)     NOT NULL,
          IsAdmin   BIT               NOT NULL DEFAULT 0,
          AddedBy   NVARCHAR(100)     NOT NULL,
          AddedDate DATETIME          NOT NULL DEFAULT GETDATE()
        );
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='MA_ChatGroupMembers' AND COLUMN_NAME='IsAdmin')
        ALTER TABLE MA_ChatGroupMembers ADD IsAdmin BIT NOT NULL DEFAULT 0;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='MA_ChatGroupMembers' AND COLUMN_NAME='AddedBy')
        ALTER TABLE MA_ChatGroupMembers ADD AddedBy NVARCHAR(100) NOT NULL DEFAULT '';
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='MA_ChatGroupMembers' AND COLUMN_NAME='AddedDate')
        ALTER TABLE MA_ChatGroupMembers ADD AddedDate DATETIME NOT NULL DEFAULT GETDATE();
      -- Fix UserId if it was incorrectly created as UNIQUEIDENTIFIER
      IF EXISTS (
        SELECT 1 FROM sys.columns c INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('MA_ChatGroupMembers') AND c.name = 'UserId' AND t.name = 'uniqueidentifier'
      )
        ALTER TABLE MA_ChatGroupMembers ALTER COLUMN UserId NVARCHAR(100) NOT NULL;
      -- Fix AddedBy if it was incorrectly created as UNIQUEIDENTIFIER
      IF EXISTS (
        SELECT 1 FROM sys.columns c INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('MA_ChatGroupMembers') AND c.name = 'AddedBy' AND t.name = 'uniqueidentifier'
      )
        ALTER TABLE MA_ChatGroupMembers ALTER COLUMN AddedBy NVARCHAR(100) NULL;
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MA_GroupChatMessages')
        CREATE TABLE MA_GroupChatMessages (
          ChatId        UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID() PRIMARY KEY,
          GroupId       UNIQUEIDENTIFIER  NOT NULL,
          SenderUserId  NVARCHAR(100)     NOT NULL,
          SenderName    NVARCHAR(200)     NOT NULL DEFAULT '',
          MessageText   NVARCHAR(MAX)     NOT NULL,
          MessageType   NVARCHAR(50)      NOT NULL DEFAULT 'TEXT',
          DocumentId    UNIQUEIDENTIFIER  NULL,
          MessageTime   DATETIME          NOT NULL DEFAULT GETDATE()
        );
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='MA_GroupChatMessages' AND COLUMN_NAME='SenderName')
        ALTER TABLE MA_GroupChatMessages ADD SenderName NVARCHAR(200) NOT NULL DEFAULT '';
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='MA_GroupChatMessages' AND COLUMN_NAME='MessageType')
        ALTER TABLE MA_GroupChatMessages ADD MessageType NVARCHAR(50) NOT NULL DEFAULT 'TEXT';
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='MA_GroupChatMessages' AND COLUMN_NAME='DocumentId')
        ALTER TABLE MA_GroupChatMessages ADD DocumentId UNIQUEIDENTIFIER NULL;
      -- Fix SenderUserId if it was incorrectly created as UNIQUEIDENTIFIER
      IF EXISTS (
        SELECT 1 FROM sys.columns c INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('MA_GroupChatMessages') AND c.name = 'SenderUserId' AND t.name = 'uniqueidentifier'
      )
        ALTER TABLE MA_GroupChatMessages ALTER COLUMN SenderUserId NVARCHAR(100) NOT NULL;
    `);
    // ────────────────────────────────────────────────────────────

    const groupId = crypto.randomUUID().toUpperCase();

    // Insert group — GroupId via NEWID() in SQL, returns it for use in members insert
    await pool
      .request()
      .input("GroupId",   sql.NVarChar(50),  groupId)
      .input("GroupName", sql.NVarChar(200),  groupName.trim())
      .input("CreatedBy", sql.NVarChar(100),  userId)
      .query(`
        INSERT INTO MA_ChatGroups (GroupId, GroupName, CreatedBy, CreatedDate, IsActive)
        VALUES (CONVERT(UNIQUEIDENTIFIER, @GroupId), @GroupName, @CreatedBy, GETDATE(), 1)
      `);

    // Creator is admin
    await pool
      .request()
      .input("GroupId", sql.NVarChar(50),  groupId)
      .input("UserId",  sql.NVarChar(100), userId)
      .input("AddedBy", sql.NVarChar(100), userId)
      .query(`
        INSERT INTO MA_ChatGroupMembers (MemberId, GroupId, UserId, IsAdmin, AddedBy, AddedDate)
        VALUES (NEWID(), CONVERT(UNIQUEIDENTIFIER, @GroupId), @UserId, 1, @AddedBy, GETDATE())
      `);

    // Add extra members
    for (const memberId of members) {
      if (!memberId || memberId.toLowerCase() === userId.toLowerCase()) continue;

      await pool
        .request()
        .input("GroupId", sql.NVarChar(50),  groupId)
        .input("UserId",  sql.NVarChar(100), memberId)
        .input("AddedBy", sql.NVarChar(100), userId)
        .query(`
          INSERT INTO MA_ChatGroupMembers (MemberId, GroupId, UserId, IsAdmin, AddedBy, AddedDate)
          VALUES (NEWID(), CONVERT(UNIQUEIDENTIFIER, @GroupId), @UserId, 0, @AddedBy, GETDATE())
        `);
    }

    return res.json({ success: true, groupId, message: "Group created successfully" });
  } catch (err) {
    console.error("CREATE GROUP ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
      detail: err.originalError?.message || err.toString(),
      number: err.number,
    });
  } finally {
    if (pool) await pool.close();
  }
});

// ── GET /api/group/my-groups ──────────────────────────────────────────────────
router.get("/my-groups", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName, userId } = decoded;
    pool = await openPool(databaseName);

    // Silently ensure tables exist
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MA_ChatGroups')
        CREATE TABLE MA_ChatGroups (
          GroupId UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
          GroupName NVARCHAR(200) NOT NULL, CreatedBy NVARCHAR(100) NOT NULL,
          CreatedDate DATETIME NOT NULL DEFAULT GETDATE(),
          IsActive BIT NOT NULL DEFAULT 1,
          LastMessageTime DATETIME NULL
        );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MA_ChatGroupMembers')
        CREATE TABLE MA_ChatGroupMembers (
          MemberId UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
          GroupId UNIQUEIDENTIFIER NOT NULL, UserId NVARCHAR(100) NOT NULL,
          IsAdmin BIT NOT NULL DEFAULT 0, AddedBy NVARCHAR(100) NOT NULL,
          AddedDate DATETIME NOT NULL DEFAULT GETDATE()
        );
    `);

    const result = await pool
      .request()
      .input("UserId", sql.NVarChar(100), userId)
      .query(`
        SELECT
          g.GroupId,
          g.GroupName,
          g.CreatedDate,
          g.LastMessageTime,
          (SELECT COUNT(*) FROM MA_ChatGroupMembers gm2 WHERE gm2.GroupId = g.GroupId) AS MemberCount
        FROM MA_ChatGroups g
        INNER JOIN MA_ChatGroupMembers gm ON g.GroupId = gm.GroupId
        WHERE gm.UserId = @UserId
        ORDER BY g.CreatedDate DESC
      `);

    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("MY GROUPS ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── POST /api/group/add-member ────────────────────────────────────────────────
router.post("/add-member", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName, userId: currentUserId } = decoded;
    const { groupId, userId } = req.body;

    pool = await openPool(databaseName);

    const adminCheck = await pool
      .request()
      .input("GroupId", sql.NVarChar(50),  groupId)
      .input("UserId",  sql.NVarChar(100), currentUserId)
      .query(`
        SELECT IsAdmin FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId) AND UserId = @UserId
      `);

    if (adminCheck.recordset.length === 0 || !adminCheck.recordset[0].IsAdmin) {
      return res.status(403).json({ success: false, message: "Only admin can add members" });
    }

    const exists = await pool
      .request()
      .input("GroupId", sql.NVarChar(50),  groupId)
      .input("UserId",  sql.NVarChar(100), userId)
      .query(`
        SELECT TOP 1 1 FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId) AND UserId = @UserId
      `);

    if (exists.recordset.length > 0) {
      return res.json({ success: false, message: "User already exists in group" });
    }

    await pool
      .request()
      .input("GroupId", sql.NVarChar(50),  groupId)
      .input("UserId",  sql.NVarChar(100), userId)
      .input("AddedBy", sql.NVarChar(100), currentUserId)
      .query(`
        INSERT INTO MA_ChatGroupMembers (MemberId, GroupId, UserId, IsAdmin, AddedBy, AddedDate)
        VALUES (NEWID(), CONVERT(UNIQUEIDENTIFIER, @GroupId), @UserId, 0, @AddedBy, GETDATE())
      `);

    return res.json({ success: true, message: "Member added successfully" });
  } catch (err) {
    console.error("ADD MEMBER ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── POST /api/group/remove-member ─────────────────────────────────────────────
router.post("/remove-member", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName, userId: currentUserId } = decoded;
    const { groupId, userId } = req.body;

    pool = await openPool(databaseName);

    const adminCheck = await pool
      .request()
      .input("GroupId", sql.NVarChar(50),  groupId)
      .input("UserId",  sql.NVarChar(100), currentUserId)
      .query(`
        SELECT IsAdmin FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId) AND UserId = @UserId
      `);

    if (adminCheck.recordset.length === 0 || !adminCheck.recordset[0].IsAdmin) {
      return res.status(403).json({ success: false, message: "Only admin can remove members" });
    }

    if (userId && currentUserId.toLowerCase() === userId.toLowerCase()) {
      return res.status(400).json({ success: false, message: "Admin cannot remove himself" });
    }

    await pool
      .request()
      .input("GroupId", sql.NVarChar(50),  groupId)
      .input("UserId",  sql.NVarChar(100), userId)
      .query(`
        DELETE FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId) AND UserId = @UserId
      `);

    return res.json({ success: true, message: "Member removed successfully" });
  } catch (err) {
    console.error("REMOVE MEMBER ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── GET /api/group/members/:groupId ──────────────────────────────────────────
router.get("/members/:groupId", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName } = decoded;
    const { groupId } = req.params;

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .query(`
        SELECT
          gm.MemberId,
          gm.UserId,
          gm.IsAdmin,
          gm.AddedDate,
          ISNULL(m.mcm_15, gm.UserId) AS UserName
        FROM MA_ChatGroupMembers gm
        LEFT JOIN rh_mcm_1 m ON m.mcm_14 = gm.UserId
        WHERE gm.GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)
        ORDER BY gm.IsAdmin DESC, m.mcm_15
      `);

    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("GROUP MEMBERS ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── POST /api/group/send-message ──────────────────────────────────────────────
router.post("/send-message", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName, userId, userName } = decoded;
    const { groupId, messageText, messageType = "TEXT", documentId = null } = req.body;

    pool = await openPool(databaseName);

    // Verify membership
    const memberCheck = await pool
      .request()
      .input("GroupId", sql.NVarChar(50),  groupId)
      .input("UserId",  sql.NVarChar(100), userId)
      .query(`
        SELECT TOP 1 1 FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId) AND UserId = @UserId
      `);

    if (memberCheck.recordset.length === 0) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    const chatId = crypto.randomUUID().toUpperCase();

    await pool
      .request()
      .input("ChatId",       sql.NVarChar(50),       chatId)
      .input("GroupId",      sql.NVarChar(50),        groupId)
      .input("SenderUserId", sql.NVarChar(100),       userId)
      .input("SenderName",   sql.NVarChar(200),       userName || "")
      .input("MessageText",  sql.NVarChar(sql.MAX),   messageText || "")
      .input("MessageType",  sql.NVarChar(50),        messageType)
      .input("DocumentId",   sql.NVarChar(50),        documentId)
      .query(`
        INSERT INTO MA_GroupChatMessages
          (ChatId, GroupId, SenderUserId, SenderName, MessageText, MessageType, DocumentId, MessageTime)
        VALUES (
          CONVERT(UNIQUEIDENTIFIER, @ChatId),
          CONVERT(UNIQUEIDENTIFIER, @GroupId),
          @SenderUserId,
          @SenderName,
          @MessageText,
          @MessageType,
          CASE WHEN @DocumentId IS NULL THEN NULL ELSE CONVERT(UNIQUEIDENTIFIER, @DocumentId) END,
          GETDATE()
        )
      `);

    await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .query(`
        UPDATE MA_ChatGroups SET LastMessageTime = GETDATE()
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)
      `);

    return res.json({ success: true, message: "Message sent" });
  } catch (err) {
    console.error("SEND GROUP MESSAGE ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

// ── GET /api/group/messages/:groupId ─────────────────────────────────────────
router.get("/messages/:groupId", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: databaseName, userId } = decoded;
    const { groupId } = req.params;

    pool = await openPool(databaseName);

    // Verify membership
    const memberCheck = await pool
      .request()
      .input("GroupId", sql.NVarChar(50),  groupId)
      .input("UserId",  sql.NVarChar(100), userId)
      .query(`
        SELECT TOP 1 1 FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId) AND UserId = @UserId
      `);

    if (memberCheck.recordset.length === 0) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const result = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .query(`
        SELECT ChatId, GroupId, SenderUserId, SenderName, MessageText, MessageType, DocumentId, MessageTime
        FROM MA_GroupChatMessages
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)
        ORDER BY MessageTime ASC
      `);

    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("GET GROUP MESSAGES ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});

module.exports = router;
