const express = require("express");
const sql = require("mssql");
const crypto = require("crypto");
const { sendPushNotification } = require("../utils/pushNotificationHelper");
const { decodeToken, verifyToken } = require("../middleware/authMiddleware");
const openCommunicationPool = require("../utils/communicationPool");
const openMasterPool = require("../utils/masterPool");
const { getAccessibleDatabases } = require("../utils/databaseAccessHelper");

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

// ── Helper: resolve the correct database for a group ─────────────────────────
// Groups belong to a single dealership. DatabaseName is stored in MA_ChatGroups
// (in the master/current DB). We look it up and return it so every group
// operation writes to the EMPLOYEE's company DB, not the logged-in user's DB.
async function getGroupDatabase(groupId, fallbackDb) {
  let pool;
  let usingCommunicationPool = false;

  try {
    // Try the current working DB first.
    pool = await openPool(fallbackDb);
    const result = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId).query(`
        SELECT DatabaseName
        FROM MA_ChatGroups
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)
      `);
    const dbName = result.recordset[0]?.DatabaseName;
    if (dbName && dbName.trim() !== "") {
      return dbName.trim();
    }
  } catch (err) {
    // If the current DB doesn't contain MA_ChatGroups or the query fails,
    // fall back to the shared communication DB.
    console.error("getGroupDatabase initial lookup failed:", err.message);
  } finally {
    if (pool) {
      await pool.close();
      pool = null;
    }
  }

  try {
    pool = await openCommunicationPool();
    usingCommunicationPool = true;
    const commResult = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId).query(`
        SELECT DatabaseName
        FROM MA_ChatGroups
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)
      `);
    const commDbName = commResult.recordset[0]?.DatabaseName;
    return commDbName && commDbName.trim() !== ""
      ? commDbName.trim()
      : fallbackDb;
  } catch {
    return fallbackDb;
  } finally {
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
  }
}

