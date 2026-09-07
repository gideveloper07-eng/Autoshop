const admin = require("../firebase");
const { sql } = require("../config/db");
const openPool = require("../utils/dynamicPoolManager");

// ============================================================
// SEND RECEIPT CHANGE REQUEST NOTIFICATION TO ADMIN
// ============================================================
async function sendReceiptChangeNotification({
  databaseName,
  requestId,
  receiptNo,
  requestType,
}) {
  let pool;

  try {
    if (!databaseName) {
      throw new Error("databaseName is required");
    }

    if (!requestId) {
      throw new Error("requestId is required");
    }

    pool = await openPool(databaseName);

    // ----------------------------------------------------------
    // 1. Prevent duplicate notification
    // ----------------------------------------------------------
    const duplicateCheck = await pool
      .request()
      .input("userId", sql.NVarChar, "adm")
      .input("referenceId", sql.NVarChar, String(requestId))
      .input("type", sql.NVarChar, "RECEIPT_CHANGE_REQUEST").query(`
        SELECT TOP 1 id
        FROM app_notifications
        WHERE user_id = @userId
          AND reference_id = @referenceId
          AND type = @type
      `);

    if (duplicateCheck.recordset.length > 0) {
      console.log("Receipt change notification already exists:", requestId);

      return {
        success: true,
        duplicate: true,
      };
    }

    // ----------------------------------------------------------
    // 2. Create notification text
    // ----------------------------------------------------------
    const title = "New Receipt Change Request";

    const message =
      `Receipt No ${receiptNo || ""} - ` +
      `${requestType || ""} change requested`;

    // ----------------------------------------------------------
    // 3. Insert notification into app_notifications
    // ----------------------------------------------------------
    await pool
      .request()
      .input("userId", sql.NVarChar, "adm")
      .input("title", sql.NVarChar, title)
      .input("message", sql.NVarChar, message)
      .input("type", sql.NVarChar, "RECEIPT_CHANGE_REQUEST")
      .input("referenceId", sql.NVarChar, String(requestId)).query(`
        INSERT INTO app_notifications
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
          @userId,
          @title,
          @message,
          @type,
          @referenceId,
          0,
          GETDATE()
        )
      `);

    // ----------------------------------------------------------
    // 4. Get admin FCM token
    // ----------------------------------------------------------
    const tokenResult = await pool
      .request()
      .input("userId", sql.NVarChar, "adm").query(`
        SELECT DISTINCT fcm_token
        FROM app_user_devices
        WHERE user_id = @userId
          AND fcm_token IS NOT NULL
          AND LTRIM(RTRIM(fcm_token)) <> ''
      `);

    const tokens = tokenResult.recordset
      .map((row) => String(row.fcm_token).trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      console.log("Receipt request saved, but no FCM token found for adm.");

      return {
        success: true,
        notificationSaved: true,
        pushSent: false,
        reason: "NO_ADMIN_FCM_TOKEN",
      };
    }

    // ----------------------------------------------------------
    // 5. Send Firebase push notification
    // ----------------------------------------------------------
    const response = await admin.messaging().sendEachForMulticast({
      tokens,

      notification: {
        title,
        body: message,
      },

      data: {
        type: "receipt_change_request",
        requestId: String(requestId),
        receiptNo: String(receiptNo || ""),
        requestType: String(requestType || ""),
      },

      android: {
        priority: "high",
        notification: {
          channelId: "default",
          sound: "default",
        },
      },

      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });

    console.log(
      "Receipt change FCM result:",
      response.successCount,
      "success,",
      response.failureCount,
      "failed",
    );

    // ----------------------------------------------------------
    // 6. Remove invalid Firebase tokens
    // ----------------------------------------------------------
    if (response.responses) {
      for (let i = 0; i < response.responses.length; i++) {
        const result = response.responses[i];

        if (!result.success && result.error) {
          const errorCode = result.error.code;

          if (
            errorCode === "messaging/registration-token-not-registered" ||
            errorCode === "messaging/invalid-registration-token"
          ) {
            await pool
              .request()
              .input("token", sql.NVarChar(sql.MAX), tokens[i]).query(`
                DELETE FROM app_user_devices
                WHERE fcm_token = @token
              `);

            console.log("Removed invalid FCM token.");
          }
        }
      }
    }

    return {
      success: true,
      notificationSaved: true,
      pushSent: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (err) {
    console.error("RECEIPT CHANGE NOTIFICATION ERROR:", err);

    throw err;
  } finally {
    if (pool) await pool.close();
  }
}

module.exports = {
  sendReceiptChangeNotification,
};
