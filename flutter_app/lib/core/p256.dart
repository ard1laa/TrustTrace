// Offline ECDSA P-256 verification, mirroring server/crypto/ecdsaEngine.js.
import 'dart:convert';
import 'package:crypto/crypto.dart';

const issuerDid = 'did:trusttrace:university-registrar';

final BigInt _p = BigInt.parse('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff', radix: 16);
final BigInt _a = _p - BigInt.from(3);
final BigInt _n = BigInt.parse('ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551', radix: 16);
final EcPoint _g = EcPoint(
  BigInt.parse('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296', radix: 16),
  BigInt.parse('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5', radix: 16),
);

class EcPoint {
  final BigInt x;
  final BigInt y;
  const EcPoint(this.x, this.y);
}

EcPoint? _add(EcPoint? p1, EcPoint? p2) {
  if (p1 == null) return p2;
  if (p2 == null) return p1;
  if (p1.x == p2.x && p1.y != p2.y) return null;
  final BigInt lambda = p1.x == p2.x
      ? (BigInt.from(3) * p1.x * p1.x + _a) * (BigInt.two * p1.y).modInverse(_p) % _p
      : (p2.y - p1.y) * ((p2.x - p1.x) % _p).modInverse(_p) % _p;
  final x = (lambda * lambda - p1.x - p2.x) % _p;
  return EcPoint(x, (lambda * (p1.x - x) - p1.y) % _p);
}

EcPoint? _mul(BigInt k, EcPoint point) {
  EcPoint? result;
  EcPoint? addend = point;
  var n = k % _n;
  while (n > BigInt.zero) {
    if (n.isOdd) result = _add(result, addend);
    addend = _add(addend, addend);
    n = n >> 1;
  }
  return result;
}

/// Byte-identical to computeCredentialHash() on the server (key order matters).
String canonicalCredentialJson({
  required String issuanceDate,
  required Map<String, dynamic> subject,
  String issuer = issuerDid,
}) {
  final score = subject['masteryScore'];
  final num numericScore = score is num ? score : num.tryParse('$score') ?? 0;
  return jsonEncode({
    'issuer': issuer,
    'issuanceDate': issuanceDate,
    'credentialSubject': {
      'id': subject['id'],
      'name': subject['name'],
      'studentId': subject['studentId'] ?? '',
      'achievementTitle': subject['achievementTitle'],
      'issuingOrganization': subject['issuingOrganization'],
      'competencyDomain': subject['competencyDomain'],
      'attainedLevel': subject['attainedLevel'],
      // JS prints whole numbers without ".0".
      'masteryScore': numericScore == numericScore.roundToDouble() ? numericScore.toInt() : numericScore,
    },
  });
}

EcPoint? publicKeyFromDidDocument(Map<String, dynamic>? doc) {
  final methods = doc?['verificationMethod'];
  if (methods is! List || methods.isEmpty) return null;
  final vm = Map<String, dynamic>.from(methods.first as Map);
  final coords = vm['publicKeyCoordinates'];
  if (coords is Map && coords['Qx'] != null && coords['Qy'] != null) {
    return EcPoint(
      BigInt.parse(coords['Qx'].toString().replaceFirst('0x', ''), radix: 16),
      BigInt.parse(coords['Qy'].toString().replaceFirst('0x', ''), radix: 16),
    );
  }
  final hex = (vm['publicKeyHex'] ?? '').toString().replaceFirst('0x', '');
  if (hex.length == 130 && hex.startsWith('04')) {
    return EcPoint(BigInt.parse(hex.substring(2, 66), radix: 16), BigInt.parse(hex.substring(66), radix: 16));
  }
  return null;
}

class SignatureCheck {
  final bool valid;
  final String hash;
  const SignatureCheck(this.valid, this.hash);
}

SignatureCheck verifyCredentialSignature({
  required String issuanceDate,
  required Map<String, dynamic> subject,
  required String rHex,
  required String sHex,
  required EcPoint? publicKey,
}) {
  final digest = sha256.convert(utf8.encode(canonicalCredentialJson(issuanceDate: issuanceDate, subject: subject)));
  final hashHex = digest.toString();
  try {
    final r = BigInt.parse(rHex.replaceFirst('0x', ''), radix: 16);
    final s = BigInt.parse(sHex.replaceFirst('0x', ''), radix: 16);
    if (publicKey == null || r <= BigInt.zero || r >= _n || s <= BigInt.zero || s >= _n) {
      return SignatureCheck(false, '0x$hashHex');
    }
    final w = s.modInverse(_n);
    final z = BigInt.parse(hashHex, radix: 16) % _n;
    final point = _add(_mul(z * w % _n, _g), _mul(r * w % _n, publicKey));
    return SignatureCheck(point != null && point.x % _n == r, '0x$hashHex');
  } catch (_) {
    return SignatureCheck(false, '0x$hashHex');
  }
}

/// Verifies a credential record as returned by the API (with its embedded VC).
bool verifyStoredCredential(Map<String, dynamic> cred, EcPoint? key) {
  final vc = cred['verifiableCredential'];
  if (vc is! Map || vc['proof'] is! Map) return false;
  final proof = vc['proof'] as Map;
  return verifyCredentialSignature(
    issuanceDate: vc['issuanceDate'].toString(),
    subject: Map<String, dynamic>.from(vc['credentialSubject'] as Map),
    rHex: proof['r'].toString(),
    sHex: proof['s'].toString(),
    publicKey: key,
  ).valid;
}