// ── GET /api/group/users ──────────────────────────────────────────────────────
router.get("/users", verifyToken, async (req, res) => {
  let pool;

  try {
    pool = await openPool(req.user.database);

    const result = await pool.request().query(`
      SELECT
          CAST(utunqid AS NVARCHAR(50)) AS id,
          utnm AS name
      FROM rh_secut
      WHERE ISNULL(utnm,'') <> ''
        AND utg IS NOT NULL
      ORDER BY utnm
    `);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("GET USERS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});

// ── GET /api/group/merged-users ───────────────────────────────────────────────
// Returns users from ALL dealerships the current user has access to.
// Each user entry includes { id, name, companyName, companyCode, database }.
// Users with single-dealership access get only their own company's users.
// Requires userGuid in JWT (set during login from MA_MasterUsers).
router.get("/merged-users", verifyToken, async (req, res) => {
  const { database: currentDb, userGuid } = req.user;
  let masterPool;

  try {
    // If no userGuid, fall back to single-company user list
    if (!userGuid) {
      let pool;
      try {
        pool = await openPool(currentDb);
        const result = await pool.request().query(`
          SELECT
              CAST(utunqid AS NVARCHAR(50)) AS id,
              utnm AS name,
              NULL AS companyName,
              NULL AS companyCode,
              NULL AS [database]
          FROM rh_secut
          WHERE ISNULL(utnm,'') <> ''
            AND utg IS NOT NULL
          ORDER BY utnm
        `);
        return res.json({
          success: true,
          data: result.recordset,
          merged: false,
        });
      } finally {
        if (pool) await pool.close();
      }
    }

    // Look up all databases this user has access to
    masterPool = await new sql.ConnectionPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "1433"),
      database: "CMPY_AUTOSHOP",
      options: { encrypt: false, trustServerCertificate: true },
    }).connect();

    const accessResult = await masterPool
      .request()
      .input("userGuid", sql.UniqueIdentifier, userGuid).query(`
        SELECT
            CM.unqid      AS clientId,
            CM.propertycode AS companyCode,
            CM.propertyname AS companyName,
            CM.propertydb   AS [database]
        FROM MA_UserDatabaseAccess UA
        INNER JOIN MA_ClientMaster CM ON UA.ClientId = CM.unqid
        WHERE UA.UserGuid = @userGuid
      `);

    const accessibleDbs = accessResult.recordset;

    // If only one dealership (or none found), no need to merge
    if (accessibleDbs.length <= 1) {
      let pool;
      const targetDb =
        accessibleDbs.length === 1 ? accessibleDbs[0].database : currentDb;
      const companyName =
        accessibleDbs.length === 1 ? accessibleDbs[0].companyName : null;
      const companyCode =
        accessibleDbs.length === 1 ? accessibleDbs[0].companyCode : null;
      try {
        pool = await openPool(targetDb);
        const result = await pool.request().query(`
          SELECT
              CAST(utunqid AS NVARCHAR(50)) AS id,
              utnm AS name,
              NULL AS companyName,
              NULL AS companyCode,
              NULL AS [database]
          FROM rh_secut
          WHERE ISNULL(utnm,'') <> ''
            AND utg IS NOT NULL
          ORDER BY utnm
        `);
        return res.json({
          success: true,
          data: result.recordset,
          merged: false,
        });
      } finally {
        if (pool) await pool.close();
      }
    }

    // Multiple dealerships — fetch users from each and merge
    const allUsers = [];
    const seenIds = new Set(); // deduplicate by "database:userId"

    for (const db of accessibleDbs) {
      let pool;
      try {
        pool = await openPool(db.database);
        const result = await pool.request().query(`
          SELECT
              CAST(utunqid AS NVARCHAR(50)) AS id,
              utnm AS name
          FROM rh_secut
          WHERE ISNULL(utnm,'') <> ''
            AND utg IS NOT NULL
          ORDER BY utnm
        `);

        for (const user of result.recordset) {
          const key = `${db.database}:${user.id}`;
          if (!seenIds.has(key) && user.id) {
            seenIds.add(key);
            allUsers.push({
              id: user.id,
              name: user.name,
              companyName: db.companyName,
              companyCode: db.companyCode,
              database: db.database,
            });
          }
        }
      } catch (dbErr) {
        console.error(
          `MERGED-USERS: failed to fetch from ${db.database}:`,
          dbErr.message,
        );
      } finally {
        if (pool) await pool.close();
      }
    }

    // Sort by name
    allUsers.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    return res.json({ success: true, data: allUsers, merged: true });
  } catch (err) {
    console.error("MERGED-USERS ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (masterPool) await masterPool.close();
  }
});

// ── POST /api/group/create ────────────────────────────────────────────────────
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

    // Permanent login identity
    const currentDb = decoded.loginDatabase || decoded.database;

    const currentPropertyCode =
      decoded.currentPropertyCode ||
      decoded.loginPropertyCode ||
      decoded.propertyCode;

    const currentClientId = decoded.loginClientId || decoded.clientId;

    const userId = decoded.userId;

    const { groupName, members = [], databaseName: groupDb } = req.body;

    const databaseName =
      groupDb && groupDb.trim() !== "" ? groupDb.trim() : currentDb;

    if (!groupName || groupName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Group name is required",
      });
    }

    pool = await openCommunicationPool();

    const groupId = crypto.randomUUID().toUpperCase();

    //------------------------------------------
    // Insert Group
    //------------------------------------------

    await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("GroupName", sql.NVarChar(200), groupName.trim())
      .input("CreatedBy", sql.NVarChar(100), userId)
      .input("DatabaseName", sql.NVarChar(200), databaseName)
      .input("PropertyCode", sql.NVarChar(50), currentPropertyCode)
      .input("ClientId", sql.UniqueIdentifier, currentClientId).query(`
        INSERT INTO MA_ChatGroups
        (
            GroupId,
            GroupName,
            CreatedBy,
            CreatedDate,
            IsActive,
            LastMessageTime,
            DatabaseName,
            PropertyCode,
            ClientId
        )
        VALUES
        (
            CONVERT(UNIQUEIDENTIFIER,@GroupId),
            @GroupName,
            @CreatedBy,
            GETDATE(),
            1,
            NULL,
            @DatabaseName,
            @PropertyCode,
            @ClientId
        )
      `);

    //------------------------------------------
    // Insert Creator
    //------------------------------------------

    await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("UserId", sql.NVarChar(100), userId)
      .input("AddedBy", sql.NVarChar(100), userId)
      .input("DatabaseName", sql.NVarChar(200), databaseName)
      .input("PropertyCode", sql.NVarChar(50), currentPropertyCode)
      .input("ClientId", sql.UniqueIdentifier, currentClientId).query(`
        INSERT INTO MA_ChatGroupMembers
        (
            MemberId,
            GroupId,
            UserId,
            IsAdmin,
            AddedBy,
            AddedDate,
            DatabaseName,
            PropertyCode,
            ClientId
        )
        VALUES
        (
            NEWID(),
            CONVERT(UNIQUEIDENTIFIER,@GroupId),
            @UserId,
            1,
            @AddedBy,
            GETDATE(),
            @DatabaseName,
            @PropertyCode,
            @ClientId
        )
      `);

    //------------------------------------------
    // Insert Other Members
    //------------------------------------------

    for (const member of members) {
      const memberId = typeof member === "string" ? member : member.id;

      const memberDb =
        typeof member === "object"
          ? member.database || databaseName
          : databaseName;

      const memberProperty =
        typeof member === "object"
          ? member.propertyCode || currentPropertyCode
          : currentPropertyCode;

      const memberClientId =
        typeof member === "object"
          ? member.clientId || currentClientId
          : currentClientId;

      if (!memberId || memberId.toLowerCase() === userId.toLowerCase()) {
        continue;
      }

      await pool
        .request()
        .input("GroupId", sql.NVarChar(50), groupId)
        .input("UserId", sql.NVarChar(100), memberId)
        .input("AddedBy", sql.NVarChar(100), userId)
        .input("DatabaseName", sql.NVarChar(200), memberDb)
        .input("PropertyCode", sql.NVarChar(50), memberProperty)
        .input("ClientId", sql.UniqueIdentifier, memberClientId).query(`
          INSERT INTO MA_ChatGroupMembers
          (
              MemberId,
              GroupId,
              UserId,
              IsAdmin,
              AddedBy,
              AddedDate,
              DatabaseName,
              PropertyCode,
              ClientId
          )
          VALUES
          (
              NEWID(),
              CONVERT(UNIQUEIDENTIFIER,@GroupId),
              @UserId,
              0,
              @AddedBy,
              GETDATE(),
              @DatabaseName,
              @PropertyCode,
              @ClientId
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
      detail: err.originalError?.message || err.toString(),
    });
  } finally {
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
  }
});

router.get("/my-direct-chats", async (req, res) => {
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
    // Permanent Login Identity
    //----------------------------------------------------

    const userId = decoded.userId;

    const propertyCode = decoded.loginPropertyCode || decoded.propertyCode;

    const database = decoded.loginDatabase || decoded.database;

    const clientId = decoded.loginClientId || decoded.clientId;

    const userGuid = decoded.userGuid;

    const scope = (req.query.scope || "property").toLowerCase();

    console.log("========== MY DIRECT CHATS ==========");
    console.log("User :", userId);
    console.log("UserGuid :", userGuid);
    console.log("Database :", database);
    console.log("Property :", propertyCode);
    console.log("Client :", clientId);
    console.log("Scope :", scope);
    console.log("====================================");

    pool = await openCommunicationPool();
    let allowedProperties = [propertyCode];

    if (decoded.isAdmin) {
      const masterPool = await openMasterPool();

      try {
        const access = await masterPool
          .request()
          .input("userGuid", sql.UniqueIdentifier, userGuid).query(`
        SELECT CM.PropertyCode
        FROM MA_UserDatabaseAccess UA
        INNER JOIN Cmpy_AutoShop.dbo.MA_ClientMaster CM
            ON UA.ClientId = CM.Unqid
        WHERE UA.UserGuid = @userGuid
      `);

        if (access.recordset.length > 0) {
          allowedProperties = access.recordset.map((x) => x.PropertyCode);
        }
      } finally {
        await masterPool.close();
      }
    }
    const result = await pool
      .request()
      .input("userId", sql.NVarChar(100), userId)
      .input("userGuid", sql.UniqueIdentifier, userGuid)
      .input("propertyCode", sql.NVarChar(50), propertyCode)
      .input("clientId", sql.UniqueIdentifier, clientId || null)
      .input(
        "allowedProperties",
        sql.NVarChar(sql.MAX),
        allowedProperties.join(","),
      )
      .input("scope", sql.NVarChar(20), scope).query(`
;WITH BaseChat AS
(
    SELECT
        CASE
            WHEN
            (
                (SenderUserId = @userId
                 OR SenderUserId = CONVERT(NVARCHAR(50), @userGuid))
                AND
                (
                    EXISTS
(
    SELECT 1
    FROM STRING_SPLIT(@allowedProperties, ',') p
    WHERE LTRIM(RTRIM(p.value)) = SenderPropertyCode
)
                    OR SenderPropertyCode=@propertyCode
                )
            )
            THEN ReceiverId
            ELSE SenderUserId
        END AS OtherUserId,

        CASE
            WHEN
            (
                (SenderUserId = @userId
                 OR SenderUserId = CONVERT(NVARCHAR(50), @userGuid))
                AND
                (
                   EXISTS
(
    SELECT 1
    FROM STRING_SPLIT(@allowedProperties, ',') p
    WHERE LTRIM(RTRIM(p.value)) = SenderPropertyCode
)
                    OR SenderPropertyCode=@propertyCode
                )
            )
            THEN ReceiverPropertyCode
            ELSE SenderPropertyCode
        END AS OtherPropertyCode,

        MessageText,
        MessageTime,
        MessageType,
        SenderUserId,
        ReceiverId,
        SenderPropertyCode,
        ReceiverPropertyCode

    FROM MA_ChallanChat

    WHERE

    (
        (
            SenderUserId=@userId
            OR SenderUserId=CONVERT(NVARCHAR(50),@userGuid)
        )
        AND
        (
           EXISTS
(
    SELECT 1
    FROM STRING_SPLIT(@allowedProperties, ',') p
    WHERE LTRIM(RTRIM(p.value)) = SenderPropertyCode
)
            OR SenderPropertyCode=@propertyCode
        )
    )

    OR

    (
        (
            ReceiverId=@userId
            OR ReceiverId=CONVERT(NVARCHAR(50),@userGuid)
        )
        AND
        (
           EXISTS
(
    SELECT 1
    FROM STRING_SPLIT(@allowedProperties, ',') p
    WHERE LTRIM(RTRIM(p.value)) = ReceiverPropertyCode
)
            OR ReceiverPropertyCode=@propertyCode
        )
    )

    AND
    (@clientId IS NULL OR ClientId=@clientId)
),

ChatList AS
(
    SELECT *,
           ROW_NUMBER() OVER
           (
               PARTITION BY
                    OtherUserId,
                    CASE
                        WHEN @scope='all'
                        THEN ''
                        ELSE OtherPropertyCode
                    END
               ORDER BY MessageTime DESC
           ) rn
    FROM BaseChat
)

SELECT

    c.OtherUserId AS UserId,

    m.UserName,

    CASE
        WHEN @scope='all'
        THEN agg.PropertyCodes
        ELSE m.PropertyCode
    END AS PropertyCode,

    CASE
        WHEN @scope='all'
        THEN agg.DatabaseNames
        ELSE m.DatabaseName
    END AS DatabaseName,

    CASE
        WHEN @scope='all'
        THEN agg.CompanyNames
        ELSE cm.PropertyName
    END AS CompanyName,

    c.MessageText,

    c.MessageTime AS LastMessageTime,

    c.MessageType,

    c.SenderUserId,

    (
        SELECT COUNT(*)
        FROM MA_ChallanChat x
        WHERE
            x.SenderUserId = c.OtherUserId
            AND x.ReceiverId = @userId
            AND x.IsRead = 0
            AND
            (
                @scope='all'
                OR
                (
                    x.SenderPropertyCode = c.OtherPropertyCode
                    AND x.ReceiverPropertyCode = @propertyCode
                )
            )
            AND
            (@clientId IS NULL OR x.ClientId=@clientId)
    ) AS UnreadCount

FROM ChatList c

OUTER APPLY
(
    SELECT TOP (1)
        UserName,
        PropertyCode,
        DatabaseName
    FROM MA_ChallanChatMembers
    WHERE
        UserId = c.OtherUserId
        AND
        (
            @scope='all'
            OR PropertyCode=c.OtherPropertyCode
        )
) m

OUTER APPLY
(
    SELECT
        STRING_AGG(PropertyCode, ', ') AS PropertyCodes,
        STRING_AGG(DatabaseName, ', ') AS DatabaseNames,
        STRING_AGG(PropertyName, ', ') AS CompanyNames
    FROM
    (
        SELECT DISTINCT
            mm.PropertyCode,
            mm.DatabaseName,
            cm.PropertyName
        FROM MA_ChallanChatMembers mm
        INNER JOIN Cmpy_AutoShop.dbo.MA_ClientMaster cm
            ON cm.PropertyCode = mm.PropertyCode
        WHERE mm.UserId = c.OtherUserId
    ) d
) agg

LEFT JOIN Cmpy_AutoShop.dbo.MA_ClientMaster cm
    ON cm.PropertyCode = m.PropertyCode

WHERE c.rn = 1

ORDER BY c.MessageTime DESC;
`);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error("MY DIRECT CHATS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
  }
});

// ── GET /api/group/my-groups ──────────────────────────────────────────────────
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

    const { userId, isAdmin } = decoded;

    // Always use Communication DB
    pool = await openCommunicationPool();

    // Ensure required tables exist
    const tableCheck = await pool.request().query(`
      SELECT COUNT(*) AS Total
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME IN
      (
        'MA_ChatGroups',
        'MA_ChatGroupMembers',
        'MA_GroupChatMessages'
      )
    `);

    if (tableCheck.recordset[0].Total < 3) {
      return res.json({
        success: true,
        data: [],
      });
    }

    let result;

    if (isAdmin) {
      result = await pool.request().query(`
        SELECT
            g.GroupId,
            g.GroupName,
            g.CreatedDate,
            g.LastMessageTime,
            g.DatabaseName,
            (
                SELECT COUNT(*)
                FROM MA_ChatGroupMembers gm2
                WHERE gm2.GroupId = g.GroupId
            ) AS MemberCount,

            (
                SELECT TOP 1 MessageText
                FROM MA_GroupChatMessages
                WHERE GroupId = g.GroupId
                ORDER BY MessageTime DESC
            ) AS LastMessage

        FROM MA_ChatGroups g
        WHERE ISNULL(g.IsActive,1)=1

        ORDER BY ISNULL(g.LastMessageTime,g.CreatedDate) DESC
      `);
    } else {
      result = await pool.request().input("UserId", sql.NVarChar(100), userId)
        .query(`
          SELECT DISTINCT
              g.GroupId,
              g.GroupName,
              g.CreatedDate,
              g.LastMessageTime,
              g.DatabaseName,

              (
                  SELECT COUNT(*)
                  FROM MA_ChatGroupMembers gm2
                  WHERE gm2.GroupId = g.GroupId
              ) AS MemberCount,

              (
                  SELECT TOP 1 MessageText
                  FROM MA_GroupChatMessages
                  WHERE GroupId = g.GroupId
                  ORDER BY MessageTime DESC
              ) AS LastMessage

          FROM MA_ChatGroups g
          INNER JOIN MA_ChatGroupMembers gm
              ON gm.GroupId = g.GroupId

          WHERE ISNULL(g.IsActive,1)=1
            AND (
                 LOWER(gm.UserId)=LOWER(@UserId)
                 OR LOWER(g.CreatedBy)=LOWER(@UserId)
            )

          ORDER BY ISNULL(g.LastMessageTime,g.CreatedDate) DESC
        `);
    }

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

// ── POST /api/group/add-member ────────────────────────────────────────────────
router.post("/add-member", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: currentDb, userId: currentUserId } = decoded;
    const { groupId, userId } = req.body;

    // Resolve which DB this group belongs to
    const databaseName = await getGroupDatabase(groupId, currentDb);
    pool = await openCommunicationPool();

    const adminCheck = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("UserId", sql.NVarChar(100), currentUserId).query(`
        SELECT IsAdmin FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId) AND UserId = @UserId
      `);

    if (adminCheck.recordset.length === 0 || !adminCheck.recordset[0].IsAdmin) {
      return res
        .status(403)
        .json({ success: false, message: "Only admin can add members" });
    }

    const exists = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("UserId", sql.NVarChar(100), userId).query(`
        SELECT TOP 1 1 FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId) AND UserId = @UserId
      `);

    if (exists.recordset.length > 0) {
      return res.json({
        success: false,
        message: "User already exists in group",
      });
    }

    await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("UserId", sql.NVarChar(100), userId)
      .input("AddedBy", sql.NVarChar(100), currentUserId).query(`
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

    const { database: currentDb, userId: currentUserId } = decoded;
    const { groupId, userId } = req.body;

    // Resolve which DB this group belongs to
    const databaseName = await getGroupDatabase(groupId, currentDb);
    pool = await openCommunicationPool();

    const adminCheck = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("UserId", sql.NVarChar(100), currentUserId).query(`
        SELECT IsAdmin FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId) AND UserId = @UserId
      `);

    if (adminCheck.recordset.length === 0 || !adminCheck.recordset[0].IsAdmin) {
      return res
        .status(403)
        .json({ success: false, message: "Only admin can remove members" });
    }

    if (userId && currentUserId.toLowerCase() === userId.toLowerCase()) {
      return res
        .status(400)
        .json({ success: false, message: "Admin cannot remove himself" });
    }

    await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("UserId", sql.NVarChar(100), userId).query(`
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
// ── GET /api/group/members/:groupId ──────────────────────────
// -- POST /api/group/delete-group -----------------------------------------
router.post("/delete-group", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { database: currentDb, userId: currentUserId } = decoded;
    const { groupId, databaseName: bodyDatabaseName } = req.body;

    if (!groupId) {
      return res
        .status(400)
        .json({ success: false, message: "GroupId is required" });
    }

    const databaseName =
      bodyDatabaseName && bodyDatabaseName.trim() !== ""
        ? bodyDatabaseName.trim()
        : await getGroupDatabase(groupId, currentDb);

    pool = await openCommunicationPool();

    const adminCheck = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("UserId", sql.NVarChar(100), currentUserId).query(`
        SELECT TOP 1
          g.CreatedBy,
          ISNULL(gm.IsAdmin, 0) AS IsAdmin
        FROM MA_ChatGroups g
        LEFT JOIN MA_ChatGroupMembers gm
          ON gm.GroupId = g.GroupId
         AND LOWER(gm.UserId) = LOWER(@UserId)
        WHERE g.GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)
      `);

    if (adminCheck.recordset.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }

    const group = adminCheck.recordset[0];
    const isCreator =
      (group.CreatedBy || "").toLowerCase() === currentUserId.toLowerCase();

    if (!isCreator && !group.IsAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only group admin can delete this group",
      });
    }

    await pool.request().input("GroupId", sql.NVarChar(50), groupId).query(`
        DELETE FROM MA_GroupChatMessages
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId);

        DELETE FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId);

        DELETE FROM MA_ChatGroups
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId);
      `);

    return res.json({ success: true, message: "Group deleted successfully" });
  } catch (err) {
    console.error("DELETE GROUP ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) await pool.close();
  }
});
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

    const { database: currentDb, userId, isAdmin } = decoded;

    const { groupId } = req.params;

    // Resolve which DB this group belongs to
    const databaseName = await getGroupDatabase(groupId, currentDb);
    pool = await openCommunicationPool();

    // ───────────────────────────────
    // SECURITY CHECK
    // ───────────────────────────────
    if (!isAdmin) {
      const access = await pool
        .request()
        .input("GroupId", sql.NVarChar(50), groupId)
        .input("UserId", sql.NVarChar(100), userId).query(`
          SELECT 1
          FROM MA_ChatGroupMembers
          WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)
            AND UserId = @UserId
        `);

      if (access.recordset.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
    }

    // ───────────────────────────────
    // LOAD MEMBERS WITH REAL NAMES
    // ───────────────────────────────
    const result = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId).query(`
        SELECT
            gm.MemberId,
             gm.UserId,
            gm.IsAdmin,
            gm.AddedDate,
            gm.DatabaseName,
          s.uti AS UserName
        FROM MA_ChatGroupMembers gm

        LEFT JOIN rh_secut s
