# Push Notification Implementation Guide

## ✅ Backend Changes (Completed)

The backend has been updated to send push notifications when challans are approved or rejected:

### 1. **Updated Push Notification Helper** (`utils/pushNotificationHelper.js`)
   - Now sends both `notification` and `data` payloads
   - `notification` block: Shows system notification when app is in background/closed
   - `data` block: Provides custom data to app when notification is tapped
   - Added proper Android and iOS configuration
   - Includes sound, priority, and badge settings

### 2. **Updated Challan Routes** (`routes/challanRoutes.js`)
   - Added emojis to titles (✅ for approved, ❌ for rejected)
   - Sends additional metadata with notifications:
     - `type`: "CHALLAN_APPROVED" or "CHALLAN_REJECTED"
     - `challanId`: The unique challan ID (sp_462)
     - `challanNo`: The challan number (sp_468)

### 3. **How It Works**
   - When admin approves/rejects a challan, the system:
     1. Saves notification to database (`app_notifications` table)
     2. Retrieves FCM tokens for the challan creator from `app_user_devices` table
     3. Sends push notification via Firebase Cloud Messaging (FCM)
     4. **Works when app is open, in background, or closed**
     5. Cleans up invalid/expired tokens automatically

---

## 📱 Flutter/Mobile App Requirements

To complete the implementation, your Flutter app needs to handle these notifications:

### 1. **Firebase Setup**
```dart
// pubspec.yaml - Add dependencies
dependencies:
  firebase_core: ^2.24.0
  firebase_messaging: ^14.7.0
  flutter_local_notifications: ^16.3.0
```

### 2. **Initialize Firebase Messaging**
```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

// Background/Terminated message handler
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  print("Background message: ${message.messageId}");
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  
  // Set background handler
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  
  runApp(MyApp());
}
```

### 3. **Create Notification Channel (Android)**
```dart
final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
    FlutterLocalNotificationsPlugin();

Future<void> createNotificationChannel() async {
  const AndroidNotificationChannel channel = AndroidNotificationChannel(
    'challan_notifications', // This must match channelId in backend
    'Challan Notifications',
    description: 'Notifications for challan approval and rejection',
    importance: Importance.high,
    playSound: true,
  );

  await flutterLocalNotificationsPlugin
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(channel);
}
```

### 4. **Request Notification Permission**
```dart
Future<void> requestNotificationPermission() async {
  FirebaseMessaging messaging = FirebaseMessaging.instance;
  
  NotificationSettings settings = await messaging.requestPermission(
    alert: true,
    announcement: false,
    badge: true,
    carPlay: false,
    criticalAlert: false,
    provisional: false,
    sound: true,
  );

  print('User granted permission: ${settings.authorizationStatus}');
}
```

### 5. **Get and Save FCM Token**
```dart
Future<void> saveFCMToken() async {
  try {
    // Get the FCM token
    String? token = await FirebaseMessaging.instance.getToken();
    
    if (token != null) {
      print("FCM Token: $token");
      
      // Save to backend
      final response = await http.post(
        Uri.parse('${baseUrl}/api/profile/device-token'),
        headers: {
          'Authorization': 'Bearer $yourJwtToken',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'fcm_token': token,
          'device_type': Platform.isAndroid ? 'android' : 'ios',
        }),
      );
      
      print("Token saved: ${response.statusCode}");
    }
  } catch (e) {
    print("Error saving FCM token: $e");
  }
  
  // Listen for token refresh
  FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
    print("Token refreshed: $newToken");
    // Save new token to backend
  });
}
```

