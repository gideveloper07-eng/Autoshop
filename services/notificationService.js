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

    // Data-only payload — no notification block so FCM does NOT auto-show a
    // system notification. Flutter's onMessage / background handler shows
    // exactly ONE local notification, preventing duplicates.
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
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
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { contentAvailable: true } },
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
