const admin = require("../firebase");

const sql = require("mssql");

/**
 * Send a push notification to a single user.
 * @param {object} pool   - MSSQL connection pool
 * @param {string} userId - Recipient user ID
 * @param {string} title  - Notification title
 * @param {string} body   - Notification body text
 * @param {object} data   - Optional key/value data payload (e.g. { type, challanId })
 *                          All values must be strings.
 */
async function sendPushNotification(pool, userId, title, body, data = {}) {
  try {
    console.log("PUSH FUNCTION CALLED — USER:", userId);

    // GET FCM TOKENS FOR THIS USER
    const tokenResult = await pool
      .request()
      .input("user_id", sql.NVarChar, userId).query(`
        SELECT fcm_token
        FROM app_user_devices
        WHERE user_id = @user_id
      `);

    const tokens = tokenResult.recordset.map((x) => x.fcm_token).filter(Boolean);

    console.log("TOKENS:", tokens);

    if (tokens.length === 0) {
      console.log("NO TOKENS FOUND FOR:", userId);
      return;
    }

    // Ensure all data values are strings (FCM requirement)
    const stringData = {};
    for (const [k, v] of Object.entries(data)) {
      stringData[k] = String(v ?? "");
    }

    // SEND PUSH NOTIFICATION
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: stringData,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "chat_messages",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    });

    console.log(
      `PUSH SENT: ${response.successCount} ok, ${response.failureCount} failed`,
    );

    // Clean up invalid tokens
    response.responses.forEach(async (resp, idx) => {
      if (
        !resp.success &&
        (resp.error?.code === "messaging/registration-token-not-registered" ||
          resp.error?.code === "messaging/invalid-registration-token")
      ) {
        const badToken = tokens[idx];
        console.log("REMOVING INVALID TOKEN:", badToken?.substring(0, 20));
        try {
          await pool
            .request()
            .input("fcm_token", sql.NVarChar(sql.MAX), badToken)
            .query(`DELETE FROM app_user_devices WHERE fcm_token = @fcm_token`);
        } catch (delErr) {
          console.error("TOKEN CLEANUP ERROR:", delErr.message);
        }
      }
    });
  } catch (err) {
    console.error("PUSH ERROR:", err.message);
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
        FROM rh_secut
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