### 6. **Handle Notifications**
```dart
void setupNotificationListeners() {
  // 1. When app is in FOREGROUND
  FirebaseMessaging.onMessage.listen((RemoteMessage message) {
    print('Foreground message: ${message.notification?.title}');
    
    RemoteNotification? notification = message.notification;
    AndroidNotification? android = message.notification?.android;
    
    if (notification != null && android != null) {
      // Show local notification
      flutterLocalNotificationsPlugin.show(
        notification.hashCode,
        notification.title,
        notification.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            'challan_notifications',
            'Challan Notifications',
            importance: Importance.high,
            priority: Priority.high,
            icon: '@mipmap/ic_launcher',
          ),
        ),
        payload: jsonEncode(message.data),
      );
    }
  });

  // 2. When app is opened from BACKGROUND/TERMINATED state
  FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
    print('Notification tapped: ${message.data}');
    _handleNotificationTap(message.data);
  });

  // 3. Check if app was opened from notification (when terminated)
  FirebaseMessaging.instance.getInitialMessage().then((RemoteMessage? message) {
    if (message != null) {
      print('App opened from notification: ${message.data}');
      _handleNotificationTap(message.data);
    }
  });
}

// Handle notification tap
void _handleNotificationTap(Map<String, dynamic> data) {
  String? type = data['type'];
  String? challanId = data['challanId'];
  String? challanNo = data['challanNo'];
  
  print("Notification type: $type");
  print("Challan ID: $challanId");
  print("Challan No: $challanNo");
  
  // Navigate to challan detail screen
  if (challanId != null) {
    navigatorKey.currentState?.pushNamed(
      '/challan-detail',
      arguments: {
        'challanId': challanId,
        'challanNo': challanNo,
      },
    );
  }
}
```

### 7. **Complete Setup in main.dart**
```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  
  // Background handler
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  
  // Create notification channel
  await createNotificationChannel();
  
  // Request permission
  await requestNotificationPermission();
  
  runApp(MyApp());
}

class MyApp extends StatefulWidget {
  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  @override
  void initState() {
    super.initState();
    
    // Save FCM token
    saveFCMToken();
    
    // Setup listeners
    setupNotificationListeners();
  }
  
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      // ... rest of your app
    );
  }
}
```

---

## 🔍 Troubleshooting

### 1. **Notifications Not Appearing**
   - Check if FCM token is saved in `app_user_devices` table
   - Verify Firebase service account JSON is correct in `.env` file
   - Check Firebase Cloud Messaging is enabled in Firebase Console
   - Ensure notification channel is created (Android)

### 2. **Check Backend Logs**
   - Look for "PUSH FUNCTION CALLED" in server logs
   - Check if tokens are found: "TOKENS: [...]"
   - Look for "PUSH SENT: X ok, Y failed"

### 3. **Test Notification Manually**
   ```sql
   -- Check if user has device token
   SELECT * FROM app_user_devices WHERE user_id = 'YOUR_USER_ID';
   
   -- Check notifications in database
   SELECT * FROM app_notifications WHERE user_id = 'YOUR_USER_ID' ORDER BY created_at DESC;
   ```

### 4. **Common Issues**
   - **Invalid FCM Token**: Token gets removed automatically from database
   - **Missing Permission**: User must grant notification permission on first launch
   - **Wrong Channel ID**: Android channel ID must match between backend and Flutter
   - **Firebase Config**: Ensure `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) are present

---

## 📋 Backend API Endpoints

### Save Device Token
```
POST /api/profile/device-token
Authorization: Bearer {token}
Content-Type: application/json

{
  "fcm_token": "abc123...",
  "device_type": "android" // or "ios"
}
```

### Get Notifications
```
GET /api/notifications
Authorization: Bearer {token}
```

---

## 🎯 Next Steps

1. ✅ Backend changes are complete
2. ⏳ Implement Firebase setup in Flutter app
3. ⏳ Test notifications in all three states:
   - App in foreground
   - App in background
   - App completely closed
4. ⏳ Test notification tap navigation

---

## 📝 Notes

- Notifications are sent to the **challan creator** (user who made the challan)
- Admin user who approves/rejects does **not** receive notification
- Notifications include challan ID and number for deep linking
- Old/invalid tokens are automatically cleaned up
- Works on both Android and iOS
