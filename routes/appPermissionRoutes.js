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

    console.log("====================================");
    console.log("APP PERMISSION REQUEST");
    console.log("User       :", req.user.userId);
    console.log("Group      :", userGroupId);
    console.log("Database   :", databaseName);
    console.log("Is Admin   :", req.user.isAdmin);
    console.log("====================================");

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Current database not found",
      });
    }

    // =====================================================
    // ADMIN
    // =====================================================

    if (req.user.isAdmin) {
      const pool = await openPool(databaseName);

      const result = await pool.request().query(`
                    SELECT
                        unqid,
                        ScreenName,
                        ScreenKey
                    FROM AppScreens
                    WHERE IsActive = 1
                    ORDER BY
                        ISNULL(DisplayOrder, 9999),
                        ScreenName
                `);

      return res.json({
        success: true,
        isAdmin: true,
        screens: result.recordset,
      });
    }

    // =====================================================
    // NORMAL USER
    // =====================================================

    if (!userGroupId) {
      return res.status(403).json({
        success: false,
        message: "User group not found",
      });
    }

    const pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("GroupID", sql.UniqueIdentifier, userGroupId).query(`
                SELECT
                    S.unqid,
                    S.ScreenName,
                    S.ScreenKey
                FROM AppScreens S
                INNER JOIN AppScreenPermissions P
                    ON P.ScreenID = S.unqid
                WHERE S.IsActive = 1
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
                ORDER BY
                    ISNULL(S.DisplayOrder, 9999),
                    S.ScreenName
            `);

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
