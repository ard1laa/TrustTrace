import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trusttrace_mobile/core/p256.dart';
import 'package:trusttrace_mobile/screens/auth_screen.dart';
import 'package:trusttrace_mobile/screens/profile_settings_screen.dart';
import 'package:trusttrace_mobile/screens/qr_verifier_screen.dart';
import 'package:trusttrace_mobile/screens/student_wallet_screen.dart';
import 'package:trusttrace_mobile/services/verification_service.dart';
import 'package:trusttrace_mobile/theme/trusttrace_theme.dart';
import 'package:trusttrace_mobile/widgets/verification_result_view.dart';

// Renders each main screen on small iPhones in both themes; any RenderFlex
// overflow fails the test.
void main() {
  final users = jsonDecode(File('test/fixtures/users.json').readAsStringSync()) as Map<String, dynamic>;
  final key = publicKeyFromDidDocument(jsonDecode(File('test/fixtures/did.json').readAsStringSync())['didDocument']);
  final student = {...Map<String, dynamic>.from((users['students'] as List).first as Map), 'role': 'student', 'headline': 'Computer Science student @ Global Institute of Technology with a deliberately long headline'};
  final creds = (users['credentials'] as List).map((c) => Map<String, dynamic>.from(c as Map)).toList();
  final recruiter = {'id': 'r1', 'name': 'Alex Morgan', 'role': 'recruiter', 'jobTitle': 'Senior Talent Acquisition Partner', 'companyName': 'Global Tech Corporation International'};

  const sizes = [Size(320, 568), Size(375, 667), Size(390, 844)];

  Future<void> pump(WidgetTester tester, Size size, ThemeData theme, Widget child) async {
    tester.view.physicalSize = size * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: theme, home: Scaffold(body: child)));
    await tester.pump(const Duration(seconds: 1));
  }

  for (final size in sizes) {
    for (final dark in [false, true]) {
      final theme = dark ? TrustTraceTheme.darkTheme : TrustTraceTheme.lightTheme;
      final tag = '${size.width.toInt()}x${size.height.toInt()} ${dark ? 'dark' : 'light'}';

      testWidgets('wallet $tag', (t) async {
        await pump(t, size, theme, StudentWalletScreen(student: student, credentials: creds, offline: true, onRefresh: () async {}));
        await t.drag(find.byType(ListView).first, const Offset(0, -2500));
        await t.pump();
      });

      testWidgets('profile $tag', (t) async {
        await pump(t, size, theme, ProfileSettingsScreen(user: {...student, 'linkedProviders': ['google']}, onUserChanged: () {}, onLogout: () {}));
        await t.drag(find.byType(ListView).first, const Offset(0, -3000));
        await t.pump();
      });

      testWidgets('verifier + offline result $tag', (t) async {
        await pump(t, size, theme, QrVerifierScreen(recruiter: recruiter, students: [student], credentials: creds, offline: true));
        final outcome = VerificationOutcome(
          offline: true,
          holder: student,
          credentials: creds.map((c) => {...c, 'signatureValid': verifyStoredCredential(c, key), 'revoked': false}).toList(),
        );
        await pump(t, size, theme, SingleChildScrollView(child: VerificationResultView(outcome: outcome)));
      });

      testWidgets('auth $tag', (t) async {
        await pump(t, size, theme, AuthScreen(onAuthenticated: (_, __) {}));
        await t.tap(find.text('Create an account'));
        await t.pump();
        await t.drag(find.byType(ListView).first, const Offset(0, -1500));
        await t.pump();
      });
    }
  }
}
