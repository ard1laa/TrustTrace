import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart' show ThemeMode, ValueNotifier;
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import '../core/p256.dart';
import '../theme/trusttrace_theme.dart';
import 'local_store.dart';

/// Result of an API call. `offline` is true when the server couldn't be reached.
class ApiResult {
  final int status;
  final Map<String, dynamic> data;
  final bool offline;
  const ApiResult(this.status, this.data, {this.offline = false});

  bool get ok => status >= 200 && status < 300;
  String? get error => ok ? null : (data['error']?.toString() ?? (offline ? ApiService.offlineMessage : 'Something went wrong.'));
}

/// Single client for the TrustTrace API shared with the web app.
/// Reads fall back to the Hive cache; writes require a connection.
class ApiService {
  static const offlineMessage = "You're offline. Connect to the TrustTrace server and try again.";

  // Override at build time: flutter run --dart-define=API_BASE_URL=https://your-host/api
  static const _defaultBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3001/api');

  static String apiBaseUrl = _defaultBaseUrl;
  static String? _token;
  static Map<String, dynamic>? currentUser;

  static final ValueNotifier<bool> serverConnectedNotifier = ValueNotifier<bool>(false);
  static final ValueNotifier<int> sessionExpiredNotifier = ValueNotifier<int>(0);

  static const MethodChannel _filePickerChannel = MethodChannel('trusttrace/file_picker');

  static const _kBaseUrl = 'api_base_url';
  static const _kToken = 'session_token';
  static const _kUser = 'session_user';
  static const _kDashboard = 'dashboard_cache';
  static const _kIssuerDid = 'issuer_did_document';
  static const _kTheme = 'theme_mode';

  static String get webOrigin => apiBaseUrl.replaceFirst(RegExp(r'/api/?$'), '');
  static bool get isSignedIn => _token != null && currentUser != null;

  // ---------------------------------------------------------------------------
  // Startup & settings
  // ---------------------------------------------------------------------------
  static Future<void> init() async {
    await LocalStore.init();
    apiBaseUrl = LocalStore.getString(_kBaseUrl) ?? _defaultBaseUrl;
    _token = LocalStore.getString(_kToken);
    currentUser = LocalStore.getJson(_kUser);
    if (_token == null) currentUser = null;
    final theme = LocalStore.getString(_kTheme);
    TrustTraceTheme.themeModeNotifier.value = switch (theme) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
    TrustTraceTheme.themeModeNotifier.addListener(() {
      LocalStore.setString(_kTheme, TrustTraceTheme.themeModeNotifier.value.name);
    });
  }

