const express = require("express");
const router = express.Router();

const { sql } = require("../config/db");
const openPool = require("../utils/dynamicPoolManager");
const { verifyToken } = require("../middleware/authMiddleware");

const ADMIN_GROUP_ID = "4848C835-2A09-4A80-A7E2-383C95926C54";

router.get("/", verifyToken, async (req, res) => {
  try {
    const userGroupId = String(req.user.utg || "")
      .trim()
      .toUpperCase();
    const databaseName = req.user.currentDatabase;

    const jwtAdmin =
      req.user.isAdmin === true ||
      String(req.user.isAdmin).toLowerCase() === "true";

    const groupAdmin = userGroupId === ADMIN_GROUP_ID;

    const effectiveAdmin = jwtAdmin || groupAdmin;

    console.log("");
    console.log("==============================================");
    console.log("APP PERMISSION REQUEST");
    console.log("==============================================");
    console.log("User ID        :", req.user.userId);
    console.log("User Name      :", req.user.userName);
    console.log("UTG            :", `[${userGroupId}]`);
    console.log("Database       :", `[${databaseName}]`);
    console.log("JWT isAdmin    :", jwtAdmin);
    console.log("Group isAdmin  :", groupAdmin);
    console.log("EffectiveAdmin :", effectiveAdmin);
    console.log("==============================================");

    if (!databaseName) {
      return res.status(400).json({
        success: false,
        message: "Current database not found",
      });
    }

    if (!effectiveAdmin && !userGroupId) {
      return res.status(403).json({
        success: false,
        message: "User group not found",
      });
    }

    const pool = await openPool(databaseName);

    // ============================================================
    // ADMIN / ADMIN GROUP
    // ============================================================

    if (effectiveAdmin) {
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

      console.log("ADMIN SCREEN COUNT :", result.recordset.length);

      console.log(
        "ADMIN SCREEN KEYS   :",
        result.recordset.map((x) => x.ScreenKey),
      );

      return res.json({
        success: true,
        isAdmin: true,

        // Very useful for debugging
        userId: req.user.userId,
        groupId: userGroupId,
        databaseName,
        adminSource: jwtAdmin ? "jwt" : groupAdmin ? "group" : "unknown",

        screens: result.recordset,
      });
    }

    // ============================================================
    // NORMAL USER
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
                ',' + LOWER(
                    REPLACE(ISNULL(P.GroupIDs, ''), ' ', '')
                ) + ','
            ) > 0

        ORDER BY S.ScreenName
      `);

    console.log("NORMAL SCREEN COUNT :", result.recordset.length);

    console.log(
      "NORMAL SCREEN KEYS   :",
      result.recordset.map((x) => x.ScreenKey),
    );

    return res.json({
      success: true,
      isAdmin: false,

      userId: req.user.userId,
      groupId: userGroupId,
      databaseName,

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
