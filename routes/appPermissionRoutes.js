const express = require("express");
const router = express.Router();

const { sql } = require("../config/db");
const openPool = require("../utils/dynamicPoolManager");
const { verifyToken } = require("../middleware/authMiddleware");

// ============================================================
// GET USER APP PERMISSIONS
// GET /api/app-permissions
// ============================================================

router.get("/", verifyToken, async (req, res) => {
  try {
    const userGroupId = req.user.utg;
    const databaseName = req.user.currentDatabase;
    const isAdmin = req.user.isAdmin === true;

    console.log("====================================");
    console.log("APP PERMISSION REQUEST");
    console.log("User       :", req.user.userId);
    console.log("Group      :", userGroupId);
    console.log("Database   :", databaseName);
    console.log("Is Admin   :", isAdmin);
    console.log("====================================");

    // ============================================================
    // DATABASE CHECK
    // ============================================================

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Current database not found",
      });
    }

    // ============================================================
    // OPEN DATABASE POOL
    // ============================================================

    const pool = await openPool(databaseName);

    // ============================================================
    // ADMIN
    // Admin gets all active screens
    // ============================================================

    if (isAdmin) {
      const result = await pool.request().query(`
        SELECT
          S.unqid,
          S.ScreenName,
          S.ScreenKey,
          S.IsActive
        FROM AppScreens S
        WHERE S.IsActive = 1
        ORDER BY S.ScreenName
      `);

      return res.json({
        success: true,
        isAdmin: true,
        screens: result.recordset,
      });
    }

    // ============================================================
    // NORMAL USER
    // ============================================================

    if (!userGroupId) {
      return res.status(403).json({
        success: false,
        message: "User group not found",
      });
    }

    // ============================================================
    // GET PERMITTED SCREENS
    //
    // AppScreens.unqid
    //        =
    // AppScreenPermissions.ScreenID
    //
    // GroupIDs contains comma-separated Group GUIDs
    // ============================================================

    const result = await pool
      .request()
      .input("GroupID", sql.UniqueIdentifier, userGroupId).query(`
        SELECT DISTINCT
          S.unqid,
          S.ScreenName,
          S.ScreenKey,
          S.IsActive
        FROM AppScreens S

        INNER JOIN AppScreenPermissions P
          ON P.ScreenID = S.unqid

        WHERE
          S.IsActive = 1
          AND EXISTS
          (
            SELECT 1
            FROM STRING_SPLIT(
              ISNULL(P.GroupIDs, ''),
              ','
            ) G

            WHERE TRY_CONVERT(
              UNIQUEIDENTIFIER,
              LTRIM(RTRIM(G.value))
            ) = @GroupID
          )

        ORDER BY S.ScreenName
      `);

    // ============================================================
    // RESPONSE
    // ============================================================

    return res.json({
      success: true,
      isAdmin: false,
      groupId: userGroupId,
      screens: result.recordset,
    });
  } catch (err) {
    console.error("APP PERMISSION ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to load app permissions",
      error: err.message,
    });
  }
});

module.exports = router;
