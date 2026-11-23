// "TT1" portfolio QR payload — same format as src/lib/portfolioQr.js.
// <origin>/verify?did=<did>#tt1=<base64url(json)>
import 'dart:convert';
import 'dart:typed_data';
import 'p256.dart';

const maxQrCredentials = 4;

String _b64url(List<int> bytes) => base64Url.encode(bytes).replaceAll('=', '');
Uint8List _b64urlDecode(String s) => base64Url.decode(base64Url.normalize(s));

List<int> _hex32(String hex) {
  final clean = hex.replaceFirst('0x', '').padLeft(64, '0');
  return [for (var i = 0; i < 64; i += 2) int.parse(clean.substring(i, i + 2), radix: 16)];
}

String _toHex(List<int> bytes) => bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

Map<String, dynamic> buildPortfolioPayload(Map<String, dynamic> holder, List<Map<String, dynamic>> credentials) {
  final eligible = credentials
      .where((c) => c['isPublic'] != false && c['state'] == 'Locked' && c['verifiableCredential'] is Map)
      .toList()
    ..sort((a, b) => '${b['issuanceDate']}'.compareTo('${a['issuanceDate']}'));

  return {
    'v': 1,
    'h': {
      'd': holder['did'],
      'n': holder['name'],
      's': holder['studentId'] ?? '',
      'f': holder['fieldOfStudy'] ?? '',
      'u': holder['university'] ?? '',
    },
    'c': eligible.take(maxQrCredentials).map((cred) {
      final vc = Map<String, dynamic>.from(cred['verifiableCredential'] as Map);
      final subj = Map<String, dynamic>.from(vc['credentialSubject'] as Map);
      final proof = vc['proof'] as Map;
      final entry = <String, dynamic>{
        'i': cred['id'],
        't': subj['achievementTitle'],
        'o': subj['issuingOrganization'],
        'dt': vc['issuanceDate'],
        'cd': subj['competencyDomain'],
        'l': subj['attainedLevel'],
        'm': subj['masteryScore'],
        'g': _b64url([..._hex32('${proof['r']}'), ..._hex32('${proof['s']}')]),
      };
      if (subj['name'] != holder['name']) entry['n'] = subj['name'];
      if ((subj['studentId'] ?? '') != (holder['studentId'] ?? '')) entry['s'] = subj['studentId'] ?? '';
      return entry;
    }).toList(),
    'x': DateTime.now().toUtc().toIso8601String(),
  };
}

String encodePortfolioUrl(Map<String, dynamic> payload, String origin) {
  final did = Uri.encodeComponent(payload['h']['d'].toString());
  return '$origin/verify?did=$did#tt1=${_b64url(utf8.encode(jsonEncode(payload)))}';
}

Map<String, dynamic>? decodePortfolioText(String text) {
  final match = RegExp(r'[#&?]tt1=([A-Za-z0-9_-]+)').firstMatch(text);
  if (match == null) return null;
  try {
    final payload = jsonDecode(utf8.decode(_b64urlDecode(match.group(1)!)));
    if (payload is Map && payload['v'] == 1 && payload['h'] is Map && payload['c'] is List) {
      return Map<String, dynamic>.from(payload);
    }
  } catch (_) {}
  return null;
}

class PortfolioVerification {
  final Map<String, dynamic> holder;
  final List<Map<String, dynamic>> credentials;
  const PortfolioVerification(this.holder, this.credentials);
  bool get allValid => credentials.isNotEmpty && credentials.every((c) => c['signatureValid'] == true);
}

PortfolioVerification verifyPortfolioPayload(Map<String, dynamic> payload, EcPoint? key) {
  final h = Map<String, dynamic>.from(payload['h'] as Map);
  final creds = (payload['c'] as List).map((raw) {
    final c = Map<String, dynamic>.from(raw as Map);
    final sig = _b64urlDecode(c['g'].toString());
    final check = verifyCredentialSignature(
      issuanceDate: c['dt'].toString(),
      subject: {
        'id': h['d'],
        'name': c['n'] ?? h['n'],
        'studentId': c['s'] ?? h['s'],
        'achievementTitle': c['t'],
        'issuingOrganization': c['o'],
        'competencyDomain': c['cd'],
        'attainedLevel': c['l'],
        'masteryScore': c['m'],
      },
      rHex: _toHex(sig.sublist(0, 32)),
      sHex: _toHex(sig.sublist(32, 64)),
      publicKey: key,
    );
    return <String, dynamic>{
      'id': c['i'],
      'achievementTitle': c['t'],
      'issuingOrganization': c['o'],
      'issuanceDate': c['dt'],
      'competencyDomain': c['cd'],
      'attainedLevel': c['l'],
      'masteryScore': c['m'],
      'state': 'Locked',
      'isPublic': true,
      'credentialHash': check.hash,
      'signatureValid': check.valid,
    };
  }).toList();
  return PortfolioVerification({
    'did': h['d'],
    'name': h['n'],
    'studentId': h['s'],
    'fieldOfStudy': h['f'],
    'university': h['u'],
  }, creds);
}
