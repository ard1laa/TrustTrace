import '../core/p256.dart';
import '../core/portfolio_qr.dart';
import 'api_service.dart';

class VerificationOutcome {
  final bool offline;
  final Map<String, dynamic> holder;
  final List<Map<String, dynamic>> credentials; // each has signatureValid + revoked
  final String? error;
  const VerificationOutcome({this.offline = false, this.holder = const {}, this.credentials = const [], this.error});

  bool get anyInvalid => credentials.any((c) => c['signatureValid'] != true);
}

/// Verifies whatever a QR or pasted link contains.
/// Portfolio QRs are checked locally first; the server is then asked for live
/// status. With no connection, the local result is returned and flagged offline.
class VerificationService {
  static Future<VerificationOutcome> verify(String raw) async {
    final text = raw.trim();
    final payload = decodePortfolioText(text);
    await ApiService.refreshIssuerDid();
    final key = ApiService.cachedIssuerKey();

    // Without the registrar's public key no signature can be checked — say so
    // instead of marking every credential invalid.
    if (key == null) {
      return const VerificationOutcome(
          error: "Couldn't get the registrar's public key to check signatures. Connect to the server once, then scan again.");
    }
    final local = payload != null ? verifyPortfolioPayload(payload, key) : null;

    final res = await ApiService.verifyLookup(_lookupFrom(text, payload));
    if (res.ok) {
      final holder = Map<String, dynamic>.from((res.data['candidate'] ?? local?.holder ?? {}) as Map);
      final creds = ApiService.credentialsOf(res.data['candidateCredentials'])
          .map((c) => {...c, 'signatureValid': verifyStoredCredential(c, key), 'revoked': c['state'] == 'Revoked'})
          .toList();
      return VerificationOutcome(holder: holder, credentials: creds);
    }
    if (res.timedOut) {
      return const VerificationOutcome(error: 'The server took too long to respond (slow connection, or it is starting up). Try again in a moment.');
    }
    if (local != null && res.offline) {
      return VerificationOutcome(
        offline: true,
        holder: local.holder,
        credentials: local.credentials.map((c) => {...c, 'revoked': false}).toList(),
      );
    }
    if (res.offline) {
      return VerificationOutcome(
          error: extractShareCode(text) != null
              ? "You're offline. Quick-scan QR codes need a connection to fetch the signed credentials — reconnect, or ask the candidate to show their Offline QR."
              : "You're offline and this code doesn't carry signed credentials. Ask the candidate for their TrustTrace Offline QR.");
    }
    return VerificationOutcome(error: res.error ?? 'No matching candidate was found.');
  }

  static String _lookupFrom(String text, Map<String, dynamic>? payload) {
    if (payload != null) return payload['h']['d'].toString();
    final code = extractShareCode(text);
    if (code != null) return code;
    final uri = Uri.tryParse(text);
    if (uri != null && uri.hasScheme) {
      return uri.queryParameters['did'] ?? uri.queryParameters['student'] ?? uri.queryParameters['verify'] ?? text;
    }
    return text;
  }
}
