const sql = require("mssql");
const admin = require("../firebase");
const openCommunicationPool = require("../utils/communicationPool");

async function sendChatNotification({
  receiverUserId,
  receiverPropertyCode,
  senderId,
  senderName,
  message,
}) {
  try {
    const pool = await openCommunicationPool();

    const result = await pool
      .request()
      .input("receiverUserId", sql.NVarChar(100), receiverUserId)
      .input("receiverPropertyCode", sql.NVarChar(50), receiverPropertyCode)
      .query(`
        SELECT DeviceToken
        FROM MA_UserDevices
        WHERE
            UserId=@receiverUserId
            AND PropertyCode=@receiverPropertyCode
            AND IsActive=1
      `);

    if (result.recordset.length === 0) {
      console.log("No device token found.");
      return;
    }

    const tokens = result.recordset.map((x) => x.DeviceToken);

    console.log("Sending notification to", tokens.length, "device(s)");

    // Data + notification payload — notification block lets FCM auto-show
    // a system tray notification when the app is in background/killed.
    // The data block lets the app navigate to the correct screen.
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: senderName,
        body: message,
      },
      data: {
        type: "DIRECT_CHAT",
        title: senderName,
        body: message,
        senderId: String(senderId ?? ""),
        receiverId: String(receiverUserId ?? ""),
        propertyCode: String(receiverPropertyCode ?? ""),
      },
      android: {
        priority: "high",
        ttl: 86400000,
        notification: {
          sound: "default",
          channelId: "challan_notifications",
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: {
          aps: {
            alert: { title: senderName, body: message },
            sound: "default",
            badge: 1,
            contentAvailable: true,
          },
        },
      },
    });

    console.log("Success:", response.successCount);
    console.log("Failed :", response.failureCount);

    // Remove invalid tokens
    for (let i = 0; i < response.responses.length; i++) {
      const r = response.responses[i];

      if (!r.success) {
        const code = r.error.code;

        console.log("FCM Error:", code);

        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          await pool.request().input("token", sql.NVarChar(sql.MAX), tokens[i])
            .query(`
                DELETE
                FROM MA_UserDevices
                WHERE DeviceToken=@token
            `);

          console.log("Invalid token removed.");
        }
      }
    }
  } catch (err) {
    console.error("SEND PUSH ERROR");
    console.error(err);
  }
}

module.exports = {
  sendChatNotification,
};
