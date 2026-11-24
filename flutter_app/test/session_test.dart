import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:trusttrace_mobile/core/portfolio_qr.dart';
import 'package:trusttrace_mobile/screens/student_wallet_screen.dart';
import 'package:trusttrace_mobile/services/api_service.dart';
import 'package:trusttrace_mobile/theme/trusttrace_theme.dart';

String jwt(int exp) {
  String part(Map<String, dynamic> m) => base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${part({'alg': 'HS256'})}.${part({'id': 'u1', 'exp': exp})}.sig';
}

int get now => DateTime.now().millisecondsSinceEpoch ~/ 1000;
final user = {'id': 'u1', 'name': 'Nur Aisyah', 'role': 'student'};
http.Response json(int status, Map<String, dynamic> body) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  group('session refresh', () {
    test('401 SESSION_EXPIRED → refresh → retry succeeds, user stays signed in', () async {
      await ApiService.debugSetSession(jwt(now + 3600), user, refreshToken: 'rt1.old');
      final calls = <String>[];
      final client = MockClient((req) async {
        calls.add('${req.method} ${req.url.path} ${req.headers['authorization'] ?? ''}');
        if (req.url.path.endsWith('/auth/refresh')) {
          expect(jsonDecode(req.body)['refreshToken'], 'rt1.old');
          return json(200, {'token': jwt(now + 7200), 'refreshToken': 'rt1.new', 'user': user});
        }
        final fresh = (req.headers['authorization'] ?? '').contains(jwt(now + 7200).split('.')[1]);
        return fresh ? json(200, {'ok': true}) : json(401, {'error': 'expired', 'code': 'SESSION_EXPIRED'});
      });
      final before = ApiService.sessionExpiredNotifier.value;
      final res = await http.runWithClient(() => ApiService.togglePrivacy('c1', true), () => client);
      expect(res.ok, isTrue);
      expect(calls.where((c) => c.contains('/auth/refresh')).length, 1);
      expect(calls.where((c) => c.contains('/privacy')).length, 2);
      expect(ApiService.sessionExpiredNotifier.value, before);
      expect(ApiService.isSignedIn, isTrue);
    });

    test('token about to expire is refreshed before the request', () async {
      await ApiService.debugSetSession(jwt(now + 30), user, refreshToken: 'rt1.a');
      final calls = <String>[];
      final client = MockClient((req) async {
        calls.add(req.url.path);
        if (req.url.path.endsWith('/auth/refresh')) return json(200, {'token': jwt(now + 7200), 'refreshToken': 'rt1.b', 'user': user});
        return json(200, {'ok': true});
      });
      await http.runWithClient(() => ApiService.togglePrivacy('c1', false), () => client);
      expect(calls.first, endsWith('/auth/refresh'));
      expect(calls.length, 2);
    });

    test('concurrent 401s share one refresh call', () async {
      await ApiService.debugSetSession(jwt(now + 3600), user, refreshToken: 'rt1.c');
      var refreshes = 0;
      final client = MockClient((req) async {
        if (req.url.path.endsWith('/auth/refresh')) {
          refreshes++;
          await Future<void>.delayed(const Duration(milliseconds: 20));
          return json(200, {'token': jwt(now + 7201), 'refreshToken': 'rt1.d', 'user': user});
        }
        final fresh = (req.headers['authorization'] ?? '').contains(jwt(now + 7201).split('.')[1]);
        return fresh ? json(200, {}) : json(401, {'code': 'SESSION_EXPIRED'});
      });
      await http.runWithClient(
          () => Future.wait([ApiService.togglePrivacy('a', true), ApiService.togglePrivacy('b', true), ApiService.deleteCredential('c')]),
          () => client);
      expect(refreshes, 1);
    });

    test('dead refresh token → signed out and session-expired fired (no dead button)', () async {
      await ApiService.debugSetSession(jwt(now + 3600), user, refreshToken: 'rt1.dead');
      final client = MockClient((req) async => req.url.path.endsWith('/auth/refresh')
          ? json(401, {'code': 'SESSION_EXPIRED'})
          : json(401, {'error': 'Your session expired.', 'code': 'SESSION_EXPIRED'}));
      final before = ApiService.sessionExpiredNotifier.value;
      final res = await http.runWithClient(() => ApiService.togglePrivacy('c1', true), () => client);
      expect(res.ok, isFalse);
      expect(ApiService.sessionExpiredNotifier.value, before + 1);
      expect(ApiService.debugToken, isNull);
    });

    test('wrong-password 401 on login does not trigger a refresh', () async {
      await ApiService.debugSetSession(null, null);
      var refreshes = 0;
      final client = MockClient((req) async {
        if (req.url.path.endsWith('/auth/refresh')) refreshes++;
        return json(401, {'error': 'Incorrect password.'});
      });
      final res = await http.runWithClient(() => ApiService.login('a@b.c', 'x'), () => client);
      expect(res.error, 'Incorrect password.');
      expect(refreshes, 0);
    });
  });

  group('short QR links', () {
    test('extractShareCode accepts links and app scheme, ignores other URLs', () {
      expect(extractShareCode('https://trusttrace.app/v/7KQ2M9XD'), '7kq2m9xd');
      expect(extractShareCode('trusttrace:v:abcd2345'), 'abcd2345');
      expect(extractShareCode('https://x/verify?did=did:tt:1#tt1=abc'), isNull);
      expect(shareLink('https://trusttrace.app', 'abcd2345'), 'https://trusttrace.app/v/abcd2345');
    });

    testWidgets('share sheet defaults to Quick scan and switches to Offline QR', (tester) async {
      tester.view.physicalSize = const Size(375 * 3, 812 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final student = {'id': 'u1', 'name': 'Nur Aisyah', 'did': 'did:trusttrace:student:1', 'shareCode': 'abcd2345'};
      await tester.pumpWidget(MaterialApp(
        theme: TrustTraceTheme.lightTheme,
        home: Scaffold(body: ShareQrSheet(student: student, credentials: const [])),
      ));
      expect(find.textContaining('/v/abcd2345'), findsOneWidget);
      expect(find.textContaining('Scans instantly'), findsOneWidget);
      await tester.tap(find.text('Offline QR'));
      await tester.pumpAndSettle();
      expect(find.textContaining('/v/abcd2345'), findsNothing);
      expect(find.textContaining('links to your profile only'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
