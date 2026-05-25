const admin = require("../firebase");

const sql = require("mssql");

async function sendPushNotification(
  pool,

  userId,

  title,

  body,
) {
  try {
    console.log("PUSH FUNCTION CALLED");

    console.log("TARGET USER:", userId);

    // GET TOKENS

    const tokenResult = await pool
      .request()

      .input("user_id", sql.NVarChar, userId).query(`
        SELECT fcm_token
        FROM app_user_devices
        WHERE user_id = @user_id
      `);

    console.log("TOKEN RESULT:", tokenResult.recordset);

    const tokens = tokenResult.recordset

      .map((x) => x.fcm_token)

      .filter(Boolean);

    console.log("TOKENS:", tokens);

    if (tokens.length === 0) {
      console.log("NO TOKENS FOUND");

      return;
    }

    // SEND PUSH

    const response = await admin.messaging().sendEachForMulticast({
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

    console.log("PUSH RESPONSE:");

    console.log(response);
  } catch (err) {
    console.error("PUSH ERROR:");

    console.error(err);
  }
}
async function sendPushToGroup(
  pool,

  utg,

  title,

  body,
) {
  try {
    // GET USERS OF GROUP

    const userResult = await pool
      .request()

      .input("utg", sql.NVarChar, utg).query(`
        SELECT uti
        FROM mst_user
        WHERE utg = @utg
      `);

    const users = userResult.recordset;

    for (const user of users) {
      await sendPushNotification(
        pool,

        user.uti,

        title,

        body,
      );
    }
  } catch (err) {
    console.error("GROUP PUSH ERROR:", err.message);
  }
}
module.exports = {
  sendPushNotification,

  sendPushToGroup,
};
