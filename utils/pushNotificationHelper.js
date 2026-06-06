const admin = require("../firebase");
const sql = require("mssql");

/**
 * Send push notification to a single user
 */
async function sendPushNotification(pool, userId, title, body, data = {}) {
  try {
    console.log("PUSH FUNCTION CALLED — USER:", userId);

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

    console.log("TOKENS:", tokens);

    if (tokens.length === 0) {
      console.log("NO TOKENS FOUND FOR:", userId);
      return;
    }

    // FCM requires string values
    const stringData = {
      title,
      body,
    };

    for (const [key, value] of Object.entries(data)) {
      stringData[key] = String(value ?? "");
    }

    // SEND DATA-ONLY — no notification block so FCM does NOT auto-show a
    // system notification. Flutter's background handler shows exactly ONE
    // local notification, preventing duplicates.
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      data: stringData,
      android: {
        priority: "high",
        ttl: "86400s",
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            contentAvailable: true,
          },
        },
      },
    });

    console.log(
      `PUSH SENT: ${response.successCount} ok, ${response.failureCount} failed`,
    );

    // REMOVE INVALID TOKENS
    for (let i = 0; i < response.responses.length; i++) {
      const resp = response.responses[i];

      if (
        !resp.success &&
        (resp.error?.code === "messaging/registration-token-not-registered" ||
          resp.error?.code === "messaging/invalid-registration-token")
      ) {
        const badToken = tokens[i];

        console.log("REMOVING INVALID TOKEN:", badToken?.substring(0, 20));

        try {
          await pool
            .request()
            .input("fcm_token", sql.NVarChar(sql.MAX), badToken).query(`
              DELETE FROM app_user_devices
              WHERE fcm_token = @fcm_token
            `);

          console.log("TOKEN REMOVED");
        } catch (delErr) {
          console.error("TOKEN CLEANUP ERROR:", delErr.message);
        }
      }
    }
  } catch (err) {
    console.error("PUSH ERROR:", err.message);
  }
}

async function sendPushToGroup(pool, utg, title, body) {
  try {
    const userResult = await pool.request().input("utg", sql.NVarChar, utg)
      .query(`
        SELECT uti
        FROM rh_secut
        WHERE utg = @utg
      `);

    const users = userResult.recordset;

    for (const user of users) {
      await sendPushNotification(pool, user.uti, title, body);
    }
  } catch (err) {
    console.error("GROUP PUSH ERROR:", err.message);
  }
}

module.exports = {
  sendPushNotification,
  sendPushToGroup,
};
