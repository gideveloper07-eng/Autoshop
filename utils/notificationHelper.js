const { sql } = require("../config/db");

const createNotification = async (
  pool,
  userId,
  title,
  message,
  type = "",
  referenceId = "",
) => {
  await pool
    .request()
    .input("user_id", sql.NVarChar, userId)
    .input("title", sql.NVarChar, title)
    .input("message", sql.NVarChar, message)
    .input("type", sql.NVarChar, type)
    .input("reference_id", sql.NVarChar, referenceId).query(`
      INSERT INTO dbo.app_notifications
      (
        id,
        user_id,
        title,
        message,
        type,
        reference_id,
        is_read,
        created_on
      )
      VALUES
      (
        NEWID(),
        @user_id,
        @title,
        @message,
        @type,
        @reference_id,
        0,
        GETDATE()
      );
    `);
};

module.exports = { createNotification };
