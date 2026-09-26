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
    const userGroupId = (req.user.utg || "").trim();
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
    // USER GROUP CHECK
    // ============================================================

    if (!isAdmin && !userGroupId) {
      return res.status(403).json({
        success: false,
        message: "User group not found",
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

    if (
      isAdmin ||
      userGroupId.toUpperCase() === "4848C835-2A09-4A80-A7E2-383C95926C54"
    ) {
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

      console.log("ADMIN ALLOWED SCREENS:", result.recordset);

      return res.json({
        success: true,
        isAdmin: true,
        screens: result.recordset,
      });
    }

    // ============================================================
    // NORMAL USER
    //
    // AppScreens.unqid
    //        =
    // AppScreenPermissions.ScreenID
    //
    // GroupIDs contains comma-separated Group GUIDs
    //
    // STRING_SPLIT is intentionally NOT used because the
    // target SQL Server/database does not support it.
    // ============================================================

    const result = await pool
      .request()
      .input("GroupID", sql.NVarChar(100), userGroupId).query(`
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

          AND CHARINDEX(
            ',' + LOWER(LTRIM(RTRIM(@GroupID))) + ',',
            ',' + LOWER(REPLACE(ISNULL(P.GroupIDs, ''), ' ', '')) + ','
          ) > 0

        ORDER BY S.ScreenName
      `);

    // ============================================================
    // LOG RESULT
    // ============================================================

    console.log("ALLOWED SCREENS:", result.recordset);

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
