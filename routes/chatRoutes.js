const express = require("express");
const router = express.Router();
const sql = require("mssql");

const { decodeToken } = require("../middleware/authMiddleware");

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

    const { database: databaseName, userId } = decoded;

    const { challanId, messageText, senderName } = req.body;

    pool = await openPool(databaseName);

    await pool
      .request()
      .input("challanId", sql.VarChar, challanId)
      .input("userId", sql.VarChar, userId)
      .input("senderName", sql.VarChar, senderName)
      .input("messageText", sql.VarChar(sql.MAX), messageText).query(`
        INSERT INTO MA_ChallanChat
        (
            ChatId,
            ChallanId,
            SenderUserId,
            SenderName,
            MessageText,
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
            GETDATE(),
            0
        )
      `);

    return res.json({
      success: true,
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

    const { database: databaseName } = decoded;

    pool = await openPool(databaseName);

    const result = await pool
      .request()
      .input("challanId", sql.VarChar, req.params.challanId).query(`
        SELECT
            ChatId,
            SenderUserId,
            SenderName,
            MessageText,
            MessageTime
        FROM MA_ChallanChat
        WHERE ChallanId = @challanId
        ORDER BY MessageTime
      `);

    return res.json({
      success: true,
      data: result.recordset,
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
