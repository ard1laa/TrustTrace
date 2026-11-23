import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:trusttrace_mobile/core/p256.dart';
import 'package:trusttrace_mobile/core/portfolio_qr.dart';

void main() {
  const dir = String.fromEnvironment('FIXTURES', defaultValue: 'test/fixtures');
  final users = jsonDecode(File('$dir/users.json').readAsStringSync()) as Map<String, dynamic>;
  final did = jsonDecode(File('$dir/did.json').readAsStringSync())['didDocument'] as Map<String, dynamic>;
  final key = publicKeyFromDidDocument(did);

  test('server signatures verify; tampering fails', () {
    final creds = (users['credentials'] as List).map((c) => Map<String, dynamic>.from(c as Map)).toList();
    expect(creds, isNotEmpty);
    for (final c in creds) {
      expect(verifyStoredCredential(c, key), isTrue);
      final t = jsonDecode(jsonEncode(c)) as Map<String, dynamic>;
      t['verifiableCredential']['credentialSubject']['masteryScore'] = 99;
      expect(verifyStoredCredential(t, key), isFalse);
    }
  });

  test('web-generated QR verifies in Dart, and Dart QR round-trips', () {
    final url = File('$dir/qr_url.txt').readAsStringSync();
    final result = verifyPortfolioPayload(decodePortfolioText(url)!, key);
    expect(result.allValid, isTrue);
    final student = Map<String, dynamic>.from((users['students'] as List).first as Map);
    final creds = (users['credentials'] as List).map((c) => Map<String, dynamic>.from(c as Map)).toList();
    final dartUrl = encodePortfolioUrl(buildPortfolioPayload(student, creds), 'https://x.example');
    expect(verifyPortfolioPayload(decodePortfolioText(dartUrl)!, key).allValid, isTrue);
  });
}
