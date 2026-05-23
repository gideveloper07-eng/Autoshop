const admin = require("../firebase");

const sql = require("mssql");

async function sendPushNotification(
  pool,

  userId,

  title,

  body,
) {
  try {
    // GET USER TOKENS

    const tokenResult = await pool
      .request()

      .input("user_id", sql.NVarChar, userId).query(`
        SELECT fcm_token
        FROM app_user_devices
        WHERE user_id = @user_id
      `);

    const tokens = tokenResult.recordset
      .map((x) => x.fcm_token)
      .filter(Boolean);

    if (tokens.length === 0) {
      console.log("NO FCM TOKENS FOUND");

      return;
    }

    console.log("SENDING PUSH TO:", tokens.length);

    // SEND PUSH

    await admin.messaging().sendEachForMulticast({
      tokens,

      notification: {
        title,
        body,
      },

      android: {
        priority: "high",

        notification: {
          sound: "default",
        },
      },
    });

    console.log("✅ PUSH SENT");
  } catch (err) {
    console.error("PUSH ERROR:", err.message);
  }
}

module.exports = {
  sendPushNotification,
};