  static Future<void> setServerUrl(String raw) async {
    var clean = raw.trim().replaceAll(RegExp(r'/+$'), '');
    if (clean.isEmpty) clean = _defaultBaseUrl;
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) clean = 'http://$clean';
    if (!clean.endsWith('/api')) clean = '$clean/api';
    apiBaseUrl = clean;
    await LocalStore.setString(_kBaseUrl, clean);
  }

  static Future<void> _saveSession(String? token, Map<String, dynamic>? user) async {
    _token = token;
    currentUser = user == null ? null : _normalizeUser(user);
    await LocalStore.setString(_kToken, token);
    await LocalStore.setJson(_kUser, currentUser);
  }

  static Future<void> signOut() async {
    await _saveSession(null, null);
    await LocalStore.setJson(_kDashboard, null);
  }

  static Map<String, dynamic> _normalizeUser(Map<String, dynamic> raw) {
    final u = Map<String, dynamic>.from(raw);
    u['role'] = TrustTraceTheme.normalizeRole(u['role']);
    u['name'] = u['name'] ?? u['fullName'] ?? 'User';
    return u;
  }

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------
  static Future<ApiResult> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Duration timeout = const Duration(seconds: 12),
  }) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (_token != null) 'Authorization': 'Bearer $_token',
    };
    final uri = Uri.parse('$apiBaseUrl$path');
    final encoded = body == null ? null : jsonEncode(body);
    try {
      final http.Response res = await switch (method) {
        'POST' => http.post(uri, headers: headers, body: encoded),
        'PUT' => http.put(uri, headers: headers, body: encoded),
        'PATCH' => http.patch(uri, headers: headers, body: encoded),
        'DELETE' => http.delete(uri, headers: headers),
        _ => http.get(uri, headers: headers),
      }
          .timeout(timeout);
      serverConnectedNotifier.value = true;
      Map<String, dynamic> data = {};
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map) data = Map<String, dynamic>.from(decoded);
      } catch (_) {}
      if (res.statusCode == 401 && _token != null && !path.startsWith('/auth/')) {
        sessionExpiredNotifier.value++;
      }
      return ApiResult(res.statusCode, data);
    } catch (_) {
      serverConnectedNotifier.value = false;
      return const ApiResult(0, {}, offline: true);
    }
  }

  static Future<ApiResult> _authCall(String path, Map<String, dynamic> body) async {
    final res = await _request('POST', path, body: body);
    if (res.ok && res.data['token'] != null && res.data['user'] is Map) {
      await _saveSession(res.data['token'].toString(), Map<String, dynamic>.from(res.data['user'] as Map));
    }
    return res;
  }

  // ---------------------------------------------------------------------------
  // Auth & profile
  // ---------------------------------------------------------------------------
  static Future<Map<String, dynamic>> providers() async {
    final res = await _request('GET', '/auth/providers', timeout: const Duration(seconds: 5));
    return res.ok ? res.data : {'google': {'enabled': false}, 'apple': {'enabled': false}, 'demoLogin': false};
  }

  static Future<ApiResult> login(String email, String password) =>
      _authCall('/auth/login', {'email': email.trim(), 'password': password});

  static Future<ApiResult> register(Map<String, dynamic> payload) => _authCall('/auth/register', payload);

  static Future<ApiResult> demoLogin(String role) => _authCall('/auth/demo-login', {'role': role});

  static Future<ApiResult> oauthSignIn(String provider, String idToken, Map<String, dynamic> extras) =>
      _authCall('/auth/oauth/$provider', {...extras, 'idToken': idToken});

  static Future<ApiResult> recoverWallet(String input) => _authCall('/wallet/recover', {'recoveryInput': input});

  static Future<ApiResult> updateProfile(Map<String, dynamic> fields) async {
    final id = currentUser?['id'];
    final res = await _request('PUT', '/auth/profile/$id', body: fields);
    if (res.ok && res.data['user'] is Map) {
      await _saveSession(_token, {...?currentUser, ...Map<String, dynamic>.from(res.data['user'] as Map)});
    }
    return res;
  }

  static Future<ApiResult> changePassword(String current, String next) =>
      _request('PUT', '/auth/password', body: {'currentPassword': current, 'newPassword': next});

  static Future<ApiResult> deleteAccount() async {
    final res = await _request('DELETE', '/auth/account/${currentUser?['id']}');
    if (res.ok) await signOut();
    return res;
  }

  // ---------------------------------------------------------------------------
  // Dashboard data (cached for offline use)
  // ---------------------------------------------------------------------------
  static Future<Map<String, dynamic>> fetchAllData() async {
    final res = await _request('GET', '/users');
    if (res.ok) {
      if (res.data['me'] is Map) {
        await _saveSession(_token, Map<String, dynamic>.from(res.data['me'] as Map));
      } else if (_token != null) {
        sessionExpiredNotifier.value++;
      }
      await LocalStore.setJson(_kDashboard, res.data);
      unawaited(refreshIssuerDid());
      return {...res.data, 'offline': false};
    }
    final cached = LocalStore.getJson(_kDashboard) ?? {};
    return {...cached, 'offline': true};
  }

  static List<Map<String, dynamic>> listOf(dynamic raw) =>
      raw is List ? raw.map((e) => _normalizeUser(Map<String, dynamic>.from(e as Map))).toList() : [];

  static List<Map<String, dynamic>> credentialsOf(dynamic raw) =>
      raw is List ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList() : [];

  // ---------------------------------------------------------------------------
  // Issuer key (for offline verification)
  // ---------------------------------------------------------------------------
  static Future<void> refreshIssuerDid() async {
    final res = await _request('GET', '/did/issuer', timeout: const Duration(seconds: 6));
    if (res.ok && res.data['didDocument'] is Map) {
      await LocalStore.setJson(_kIssuerDid, Map<String, dynamic>.from(res.data['didDocument'] as Map));
    }
  }

  static EcPoint? cachedIssuerKey() => publicKeyFromDidDocument(LocalStore.getJson(_kIssuerDid));

  // ---------------------------------------------------------------------------
  // Certificates & credentials
  // ---------------------------------------------------------------------------
  static Future<ApiResult> verifyUpload({
    required String fileName,
    required String base64Data,
    required String mimeType,
    Map<String, dynamic>? geometry,
  }) =>
      _request('POST', '/certificates/verify-upload',
          body: {
            'fileBase64': base64Data,
            'fileName': fileName,
            'mimeType': mimeType,
            'clientPixelMetrics': geometry,
          },
          timeout: const Duration(seconds: 45));

  static Future<ApiResult> issueCredential(Map<String, dynamic> body) =>
      _request('POST', '/credentials/issue', body: body, timeout: const Duration(seconds: 20));

  static Future<ApiResult> togglePrivacy(String credId, bool isPublic) =>
      _request('PATCH', '/credentials/$credId/privacy', body: {'isPublic': isPublic});

  static Future<ApiResult> toggleTalentVisibility(String userId, bool visible) =>
      _request('PATCH', '/users/$userId/talent-visibility', body: {'visibleInTalentSearch': visible});

  static Future<ApiResult> deleteCredential(String credId) => _request('DELETE', '/credentials/$credId');

  static Future<ApiResult> approveMint(String credId) => _request('POST', '/credentials/$credId/approve-mint', body: {});

  static Future<ApiResult> revokeCredential(String credId) =>
      _request('POST', '/credentials/$credId/revoke', body: {'reason': 'Revoked by the registrar.'});

  static Future<ApiResult> verifyLookup(String lookup) =>
      _request('POST', '/verify', body: {'candidateLookup': lookup}, timeout: const Duration(seconds: 8));

  // ---------------------------------------------------------------------------
  // Recruiter shortlist
  // ---------------------------------------------------------------------------
  static Future<List<Map<String, dynamic>>> getRecruiterShortlist(String recruiterId) async {
    final res = await _request('GET', '/recruiter/$recruiterId/shortlist');
    if (res.ok) return credentialsOf(res.data['shortlist']);
    final cached = LocalStore.getJson(_kDashboard)?['recruiterShortlists'];
    return cached is Map ? credentialsOf(cached[recruiterId]) : [];
  }

  static Future<ApiResult> saveToRecruiterShortlist(String recruiterId, String studentUserId, {String status = 'Shortlisted'}) =>
      _request('POST', '/recruiter/$recruiterId/shortlist', body: {'studentUserId': studentUserId, 'status': status});

  static Future<ApiResult> removeFromRecruiterShortlist(String recruiterId, String studentUserId) =>
      _request('DELETE', '/recruiter/$recruiterId/shortlist/$studentUserId');

  // ---------------------------------------------------------------------------
  // Native pickers (ios/Runner/AppDelegate.swift)
  // ---------------------------------------------------------------------------
  static Future<Map<String, dynamic>?> _pick(String method) async {
    try {
      final res = await _filePickerChannel.invokeMethod<dynamic>(method);
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (_) {}
    return null;
  }

  static Future<Map<String, dynamic>?> pickFromCamera() => _pick('pickFromCamera');
  static Future<Map<String, dynamic>?> pickFromGallery() => _pick('pickFromGallery');
  static Future<Map<String, dynamic>?> pickFromFiles() => _pick('pickFromFiles');
}
