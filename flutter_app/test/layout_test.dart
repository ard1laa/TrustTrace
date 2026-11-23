import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trusttrace_mobile/core/p256.dart';
import 'package:image/image.dart' as img;
import 'package:trusttrace_mobile/screens/admin_portal_screen.dart';
import 'package:trusttrace_mobile/screens/auth_screen.dart';
import 'package:trusttrace_mobile/screens/document_camera_screen.dart';
import 'package:trusttrace_mobile/screens/pending_verification_screen.dart';
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
        await pump(t, size, theme, ProfileSettingsScreen(user: {...student, 'linkedProviders': const ['google']}, onUserChanged: () {}, onLogout: () {}));
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

      testWidgets('auth wizard + developer card $tag', (t) async {
        await pump(t, size, theme, AuthScreen(onAuthenticated: (_, __) {}));
        // Hidden gesture: 7 taps on the version label reveals developer mode.
        for (var i = 0; i < 7; i++) {
          await t.tap(find.textContaining('TrustTrace v'));
          await t.pump(const Duration(milliseconds: 50));
        }
        await t.pump(const Duration(milliseconds: 300));
        expect(find.text('DEVELOPER MODE'), findsOneWidget);
        await t.ensureVisible(find.byTooltip('Hide'));
        await t.tap(find.byTooltip('Hide'));
        await t.pump();

        await t.ensureVisible(find.text('Create an account'));
        await t.tap(find.text('Create an account'));
        await t.pump(const Duration(milliseconds: 300));
        await t.pump(const Duration(milliseconds: 100));
        await t.ensureVisible(find.text('Recruiter'));
        await t.tap(find.text('Recruiter'));
        await t.pump();
        Future<void> next() async {
          final button = find.ancestor(of: find.text('Continue'), matching: find.byType(FilledButton));
          t.widget<FilledButton>(button).onPressed!();
          await t.pump(const Duration(milliseconds: 400));
          await t.pump(const Duration(milliseconds: 100)); // let the outgoing step unmount
          final errors = find.byWidgetPredicate((w) => w is Text && (w.style?.color == TrustTraceTheme.dangerRed));
          if (errors.evaluate().isNotEmpty) fail('Wizard stopped: ${(errors.evaluate().first.widget as Text).data}');
        }

        await next();
        final fields = find.byType(TextField);
        await t.enterText(fields.at(0), 'Hannah Lim');
        await t.enterText(fields.at(1), 'hannah@gmail.com');
        await t.enterText(fields.at(2), 'password123');
        await t.pump();
        await next();
        await t.enterText(find.widgetWithText(TextField, 'Company'), 'Northwind Analytics');
        await next();
        final errors = find.byWidgetPredicate((w) => w is Text && (w.style?.color == TrustTraceTheme.dangerRed));
        if (errors.evaluate().isNotEmpty) fail('Wizard stopped: ${(errors.evaluate().first.widget as Text).data}');
        expect(find.text('Submit for verification'), findsOneWidget);
        expect(find.textContaining('personal address'), findsWidgets);
        await t.drag(find.byType(ListView).first, const Offset(0, -1500));
        await t.pump();
      });

      testWidgets('pending verification $tag', (t) async {
        final pending = {
          ...recruiter,
          'accountStatus': 'rejected',
          'createdAt': '2026-11-23T08:00:00Z',
          'verification': {
            'status': 'rejected',
            'emailDomain': 'gmail.com',
            'institutionalEmail': false,
            'proof': {'fileName': 'a_very_long_corporate_identity_card_scan_file_name.jpg', 'sizeKB': 312},
            'note': 'The document was too blurry to read the company name.',
          },
        };
        await pump(t, size, theme, PendingVerificationScreen(user: pending, onRefresh: () async {}, onLogout: () {}));
        expect(find.text('Verification not approved'), findsOneWidget);
      });

      testWidgets('registrar with access requests $tag', (t) async {
        final draft = {
          ...creds.first,
          'id': 'draft-1',
          'state': 'Draft',
          'achievementType': 'Hackathon',
          'requiresScoring': true,
          'achievementResult': '1st Place',
          'aiForensics': {
            'outcome': 'review',
            'reviewReasons': ['Gate 6: Tamper Forensics: The name\'s error level sits 2.4× outside the range of the other text.'],
          },
        };
        final requests = [
          {
            'id': 'u1',
            'name': 'Dr. Farah Binti Idris Al-Rashid',
            'role': 'admin',
            'accountStatus': 'pending_verification',
            'university': 'Universiti Malaya Faculty of Computer Science',
            'departmentRole': 'Deputy Registrar',
            'verification': {'emailDomain': 'um.edu.my', 'institutionalEmail': true, 'proof': null},
          },
          {
            'id': 'u2',
            'name': 'Hannah Lim',
            'role': 'recruiter',
            'accountStatus': 'pending_verification',
            'companyName': 'Northwind Analytics',
            'verification': {'emailDomain': 'gmail.com', 'institutionalEmail': false, 'proof': {'fileName': 'id.png'}},
          },
        ];
        await pump(
          t,
          size,
          theme,
          AdminPortalScreen(
            adminUser: const {'name': 'Dr. Sam Rivera', 'university': 'Global Institute of Technology'},
            students: [student],
            credentials: [draft],
            accessRequests: requests,
            onRefresh: () {},
          ),
        );
        expect(find.text('Account requests'), findsOneWidget);
        await t.drag(find.byType(ListView).first, const Offset(0, -2500));
        await t.pump();
      });

      for (final outcome in ['verified', 'review', 'rejected']) {
        testWidgets('upload sheet ($outcome) $tag', (t) async {
          final scan = {
            'scanId': 's1',
            'extracted': {
              'achievementTitle': 'UTM Digital Innovation Hackathon 2025 — National Finals',
              'issuingOrganization': 'Universiti Teknologi Malaysia',
              'issuanceDate': '2025-03-14',
              'achievementType': 'Hackathon',
              'requiresScoring': true,
              'achievementResult': '1st Place',
              'competencyDomain': 'Programming',
            },
            'forensics': {
              'outcome': outcome,
              'passed': outcome != 'rejected',
              'overallConfidence': outcome == 'verified' ? 100 : outcome == 'review' ? 73 : 40,
              'gates': [
                for (var i = 1; i <= 6; i++)
                  {
                    'id': 'g$i',
                    'gateNumber': i,
                    'title': 'Gate $i: Check number $i',
                    'status': i == 6 ? (outcome == 'verified' ? 'pass' : outcome == 'review' ? 'warn' : 'fail') : 'pass',
                    'passed': !(i == 6 && outcome == 'rejected'),
                    'detail': 'A fairly long explanation of what this gate checked and what it found on the uploaded certificate.',
                  },
              ],
            },
          };
          await pump(t, size, theme, SingleChildScrollView(child: uploadSheetForTest(student: student, scan: scan)));
          if (outcome == 'verified') expect(find.text('1st Place'), findsOneWidget);
          await t.drag(find.byType(SingleChildScrollView).first, const Offset(0, -2500));
          await t.pump();
        });
      }
    }
  }

  test('camera capture is cropped to the guide and quality-checked', () {
    // A 1200×1600 "photo": dark desk with a white page carrying sharp text-like bars.
    final photo = img.Image(width: 1200, height: 1600);
    img.fill(photo, color: img.ColorRgb8(60, 50, 40));
    img.fillRect(photo, x1: 100, y1: 500, x2: 1100, y2: 1200, color: img.ColorRgb8(235, 232, 225));
    for (var y = 560; y < 1150; y += 40) {
      img.fillRect(photo, x1: 160, y1: y, x2: 1040, y2: y + 12, color: img.ColorRgb8(20, 20, 20));
    }
    final jpeg = Uint8List.fromList(img.encodeJpg(photo, quality: 90));
    // Screen 390×520 shows the photo at scale 0.325; guide covers the page.
    const screen = Size(390, 520);
    const guide = Rect.fromLTWH(32.5, 162.5, 325, 227.5);
    final doc = processCaptureForTest(jpeg, screen, guide);
    expect(doc.width, closeTo(1040, 30));
    expect(doc.height, closeTo(728, 30));
    expect(doc.isBlurry, isFalse);
    expect(doc.isDark, isFalse);

    final blurred = Uint8List.fromList(img.encodeJpg(img.gaussianBlur(photo, radius: 14), quality: 90));
    expect(processCaptureForTest(blurred, screen, guide).isBlurry, isTrue);
  });
}
