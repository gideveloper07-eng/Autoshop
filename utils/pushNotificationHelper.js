const admin = require("../firebase");
const sql = require("mssql");
const openCommunicationPool = require("./communicationPool");

/**
 * Send a push notification to a specific user.
 *
 * Tokens are stored in MA_UserDevices inside the AUTOSHOP_COMMUNICATION DB
 * (the same table used by the chat push system).
 *
 * @param {object} pool       - Company DB pool (kept for compatibility, not used for token lookup)
 * @param {string} userId     - The user ID to notify
 * @param {string} title      - Notification title
 * @param {string} body       - Notification body
 * @param {object} extraData  - Additional key-value data sent in the notification payload
 */
async function sendPushNotification(pool, userId, title, body, extraData = {}) {
  try {
    console.log("🔔 PUSH NOTIFICATION — USER:", userId, "TITLE:", title);

    // ── 1. Look up FCM tokens from the communication DB ─────────────────────
    const commPool = await openCommunicationPool();

    const tokenResult = await commPool
      .request()
      .input("userId", sql.NVarChar(100), userId)
      .query(`
        SELECT DeviceToken
        FROM MA_UserDevices
        WHERE UserId = @userId
          AND IsActive = 1
          AND DeviceToken IS NOT NULL
          AND DeviceToken != ''
      `);

    const tokens = tokenResult.recordset
      .map((x) => x.DeviceToken)
      .filter(Boolean);

    console.log(`📱 TOKENS FOUND FOR ${userId}:`, tokens.length);

    if (tokens.length === 0) {
      console.log("⚠️  NO ACTIVE TOKENS FOR:", userId);
      return;
    }

    // ── 2. Build the FCM payload ─────────────────────────────────────────────
    // All values in the `data` block must be strings (FCM requirement).
    const dataPayload = {
      title: String(title ?? ""),
      body: String(body ?? ""),
      type: String(extraData.type ?? "CHALLAN_STATUS"),
    };

    for (const [key, value] of Object.entries(extraData)) {
      dataPayload[key] = String(value ?? "");
    }

    // ── 3. Send via FCM ──────────────────────────────────────────────────────
    // We send BOTH a `notification` block AND a `data` block so that:
    //   • System tray notification appears when the app is in background/closed
    //     (handled automatically by FCM using the `notification` block).
    //   • The app can read the `data` block in foreground / onMessageOpenedApp
    //     to navigate to the correct screen.
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: title,
        body: body,
      },
      data: dataPayload,
      android: {
        priority: "high",
        ttl: 86400000, // 24 h in ms
        notification: {
          sound: "default",
          channelId: "challan_notifications",
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
            badge: 1,
            contentAvailable: true,
          },
        },
      },
    });

    console.log(
      `✅ PUSH SENT: ${response.successCount} ok / ${response.failureCount} failed`,
    );

    // ── 4. Clean up stale / invalid tokens ──────────────────────────────────
    for (let i = 0; i < response.responses.length; i++) {
      const resp = response.responses[i];

      if (!resp.success) {
        const code = resp.error?.code ?? "";
        console.error(`❌ PUSH FAILED [${i}]:`, code, resp.error?.message);

        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          const badToken = tokens[i];
          console.log(
            "🗑️  Removing invalid token:",
            badToken?.substring(0, 30) + "...",
          );

          try {
            await commPool
              .request()
              .input("token", sql.NVarChar(sql.MAX), badToken)
              .query(`
                UPDATE MA_UserDevices
                SET IsActive = 0, LastUpdated = GETDATE()
                WHERE DeviceToken = @token
              `);
          } catch (cleanErr) {
            console.error("TOKEN CLEANUP ERROR:", cleanErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error("❌ PUSH NOTIFICATION ERROR:", err.message);
  }
}

/**
 * Send a push notification to every user in a user-type group.
 */
async function sendPushToGroup(pool, utg, title, body) {
  try {
    const userResult = await pool
      .request()
      .input("utg", sql.NVarChar, utg)
      .query(`
        SELECT uti
        FROM rh_secut
        WHERE utg = @utg
      `);

    for (const user of userResult.recordset) {
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
