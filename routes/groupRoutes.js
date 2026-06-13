const express = require("express");
const sql = require("mssql");
const crypto = require("crypto");

const { decodeToken, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

// Creates a dynamic pool to the user's company database (same pattern as chatRoutes.js)
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

// ── GET /api/group/users ──────────────────────────────────────────────────────
// Returns all company employees for the "Add Member" picker.
// Uses rh_mcm_1 (employee master) with a self-join to show reporting head.
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

//
// CREATE GROUP
//
router.post("/create", async (req, res) => {
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

    const { groupName, members = [] } = req.body;

    if (!groupName || groupName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Group name is required",
      });
    }

    pool = await openPool(databaseName);

    // ── Auto-create tables if they don't exist ──────────────────
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MA_ChatGroups'
      )
      CREATE TABLE MA_ChatGroups (
        GroupId         UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID() PRIMARY KEY,
        GroupName       NVARCHAR(200)     NOT NULL,
        CreatedBy       NVARCHAR(100)     NOT NULL,
        CreatedDate     DATETIME          NOT NULL DEFAULT GETDATE(),
        LastMessageTime DATETIME          NULL
      )
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MA_ChatGroupMembers'
      )
      CREATE TABLE MA_ChatGroupMembers (
        MemberId   UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID() PRIMARY KEY,
        GroupId    UNIQUEIDENTIFIER  NOT NULL,
        UserId     NVARCHAR(100)     NOT NULL,
        IsAdmin    BIT               NOT NULL DEFAULT 0,
        AddedBy    NVARCHAR(100)     NOT NULL,
        AddedDate  DATETIME          NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_GroupMember UNIQUE (GroupId, UserId)
      )
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MA_GroupChatMessages'
      )
      CREATE TABLE MA_GroupChatMessages (
        ChatId        UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID() PRIMARY KEY,
        GroupId       UNIQUEIDENTIFIER  NOT NULL,
        SenderUserId  NVARCHAR(100)     NOT NULL,
        SenderName    NVARCHAR(200)     NOT NULL,
        MessageText   NVARCHAR(MAX)     NOT NULL,
        MessageType   NVARCHAR(50)      NOT NULL DEFAULT 'TEXT',
        DocumentId    UNIQUEIDENTIFIER  NULL,
        MessageTime   DATETIME          NOT NULL DEFAULT GETDATE()
      )
    `);
    // ────────────────────────────────────────────────────────────

    const groupId = crypto.randomUUID();

    await pool
      .request()
      .input("GroupId", sql.UniqueIdentifier, groupId)
      .input("GroupName", sql.VarChar(200), groupName.trim())
      .input("CreatedBy", sql.NVarChar(100), userId).query(`
        INSERT INTO MA_ChatGroups
        (
            GroupId,
            GroupName,
            CreatedBy,
            CreatedDate
        )
        VALUES
        (
            @GroupId,
            @GroupName,
            @CreatedBy,
            GETDATE()
        )
      `);

    // Creator becomes admin
    await pool
      .request()
      .input("GroupId", sql.UniqueIdentifier, groupId)
      .input("UserId", sql.NVarChar(100), userId)
      .input("AddedBy", sql.NVarChar(100), userId).query(`
        INSERT INTO MA_ChatGroupMembers
        (
            MemberId,
            GroupId,
            UserId,
            IsAdmin,
            AddedBy,
            AddedDate
        )
        VALUES
        (
            NEWID(),
            @GroupId,
            @UserId,
            1,
            @AddedBy,
            GETDATE()
        )
      `);

    // Add members
    for (const memberId of members) {
      if (memberId && memberId.toLowerCase() === userId.toLowerCase()) {
        continue;
      }

      await pool
        .request()
        .input("GroupId", sql.UniqueIdentifier, groupId)
        .input("UserId", sql.NVarChar(100), memberId)
        .input("AddedBy", sql.NVarChar(100), userId).query(`
          INSERT INTO MA_ChatGroupMembers
          (
              MemberId,
              GroupId,
              UserId,
              IsAdmin,
              AddedBy,
              AddedDate
          )
          VALUES
          (
              NEWID(),
              @GroupId,
              @UserId,
              0,
              @AddedBy,
              GETDATE()
          )
        `);
    }

    return res.json({
      success: true,
      groupId,
      message: "Group created successfully",
    });
  } catch (err) {
    console.error("CREATE GROUP ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});

//
// MY GROUPS
//
router.get("/my-groups", async (req, res) => {
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

    // Auto-create tables silently if missing
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MA_ChatGroups')
      CREATE TABLE MA_ChatGroups (
        GroupId UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        GroupName NVARCHAR(200) NOT NULL, CreatedBy NVARCHAR(100) NOT NULL,
        CreatedDate DATETIME NOT NULL DEFAULT GETDATE(), LastMessageTime DATETIME NULL
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MA_ChatGroupMembers')
      CREATE TABLE MA_ChatGroupMembers (
        MemberId UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        GroupId UNIQUEIDENTIFIER NOT NULL, UserId NVARCHAR(100) NOT NULL,
        IsAdmin BIT NOT NULL DEFAULT 0, AddedBy NVARCHAR(100) NOT NULL,
        AddedDate DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_GroupMember UNIQUE (GroupId, UserId)
      )
    `);

    const result = await pool
      .request()
      .input("UserId", sql.NVarChar(100), userId).query(`
        SELECT
            g.GroupId,
            g.GroupName,
            g.CreatedDate,
            g.LastMessageTime,

            (
              SELECT COUNT(*)

              FROM MA_ChatGroupMembers gm
              WHERE gm.GroupId = g.GroupId
            ) AS MemberCount

        FROM MA_ChatGroups g

        INNER JOIN MA_ChatGroupMembers gm
            ON g.GroupId = gm.GroupId

        WHERE gm.UserId = @UserId

      ORDER BY
    g.CreatedDate DESC
      `);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("MY GROUPS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});

//
// ADD MEMBER
//
router.post("/add-member", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database: databaseName, userId: currentUserId } = decoded;

    const { groupId, userId } = req.body;

    pool = await openPool(databaseName);

    const adminCheck = await pool
      .request()
      .input("GroupId", sql.UniqueIdentifier, groupId)
      .input("UserId", sql.NVarChar(100), currentUserId).query(`
        SELECT IsAdmin
        FROM MA_ChatGroupMembers
        WHERE GroupId = @GroupId
        AND UserId = @UserId
      `);

    if (
      adminCheck.recordset.length === 0 ||
      adminCheck.recordset[0].IsAdmin !== true
    ) {
      return res.status(403).json({
        success: false,
        message: "Only admin can add members",
      });
    }

    const exists = await pool
      .request()
      .input("GroupId", sql.UniqueIdentifier, groupId)
      .input("UserId", sql.NVarChar(100), userId).query(`
        SELECT TOP 1 1
        FROM MA_ChatGroupMembers
        WHERE GroupId = @GroupId
        AND UserId = @UserId
      `);

    if (exists.recordset.length > 0) {
      return res.json({
        success: false,
        message: "User already exists in group",
      });
    }

    await pool
      .request()
      .input("GroupId", sql.UniqueIdentifier, groupId)
      .input("UserId", sql.NVarChar(100), userId)
      .input("AddedBy", sql.NVarChar(100), currentUserId).query(`
        INSERT INTO MA_ChatGroupMembers
        (
            MemberId,
            GroupId,
            UserId,
            IsAdmin,
            AddedBy,
            AddedDate
        )
        VALUES
        (
            NEWID(),
            @GroupId,
            @UserId,
            0,
            @AddedBy,
            GETDATE()
        )
      `);

    return res.json({
      success: true,
      message: "Member added successfully",
    });
  } catch (err) {
    console.error("ADD MEMBER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});

//
// REMOVE MEMBER
//
router.post("/remove-member", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database: databaseName, userId: currentUserId } = decoded;

    const { groupId, userId } = req.body;

    pool = await openPool(databaseName);

    const adminCheck = await pool
      .request()
      .input("GroupId", sql.UniqueIdentifier, groupId)
      .input("UserId", sql.NVarChar(100), currentUserId).query(`
        SELECT IsAdmin
        FROM MA_ChatGroupMembers
        WHERE GroupId = @GroupId
        AND UserId = @UserId
      `);

    if (
      adminCheck.recordset.length === 0 ||
      adminCheck.recordset[0].IsAdmin !== true
    ) {
      return res.status(403).json({
        success: false,
        message: "Only admin can remove members",
      });
    }

    if (userId && currentUserId.toLowerCase() === userId.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "Admin cannot remove himself",
      });
    }

    await pool
      .request()
      .input("GroupId", sql.UniqueIdentifier, groupId)
      .input("UserId", sql.NVarChar(100), userId).query(`
        DELETE FROM MA_ChatGroupMembers
        WHERE GroupId = @GroupId
        AND UserId = @UserId
      `);

    return res.json({
      success: true,
      message: "Member removed successfully",
    });
  } catch (err) {
    console.error("REMOVE MEMBER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});

//
// GROUP MEMBERS
//
router.get("/members/:groupId", async (req, res) => {
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

    const { groupId } = req.params;

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("GroupId", sql.UniqueIdentifier, groupId).query(`
        SELECT
            gm.MemberId,
            gm.UserId,
            gm.IsAdmin,
            gm.AddedDate,
            ISNULL(m.mcm_15, gm.UserId) AS UserName

        FROM MA_ChatGroupMembers gm

        LEFT JOIN rh_mcm_1 m
            ON m.mcm_14 = gm.UserId

        WHERE gm.GroupId = @GroupId

        ORDER BY
            gm.IsAdmin DESC,
            m.mcm_15
      `);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("GROUP MEMBERS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});
//
// SEND GROUP MESSAGE
//
router.post("/send-message", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database: databaseName, userId, userName } = decoded;

    const {
      groupId,
      messageText,
      messageType = "TEXT",
      documentId = null,
    } = req.body;

    pool = await openPool(databaseName);

    // Verify user belongs to group
    const memberCheck = await pool
      .request()
      .input("GroupId", sql.UniqueIdentifier, groupId)
      .input("UserId", sql.NVarChar(100), userId).query(`
        SELECT TOP 1 1
        FROM MA_ChatGroupMembers
        WHERE GroupId = @GroupId
        AND UserId = @UserId
      `);

    if (memberCheck.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    await pool
      .request()
      .input("ChatId", sql.UniqueIdentifier, crypto.randomUUID())
      .input("GroupId", sql.UniqueIdentifier, groupId)
      .input("SenderUserId", sql.UniqueIdentifier, userId)
      .input("SenderName", sql.VarChar(200), userName || "")
      .input("MessageText", sql.NVarChar(sql.MAX), messageText || "")
      .input("MessageType", sql.VarChar(50), messageType)
      .input("DocumentId", sql.UniqueIdentifier, documentId).query(`
        INSERT INTO MA_GroupChatMessages
        (
          ChatId,
          GroupId,
          SenderUserId,
          SenderName,
          MessageText,
          MessageType,
          DocumentId,
          MessageTime
        )
        VALUES
        (
          @ChatId,
          @GroupId,
          @SenderUserId,
          @SenderName,
          @MessageText,
          @MessageType,
          @DocumentId,
          GETDATE()
        )
      `);

    // Update group last activity
    await pool.request().input("GroupId", sql.UniqueIdentifier, groupId).query(`
        UPDATE MA_ChatGroups
        SET LastMessageTime = GETDATE()
        WHERE GroupId = @GroupId
      `);

    return res.json({
      success: true,
      message: "Message sent",
    });
  } catch (err) {
    console.error("SEND GROUP MESSAGE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});
//
// GET GROUP MESSAGES
//
router.get("/messages/:groupId", async (req, res) => {
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

    const { groupId } = req.params;

    pool = await openPool(databaseName);

    // Verify membership
    const memberCheck = await pool
      .request()
      .input("GroupId", sql.UniqueIdentifier, groupId)
      .input("UserId", sql.NVarChar(100), userId).query(`
        SELECT TOP 1 1
        FROM MA_ChatGroupMembers
        WHERE GroupId = @GroupId
        AND UserId = @UserId
      `);

    if (memberCheck.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const result = await pool
      .request()
      .input("GroupId", sql.UniqueIdentifier, groupId).query(`
        SELECT
            ChatId,
            GroupId,
            SenderUserId,
            SenderName,
            MessageText,
            MessageType,
            DocumentId,
            MessageTime

        FROM MA_GroupChatMessages

        WHERE GroupId = @GroupId

        ORDER BY MessageTime ASC
      `);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("GET GROUP MESSAGES ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});

module.exports = router;
