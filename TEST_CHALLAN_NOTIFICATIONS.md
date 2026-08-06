# Testing Challan Push Notifications

## ✅ Backend Changes Completed

### Files Modified:
1. `utils/pushNotificationHelper.js` - Fixed to use MA_UserDevices from AUTOSHOP_COMMUNICATION DB
2. `routes/challanRoutes.js` - Added emoji and data payload to approve/reject notifications
3. `controllers/profileController.js` - Added saveDeviceToken function
4. `routes/profileRoutes.js` - Added POST /api/profile/device-token endpoint
5. `PUSH_NOTIFICATION_GUIDE.md` - Complete documentation created

### Push Notification Flow:

```
1. User logs in → FCM token saved to MA_UserDevices (AUTOSHOP_COMMUNICATION DB)
2. Admin approves/rejects challan → Backend:
   - Creates notification record in app_notifications table
   - Queries MA_UserDevices for FCM tokens of challan creator
   - Sends push notification via Firebase Cloud Messaging
3. User's device receives notification (works in all 3 states):
   - ✅ App Open (foreground)
   - ✅ App in Background  
   - ✅ App Completely Closed
4. User taps notification → Opens Notification Screen
```

---

## 📱 Flutter Changes Completed

### Files Modified:
1. `lib/main.dart`:
   - Added `challan_notifications` notification channel
   - Updated `_showLocalChatNotification()` to route by notification type
   - Added `_handleNotificationData()` for smart routing
   - Added `_openNotificationScreen()` for challan status notifications
   - Updated all FCM tap handlers to use new routing logic

### Notification Routing:
- **Chat messages** → Open ChallanChatDialog
- **Challan Approved/Rejected** → Open NotificationScreen

---

## 🧪 Testing Guide

### Step 1: Verify Backend Setup

```sql
-- Check if MA_UserDevices table exists in AUTOSHOP_COMMUNICATION
USE AUTOSHOP_COMMUNICATION;
GO

SELECT TOP 10 * 
FROM MA_UserDevices 
ORDER BY CreatedOn DESC;
```

### Step 2: Login and Check FCM Token Registration

1. **Open Flutter app** on physical device or emulator
2. **Login** with a non-admin user account
3. **Check backend logs** for:
   ```
   FCM TOKEN SAVED (platform: android, model: ...)
   ```
4. **Verify in database**:
   ```sql
   SELECT 
       UserId, 
       PropertyCode,
       Platform,
       DeviceModel,
       IsActive,
       LEFT(DeviceToken, 30) + '...' AS Token,
       CreatedOn
   FROM MA_UserDevices 
   WHERE UserId = 'YOUR_USER_ID'
     AND IsActive = 1;
   ```

### Step 3: Create a Test Challan

1. Login as **non-admin user** (e.g., sales person)
2. Navigate to **Challan Screen**
3. **Create a new challan**
4. Note the **Challan ID** and **User ID**

### Step 4: Test Notification (App Open)

1. **Keep app open** on the non-admin user's device
2. Login as **admin** on a different device/browser
3. **Approve the challan** created by the non-admin user
4. **Expected Result**:
   - Non-admin device shows a local notification in notification tray
   - Title: "Challan Approved ✅"
   - Body: "Your challan [challan_number] has been approved"
   - Tapping notification opens **Notification Screen**

5. **Check backend logs**:
   ```
   🔔 PUSH NOTIFICATION — USER: [userId] TITLE: Challan Approved ✅
   📱 TOKENS FOUND FOR [userId]: 1
   ✅ PUSH SENT: 1 ok / 0 failed
   ```

### Step 5: Test Notification (App in Background)

1. **Background the app** on non-admin user's device (press home button)
2. Login as **admin** 
3. **Create and reject another challan** from the same user
4. **Expected Result**:
   - System notification appears in Android notification tray
   - Title: "Challan Rejected ❌"
   - Sound plays
   - Tapping notification opens app → **Notification Screen**

### Step 6: Test Notification (App Closed)

1. **Force close the app** on non-admin user's device (swipe away from recents)
2. Login as **admin**
3. **Approve another challan** from the same user
4. **Expected Result**:
   - System notification appears even with app closed
   - Tapping notification launches app → **Notification Screen**

---

## 🔍 Troubleshooting

### Issue: No notification received

**Check 1: FCM Token Saved?**
```sql
SELECT * FROM MA_UserDevices 
WHERE UserId = 'YOUR_USER_ID' AND IsActive = 1;
```
- If no record → Token not saved. Check login flow.
- If record exists → Token is saved ✅

**Check 2: Backend Logs**
Look for these in server console:
```
🔔 PUSH NOTIFICATION — USER: [userId]
📱 TOKENS FOUND FOR [userId]: 1
✅ PUSH SENT: 1 ok / 0 failed
```

**Check 3: Firebase Configuration**
- Verify `firebase-service-account.json` is correct
- Check `FIREBASE_SERVICE_ACCOUNT` in `.env` file
- Ensure Firebase Cloud Messaging is enabled in Firebase Console

**Check 4: Device Issues**
- Android: Ensure notification permissions are granted
- Battery saver: Disable battery optimization for the app
- Do Not Disturb: Temporarily disable

### Issue: Notification received but tap does nothing

**Check Flutter Logs:**
```
NOTIFICATION TAPPED (background): type=CHALLAN_APPROVED challanId=xxx
```
- If log appears → Navigation issue. Check `_handleNotificationData()`.
- If no log → Tap handler not wired correctly.

### Issue: Wrong notification sound or channel

**Android: Create notification channel again**
```dart
// In Android notification settings
// Long press notification → Settings → Edit channel settings
```

Or **uninstall and reinstall app** (channels are cached).

---

## 📊 Notification Data Payload

### Approve Notification:
```json
{
  "title": "Challan Approved ✅",
  "body": "Your challan [number] has been approved",
  "type": "CHALLAN_APPROVED",
  "challanId": "ABC123",
  "challanNo": "CH-2024-001"
}
```

### Reject Notification:
```json
{
  "title": "Challan Rejected ❌",
  "body": "Your challan [number] has been rejected",
  "type": "CHALLAN_REJECTED",
  "challanId": "ABC123",
  "challanNo": "CH-2024-001"
}
```

---

## 🎯 Success Criteria

✅ Non-admin user receives push notification when their challan is approved  
✅ Non-admin user receives push notification when their challan is rejected  
✅ Notification appears when app is open (foreground)  
✅ Notification appears when app is in background  
✅ Notification appears when app is completely closed  
✅ Tapping notification opens the Notification Screen  
✅ Notification shows in system tray with sound  
✅ Admin user who approves/rejects does NOT receive notification  
✅ Only the challan creator receives notification  
✅ Invalid FCM tokens are automatically cleaned up

---

## 💡 Tips

1. **Test on real device**: Emulators may have issues with FCM
2. **Check internet**: Push notifications require active connection
3. **Use multiple devices**: One admin, one regular user
4. **Monitor backend logs**: Most issues visible in server console
5. **Clear app data**: If things are stuck, clear app data and login again

---

## 📞 Support

If notifications still don't work:
1. Export backend logs from server
2. Export Flutter logs: `flutter logs > logs.txt`
3. Screenshot of database MA_UserDevices table
4. Screenshot of Firebase Console → Cloud Messaging settings

---

## Next Steps (Optional Enhancements)

- [ ] Add notification badge count
- [ ] Add notification history pagination
- [ ] Add rich media (images) to notifications
- [ ] Add notification settings (enable/disable by type)
- [ ] Add notification sound picker
- [ ] Add multi-language support for notification text
