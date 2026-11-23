import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';

/// Hive-backed key/value cache: session, settings, the last dashboard payload
/// and the issuer DID document used for offline signature checks.
class LocalStore {
  static const _boxName = 'trusttrace';
  static Box<String>? _box;

  static Future<void> init() async {
    if (_box != null) return;
    await Hive.initFlutter();
    _box = await Hive.openBox<String>(_boxName);
  }

  static String? getString(String key) => _box?.get(key);

  static Future<void> setString(String key, String? value) async {
    if (value == null) {
      await _box?.delete(key);
    } else {
      await _box?.put(key, value);
    }
  }

  static Map<String, dynamic>? getJson(String key) {
    final raw = getString(key);
    if (raw == null || raw.isEmpty) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }

  static Future<void> setJson(String key, Map<String, dynamic>? value) =>
      setString(key, value == null ? null : jsonEncode(value));
}
