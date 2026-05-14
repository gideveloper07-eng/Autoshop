import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiService {
  static const String baseUrl = "https://autoshop-ekvt.onrender.com";

  static const _storage = FlutterSecureStorage(
    webOptions: WebOptions(
      dbName: 'autoshop_db',
      publicKey: 'as_key_2024',
    ),
  );

  // ───────────────── TOKEN ─────────────────

  static Future<void> saveToken(String t) =>
      _storage.write(key: "token", value: t);

  static Future<String?> getToken() =>
      _storage.read(key: "token");

  static Future<void> clearToken() =>
      _storage.delete(key: "token");

  // ───────────────── SESSION ─────────────────

  static Future<void> saveUserSession({
    required String token,
    required String userId,
    required String userName,
    required String userEmail,
    required String databaseName,
    required String companyCode,
  }) async {
    await Future.wait([
      _storage.write(key: "token", value: token),
      _storage.write(key: "userId", value: userId),
      _storage.write(key: "userName", value: userName),
      _storage.write(key: "userEmail", value: userEmail),
      _storage.write(key: "databaseName", value: databaseName),
      _storage.write(key: "companyCode", value: companyCode),
    ]);
  }

  static Future<Map<String, String>?> getUserSession() async {
    final token = await _storage.read(key: "token");

    if (token == null || token.isEmpty) return null;

    return {
      "token": token,
      "userId": await _storage.read(key: "userId") ?? "",
      "userName": await _storage.read(key: "userName") ?? "",
      "userEmail": await _storage.read(key: "userEmail") ?? "",
      "databaseName":
          await _storage.read(key: "databaseName") ?? "",
      "companyCode":
          await _storage.read(key: "companyCode") ?? "",
    };
  }

  static Future<void> clearSession() async {
    await Future.wait([
      _storage.delete(key: "token"),
      _storage.delete(key: "userId"),
      _storage.delete(key: "userName"),
      _storage.delete(key: "userEmail"),
      _storage.delete(key: "databaseName"),
      _storage.delete(key: "companyCode"),
    ]);
  }

  // ───────────────── DEVICE ID ─────────────────

  static Future<String> getDeviceId() async {
    try {
      final deviceInfo = DeviceInfoPlugin();

      if (kIsWeb) {
        // For web: generate a persistent unique ID stored in secure storage
        String? storedId = await _storage.read(key: "device_id");
        if (storedId != null && storedId.isNotEmpty) {
          return storedId;
        }
        // Generate a new unique ID for this browser
        final newId = "web_${DateTime.now().millisecondsSinceEpoch}_${_randomSuffix()}";
        await _storage.write(key: "device_id", value: newId);
        return newId;
      }

      if (Platform.isAndroid) {
        final androidInfo = await deviceInfo.androidInfo;
        return "android_${androidInfo.id}";
      }

      if (Platform.isIOS) {
        final iosInfo = await deviceInfo.iosInfo;
        return "ios_${iosInfo.identifierForVendor ?? DateTime.now().millisecondsSinceEpoch.toString()}";
      }

      if (Platform.isWindows) {
        final windowsInfo = await deviceInfo.windowsInfo;
        return "win_${windowsInfo.deviceId}";
      }

      return "device_${DateTime.now().millisecondsSinceEpoch}";
    } catch (e) {
      print("DEVICE ID ERROR: $e");
      return "fallback_${DateTime.now().millisecondsSinceEpoch}";
    }
  }

  static String _randomSuffix() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final rand = DateTime.now().microsecondsSinceEpoch;
    return String.fromCharCodes(
      List.generate(8, (i) => chars.codeUnitAt((rand >> i) % chars.length)),
    );
  }

  // ───────────────── WAKE SERVER ─────────────────

  static Future<void> wakeServer() async {
    Future(() => ensureAwake());
  }

  static Future<void> ensureAwake() async {
    final urls = ["$baseUrl/ping", "$baseUrl/"];

    for (int i = 0; i < 10; i++) {
      for (final url in urls) {
        try {
          final res = await http
              .get(Uri.parse(url))
              .timeout(const Duration(seconds: 12));

          final body = res.body.trim();

          if (res.statusCode == 200 &&
              !body.startsWith('<') &&
              !body.startsWith('<!')) {
            if (kIsWeb) {
              print("✅ Server awake (attempt ${i + 1})");
            }
            return;
          }
        } catch (_) {}
      }

      await Future.delayed(const Duration(seconds: 6));
    }
  }

  // ───────────────── VALIDATE COMPANY ─────────────────

  static Future<Map<String, dynamic>> validateCompany(
      String companyCode) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/validate-company'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'companyCode': companyCode,
        }),
      );

      if (response.statusCode == 200) {
        return jsonDecode(response.body)
            as Map<String, dynamic>;
      }

      return <String, dynamic>{};
    } catch (e) {
      print("Validate Company Error: $e");
      return <String, dynamic>{};
    }
  }
static Future<void> logout(String token) async {

  try {

    await http.post(
      Uri.parse("$baseUrl/api/auth/logout"),
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer $token",
      },
    );

  } catch (e) {

    print("LOGOUT API ERROR: $e");
  }
}
  // ───────────────── LOGIN ─────────────────

  static Future<Map?> login({
    required String databaseName,
    required String userId,
    required String password,
  }) async {
    try {
      await ensureAwake();

      // GET DEVICE ID
      final deviceId = await getDeviceId();

      if (kIsWeb) {
        print("DEVICE ID: $deviceId");
      }

      final res = await http.post(
        Uri.parse("$baseUrl/api/auth/login"),
        headers: {
          "Content-Type": "application/json",
        },
        body: jsonEncode({
          "databaseName": databaseName,
          "userId": userId,
          "password": password,
          "deviceId": deviceId,
        }),
      ).timeout(const Duration(seconds: 30));

      if (kIsWeb) {
        print("LOGIN STATUS: ${res.statusCode}");
        print("LOGIN BODY: ${res.body}");
      }

      // BLOCKED LOGIN
      if (res.statusCode == 403) {
        final data = jsonDecode(res.body);

        return {
          "success": false,
          "message": data['message'] ??
              "This account is already logged in on another device"
        };
      }

      // SUCCESS
      if (res.statusCode == 200 &&
          !res.body.trim().startsWith('<')) {

        final data = jsonDecode(res.body);

        if (data['token'] != null) {

          await saveUserSession(
            token: data['token'],
            userId:
                data['userId']?.toString() ?? userId,
            userName:
                data['name']?.toString() ?? userId,
            userEmail:
                data['email']?.toString() ?? "",
            databaseName:
                data['databaseName']?.toString() ??
                    databaseName,
            companyCode: "",
          );
        }

        return data;
      }

      // INVALID LOGIN
      return {
        "success": false,
        "message": "Invalid User ID or Password"
      };

    } catch (e) {

      print("LOGIN ERROR: $e");

      return {
        "success": false,
        "message": e.toString(),
      };
    }
  }
}