const admin = require("../firebase");
const sql = require("mssql");
const openCommunicationPool = require("./communicationPool");
const { sql: companySql } = require("../config/db");
const openCompanyPool = require("../utils/dynamicPoolManager");

// ============================================================
// SEND RECEIPT CHANGE REQUEST NOTIFICATION TO ADMIN
// ============================================================
async function sendReceiptChangeNotification({
  databaseName,
  requestId,
  receiptNo,
  requestType,
}) {
  let companyPool;
  let communicationPool;

  try {
    console.log("==========================================");
    console.log("RECEIPT CHANGE PUSH START");
    console.log("DATABASE:", databaseName);
    console.log("REQUEST ID:", requestId);
    console.log("RECEIPT NO:", receiptNo);
    console.log("REQUEST TYPE:", requestType);
    console.log("==========================================");

    if (!databaseName) {
      throw new Error("databaseName is required");
    }

    if (!requestId) {
      throw new Error("requestId is required");
    }

    // ==========================================================
    // 1. OPEN COMPANY DATABASE
    // ==========================================================
    companyPool = await openCompanyPool(databaseName);

    // ==========================================================
    // 2. CHECK DUPLICATE NOTIFICATION
    // ==========================================================
    const duplicateCheck = await companyPool
      .request()
      .input("userId", companySql.NVarChar, "adm")
      .input("referenceId", companySql.NVarChar, String(requestId))
      .input("type", companySql.NVarChar, "RECEIPT_CHANGE_REQUEST").query(`
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

    // ==========================================================
    // 3. CREATE NOTIFICATION TEXT
    // ==========================================================
    const title = "New Receipt Change Request";

    const message =
      `Receipt No ${receiptNo || ""} - ` +
      `${requestType || ""} change requested`;

    // ==========================================================
    // 4. SAVE NOTIFICATION IN COMPANY DATABASE
    // ==========================================================
    await companyPool
      .request()
      .input("userId", companySql.NVarChar, "adm")
      .input("title", companySql.NVarChar, title)
      .input("message", companySql.NVarChar, message)
      .input("type", companySql.NVarChar, "RECEIPT_CHANGE_REQUEST")
      .input("referenceId", companySql.NVarChar, String(requestId)).query(`
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

    console.log("APP NOTIFICATION SAVED SUCCESSFULLY");

    // ==========================================================
    // 5. OPEN COMMUNICATION DATABASE
    // ==========================================================
    communicationPool = await openCommunicationPool();

    // Some pool managers return an existing pool that may have been
    // closed by a previous request. Reconnect it before using it.
    if (communicationPool && !communicationPool.connected) {
      await communicationPool.connect();
    }

    // ==========================================================
    // 6. GET ADMIN FCM TOKEN
    //
    // IMPORTANT:
    // Flutter save-fcm-token stores tokens here:
    // AUTOSHOP_COMMUNICATION -> MA_UserDevices
    // ==========================================================
    const tokenResult = await communicationPool
      .request()
      .input("userId", sql.NVarChar(100), "adm").query(`
        SELECT
          DeviceToken,
          PropertyCode,
          DatabaseName,
          Platform,
          DeviceModel
        FROM MA_UserDevices
        WHERE UserId = @userId
          AND IsActive = 1
          AND DeviceToken IS NOT NULL
          AND LTRIM(RTRIM(DeviceToken)) <> ''
      `);

    const tokens = tokenResult.recordset
      .map((row) => String(row.DeviceToken).trim())
      .filter(Boolean);

    // ==========================================================
    // DEBUG
    // ==========================================================
    console.log("==========================================");
    console.log("FCM TOKEN DEBUG");
    console.log("ADMIN USER:", "adm");
    console.log("TOKENS FOUND:", tokens.length);

    tokenResult.recordset.forEach((row, index) => {
      console.log(
        `TOKEN ${index + 1}:`,
        String(row.DeviceToken).substring(0, 30) + "...",
      );
      console.log(`PROPERTY ${index + 1}:`, row.PropertyCode);
      console.log(`DATABASE ${index + 1}:`, row.DatabaseName);
    });

    console.log("==========================================");

    // ==========================================================
    // 7. NO TOKEN
    // ==========================================================
    if (tokens.length === 0) {
      console.log(
        "Receipt request saved, but NO ACTIVE FCM TOKEN found for adm.",
      );

      return {
        success: true,
        notificationSaved: true,
        pushSent: false,
        reason: "NO_ADMIN_FCM_TOKEN",
      };
    }

    // ==========================================================
    // 8. CREATE FCM DATA
    // ==========================================================
    const dataPayload = {
      type: "receipt_change_request",
      requestId: String(requestId),
      receiptNo: String(receiptNo || ""),
      requestType: String(requestType || ""),
    };

    // ==========================================================
    // 9. SEND PUSH NOTIFICATION
    // ==========================================================
    console.log("SENDING FCM PUSH...");

    const response = await admin.messaging().sendEachForMulticast({
      tokens,

      // ------------------------------------------------------
      // VERY IMPORTANT
      // This makes Android display the notification when the
      // Flutter app is backgrounded or terminated.
      // ------------------------------------------------------
      notification: {
        title: title,
        body: message,
      },

      // ------------------------------------------------------
      // Flutter uses this data when notification is opened.
      // ------------------------------------------------------
      data: dataPayload,

      // ------------------------------------------------------
      // ANDROID
      // ------------------------------------------------------
      android: {
        priority: "high",

        notification: {
          channelId: "receipt_change_requests",
          sound: "default",
          defaultSound: true,
        },
      },

      // ------------------------------------------------------
      // IOS
      // ------------------------------------------------------
      apns: {
        headers: {
          "apns-priority": "10",
        },

        payload: {
          aps: {
            alert: {
              title: title,
              body: message,
            },
            sound: "default",
            badge: 1,
          },
        },
      },
    });

    // ==========================================================
    // 10. RESULT
    // ==========================================================
    console.log("==========================================");
    console.log("FCM SEND RESULT");
    console.log("SUCCESS:", response.successCount);
    console.log("FAILED:", response.failureCount);
    console.log("==========================================");

    // ==========================================================
    // 11. REMOVE INVALID TOKENS
    // ==========================================================
    for (let i = 0; i < response.responses.length; i++) {
      const result = response.responses[i];

      if (!result.success) {
        const errorCode = result.error?.code || "";

        console.error(`FCM FAILED [${i}]:`, errorCode, result.error?.message);

        if (
          errorCode === "messaging/registration-token-not-registered" ||
          errorCode === "messaging/invalid-registration-token"
        ) {
          const badToken = tokens[i];

          console.log(
            "DEACTIVATING INVALID TOKEN:",
            badToken.substring(0, 30) + "...",
          );

          try {
            await communicationPool
              .request()
              .input("token", sql.NVarChar(sql.MAX), badToken).query(`
                UPDATE MA_UserDevices
                SET
                  IsActive = 0,
                  LastUpdated = GETDATE()
                WHERE DeviceToken = @token
              `);
          } catch (cleanupError) {
            console.error("TOKEN CLEANUP ERROR:", cleanupError.message);
          }
        }
      }
    }

    // ==========================================================
    // 12. RETURN RESULT
    // ==========================================================
    return {
      success: true,
      notificationSaved: true,
      pushSent: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (err) {
    console.error("==========================================");
    console.error("RECEIPT CHANGE NOTIFICATION ERROR:", err);
    console.error("==========================================");

    throw err;
  } finally {
    // IMPORTANT:
    // Do NOT close companyPool or communicationPool here.
    // These pools are managed by the pool-manager/helper modules.
    // Closing them here causes the next notification request to fail
    // with: "Connection is closed" / ECONNCLOSED.
  }
}

module.exports = {
  sendReceiptChangeNotification,
};