ON CONVERT(VARCHAR(50), s.utunqid) = gm.UserId

        WHERE gm.GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)

        ORDER BY
            gm.IsAdmin DESC,
            s.utnm
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
      detail: err.originalError?.message,
      stack: err.stack,
    });
  } finally {
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
  }
});

router.post("/update-task-status", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database: currentDb, userId } = decoded;

    const { taskId, status, groupId, taskDatabase } = req.body;

    // taskDatabase = the DB where the task was inserted (assigned user's company DB).
    // groupId fallback resolves the group's DB.
    // Last fallback is the caller's own DB.
    let databaseName = currentDb;
    if (taskDatabase && taskDatabase.trim() !== "") {
      databaseName = taskDatabase.trim();
    } else if (groupId) {
      databaseName = await getGroupDatabase(groupId, currentDb);
    }

    pool = await openCommunicationPool();

    await pool
      .request()
      .input("TaskId", sql.NVarChar(50), taskId)
      .input("Status", sql.NVarChar(50), status).query(`
        UPDATE MA_ChatTasks
        SET Status = @Status
        WHERE TaskId = CONVERT(UNIQUEIDENTIFIER,@TaskId)
      `);

    return res.json({
      success: true,
      message: "Task status updated",
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
// ── POST /api/group/send-message ──────────────────────────────────────────────
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

    const {
      database: currentDb,
      userId,
      userName,
      userGuid,
      currentPropertyCode,
      propertyCode,
    } = decoded;

    const {
      groupId: rawGroupId,
      messageText,
      messageType = "TEXT",
      documentId = null,
    } = req.body;

    const groupId = rawGroupId ? rawGroupId.trim() : rawGroupId;
    const senderPropertyCode =
      currentPropertyCode || decoded.loginPropertyCode || propertyCode;

    // Resolve which DB this group belongs to
    const databaseName = await getGroupDatabase(groupId, currentDb);
    pool = await openCommunicationPool();

    // ─────────────────────────────────────────────
    // VERIFY MEMBERSHIP
    // ─────────────────────────────────────────────
    const memberCheck = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("UserId", sql.NVarChar(100), userId)
      .input("UserGuid", sql.NVarChar(50), userGuid || null).query(`
        SELECT TOP 1 1
        FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)
          AND (
              LOWER(UserId) = LOWER(@UserId)
              OR (
                  @UserGuid IS NOT NULL
                  AND LOWER(UserId) = LOWER(@UserGuid)
              )
          )
      `);

    if (memberCheck.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    // ─────────────────────────────────────────────
    // SAVE MESSAGE
    // ─────────────────────────────────────────────
    const chatId = crypto.randomUUID().toUpperCase();

    await pool
      .request()
      .input("ChatId", sql.NVarChar(50), chatId)
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("SenderUserId", sql.NVarChar(100), userId)
      .input("SenderName", sql.NVarChar(200), userName || userId)
      .input("MessageText", sql.NVarChar(sql.MAX), messageText || "")
      .input("MessageType", sql.NVarChar(50), messageType)
      .input("DocumentId", sql.NVarChar(50), documentId)
      .input("SenderPropertyCode", sql.NVarChar(50), senderPropertyCode)
      .input("TaskDatabase", sql.NVarChar(200), null).query(`
        INSERT INTO MA_GroupChatMessages
        (
          ChatId,
          GroupId,
          SenderUserId,
          SenderName,
          MessageText,
          MessageType,
          DocumentId,
          SenderPropertyCode,
          TaskDatabase,
          MessageTime
        )
        VALUES
        (
          CONVERT(UNIQUEIDENTIFIER, @ChatId),
          CONVERT(UNIQUEIDENTIFIER, @GroupId),
          @SenderUserId,
          @SenderName,
          @MessageText,
          @MessageType,
          CASE
            WHEN @DocumentId IS NULL
            THEN NULL
            ELSE CONVERT(UNIQUEIDENTIFIER, @DocumentId)
          END,
          @SenderPropertyCode,
          @TaskDatabase,
          GETDATE()
        )
      `);

    // ─────────────────────────────────────────────
    // UPDATE LAST MESSAGE TIME
    // ─────────────────────────────────────────────
    await pool.request().input("GroupId", sql.NVarChar(50), groupId).query(`
        UPDATE MA_ChatGroups
        SET LastMessageTime = GETDATE()
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)
      `);

    // ─────────────────────────────────────────────
    // GET GROUP NAME
    // ─────────────────────────────────────────────
    const groupInfo = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId).query(`
        SELECT GroupName
        FROM MA_ChatGroups
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)
      `);

    const groupName = groupInfo.recordset[0]?.GroupName || "Group Chat";

    // ─────────────────────────────────────────────
    // NOTIFY GROUP MEMBERS
    // ─────────────────────────────────────────────
    const members = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("SenderId", sql.NVarChar(100), userId).query(`
        SELECT UserId
        FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER, @GroupId)
          AND UserId <> @SenderId
      `);

    for (const member of members.recordset) {
      try {
        await sendPushNotification(
          pool,
          member.UserId,
          `${userName || userId} • ${groupName}`,
          messageText || "New group message",
          {
            type: "group_chat",
            groupId,
            groupName,
            senderId: userId,
          },
        );
      } catch (pushErr) {
        console.error(
          `GROUP PUSH ERROR FOR ${member.UserId}:`,
          pushErr.message,
        );
      }
    }

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
    // Don't close shared Communication pool - it's reusable
    // pool is only closed on application shutdown in communicationPool.js
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
      groupId,
      taskTitle,
      taskDescription,
      assignedTo,
      startDate,
      dueDate,
      priority,
      assignedToDatabase, // the DB where the assigned user belongs
    } = req.body;

    // The group's DB (for membership check and inserting the chat message)
    const groupDb = await getGroupDatabase(groupId, currentDb);

    // The task DB = assigned user's company DB if provided, otherwise group's DB
    const taskDb =
      assignedToDatabase && assignedToDatabase.trim() !== ""
        ? assignedToDatabase.trim()
        : groupDb;

    // Verify membership using the group's DB
    pool = await openPool(groupDb);
    const memberCheck = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("UserId", sql.NVarChar(100), userId).query(`
        SELECT TOP 1 1
        FROM MA_ChatGroupMembers
        WHERE GroupId = CONVERT(UNIQUEIDENTIFIER,@GroupId)
          AND UserId=@UserId
      `);

    if (memberCheck.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Close group pool before opening task pool (may be same or different DB)
    await pool.close();
    pool = null;

    const taskId = crypto.randomUUID().toUpperCase();

    // Open the task DB (assigned user's company DB)
    const taskPool = await openPool(taskDb);
    try {
      await taskPool
        .request()
        .input("TaskId", sql.NVarChar(50), taskId)
        .input("GroupId", sql.NVarChar(50), groupId)
        .input("TaskTitle", sql.NVarChar(200), taskTitle)
        .input("TaskDescription", sql.NVarChar(sql.MAX), taskDescription || "")
        .input("AssignedBy", sql.NVarChar(100), userId)
        .input("AssignedTo", sql.NVarChar(100), assignedTo)
        .input("StartDate", sql.DateTime, startDate || null)
        .input("DueDate", sql.DateTime, dueDate || null)
        .input("Priority", sql.NVarChar(20), priority || "Medium").query(`
          INSERT INTO MA_ChatTasks
          (
            TaskId,
            GroupId,
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
            CONVERT(UNIQUEIDENTIFIER,@TaskId),
            CONVERT(UNIQUEIDENTIFIER,@GroupId),
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
    } finally {
      await taskPool.close();
    }

    // Insert the task card message into the GROUP chat (group's DB)
    pool = await openPool(groupDb);
    await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("TaskId", sql.NVarChar(50), taskId)
      .input("SenderUserId", sql.NVarChar(100), userId)
      .input("SenderName", sql.NVarChar(200), userName || userId)
      .input("MessageText", sql.NVarChar(sql.MAX), taskTitle)
      .input("TaskDatabase", sql.NVarChar(200), taskDb).query(`
        INSERT INTO MA_GroupChatMessages
        (
          ChatId,
          GroupId,
          SenderUserId,
          SenderName,
          MessageText,
          MessageType,
          TaskId,
          TaskDatabase,
          MessageTime
        )
        VALUES
        (
          NEWID(),
          CONVERT(UNIQUEIDENTIFIER,@GroupId),
          @SenderUserId,
          @SenderName,
          @MessageText,
          'TASK',
          CONVERT(UNIQUEIDENTIFIER,@TaskId),
          @TaskDatabase,
          GETDATE()
        )
      `);

    res.json({
      success: true,
      taskId,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
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

    const { database: currentDb, userId } = decoded;
    const { groupId } = req.params;
    const escapedCurrentDb = currentDb
      ? currentDb.replace(/]/g, "]]")
      : currentDb;

    // Resolve which DB this group belongs to
    const databaseName = await getGroupDatabase(groupId, currentDb);

    // Open Communication DB because
    // MA_ChatGroupMembers and MA_GroupChatMessages are stored there
    pool = await openCommunicationPool();

    // Verify membership
    const memberCheck = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId)
      .input("UserId", sql.NVarChar(100), userId).query(`
      SELECT *
      FROM MA_ChatGroupMembers
      WHERE GroupId = CONVERT(UNIQUEIDENTIFIER,@GroupId)
      AND LOWER(UserId)=LOWER(@UserId)
`);

    console.log("Member Check:", memberCheck.recordset);

    if (memberCheck.recordset.length === 0) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const result = await pool
      .request()
      .input("GroupId", sql.NVarChar(50), groupId).query(`
  SELECT
    m.ChatId,
    m.GroupId,
    m.SenderUserId,
    m.SenderName,
    m.MessageText,
    m.MessageType,
    m.DocumentId,
    m.TaskId,
    m.TaskDatabase,
    m.MessageTime,

    d.DocumentNo,
    d.DocumentType,
    d.FileName,
    d.FilePath,

    t.Status AS TaskStatus,
    t.Priority,
    t.AssignedTo,
    t.TaskDescription,
    t.DueDate

FROM MA_GroupChatMessages m

LEFT JOIN MA_ChatDocuments d
ON d.DocumentId = m.DocumentId

LEFT JOIN MA_ChatTasks t
ON t.TaskId = m.TaskId

WHERE m.GroupId = CONVERT(uniqueidentifier,@GroupId)

ORDER BY m.MessageTime ASC
      `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,
      message: err.message,
      sql: err.originalError?.message,
    });
  } finally {
    if (pool) await pool.close();
  }
});
router.get("/tasks", async (req, res) => {
  let pool;

  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { database: currentDb, userGuid } = decoded;

    // Collect all DBs this user has access to
    let databases = [currentDb];

    if (userGuid) {
      let masterPool;
      try {
        masterPool = await new sql.ConnectionPool({
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          server: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || "1433"),
          database: "CMPY_AUTOSHOP",
          options: { encrypt: false, trustServerCertificate: true },
        }).connect();

        const accessResult = await masterPool
          .request()
          .input("userGuid", sql.UniqueIdentifier, userGuid).query(`
            SELECT CM.propertydb AS [database]
            FROM MA_UserDatabaseAccess UA
            INNER JOIN MA_ClientMaster CM ON UA.ClientId = CM.unqid
            WHERE UA.UserGuid = @userGuid
          `);

        if (accessResult.recordset.length > 0) {
          databases = [
            ...new Set(
              accessResult.recordset.map((r) => r.database).filter(Boolean),
            ),
          ];
        }
      } catch (e) {
        console.error("TASKS: failed to fetch accessible DBs:", e.message);
      } finally {
        if (masterPool) await masterPool.close();
      }
    }

    // Query MA_ChatTasks from every accessible DB and merge
    const allTasks = [];
    for (const dbName of databases) {
      let dbPool;
      try {
        dbPool = await openPool(dbName);
        const result = await dbPool.request().query(`
          SELECT
            t.TaskId,
            t.GroupId,
            t.TaskTitle,
            t.TaskDescription,
            t.AssignedBy,
            t.AssignedTo,
            ISNULL(s.uti, t.AssignedTo) AS AssignedToName,
            t.Priority,
            t.Status,
            t.StartDate,
            t.DueDate,
            t.CreatedDate,
            '${dbName.replace(/'/g, "''")}' AS TaskDatabase
          FROM MA_ChatTasks t
          LEFT JOIN rh_secut s
            ON CONVERT(VARCHAR(50), s.utunqid) = t.AssignedTo
          ORDER BY t.CreatedDate DESC
        `);
        allTasks.push(...result.recordset);
      } catch (dbErr) {
        console.error(`TASKS: failed to query ${dbName}:`, dbErr.message);
      } finally {
        if (dbPool) await dbPool.close();
      }
    }

    // Sort merged results by CreatedDate desc
    allTasks.sort((a, b) => new Date(b.CreatedDate) - new Date(a.CreatedDate));

    return res.json({
      success: true,
      data: allTasks,
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
module.exports = router;
