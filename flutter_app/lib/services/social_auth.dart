import 'dart:io' show Platform;
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

/// Result of asking Google/Apple for an identity token.
/// [token] null and [error] null means the user cancelled.
class SocialToken {
  final String provider;
  final String? token;
  final String name;
  final String? error;
  const SocialToken(this.provider, {this.token, this.name = '', this.error});
}

/// Gets a verified identity token from Google or Apple. The server checks the
/// token's signature, issuer, audience and expiry before trusting it.
class SocialAuth {
  static const _channel = MethodChannel('trusttrace/file_picker');

  static Future<SocialToken> google(Map<String, dynamic> providers) async {
    final cfg = Map<String, dynamic>.from(providers['google'] ?? {});
    final iosClientId = cfg['iosClientId']?.toString();
    if (Platform.isIOS) {
      // The Google SDK crashes the app if its URL scheme is missing, so check first.
      final reversed = iosClientId == null ? '' : iosClientId.split('.').reversed.join('.');
      bool ok = false;
      if (reversed.isNotEmpty) {
        try {
          ok = await _channel.invokeMethod<bool>('hasUrlScheme', reversed) ?? false;
        } catch (_) {}
      }
      if (!ok) {
        return SocialToken('google',
            error: iosClientId == null
                ? 'Google sign-in needs GOOGLE_IOS_CLIENT_ID on the server for the iPhone app. See docs/SOCIAL_SIGN_IN.md.'
                : "This app build's Google URL scheme doesn't match the server's GOOGLE_IOS_CLIENT_ID. "
                    'Put the reversed ID ($reversed) in ios/Flutter/GoogleSignIn.xcconfig and rebuild — run ./start.sh check to compare.');
      }
    }
    try {
      final account = await GoogleSignIn(
        clientId: Platform.isIOS ? iosClientId : null,
        serverClientId: cfg['webClientId']?.toString(),
        scopes: const ['email', 'profile'],
      ).signIn();
      if (account == null) return const SocialToken('google'); // cancelled
      final idToken = (await account.authentication).idToken;
      if (idToken == null) {
        return const SocialToken('google', error: "Google didn't return an identity token. Check GOOGLE_CLIENT_ID (web client) is set on the server.");
      }
      return SocialToken('google', token: idToken, name: account.displayName ?? '');
    } on PlatformException catch (e) {
      if (e.code == 'sign_in_canceled') return const SocialToken('google');
      return SocialToken('google',
          error: e.code == 'network_error'
              ? 'Google sign-in needs an internet connection.'
              : 'Google sign-in failed (${e.code}). Check the Google client IDs — see docs/SOCIAL_SIGN_IN.md.');
    } catch (_) {
      return const SocialToken('google', error: 'Google sign-in failed. Please try again.');
    }
  }

  static Future<SocialToken> apple() async {
    try {
      final cred = await SignInWithApple.getAppleIDCredential(scopes: [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName]);
      final name = [cred.givenName, cred.familyName].whereType<String>().join(' ');
      return SocialToken('apple', token: cred.identityToken, name: name);
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) return const SocialToken('apple');
      return SocialToken('apple',
          error: e.code == AuthorizationErrorCode.unknown
              ? 'Sign in with Apple isn\'t enabled for this app build. Add the "Sign in with Apple" capability in Xcode (needs a paid Apple Developer account) — see docs/SOCIAL_SIGN_IN.md.'
              : 'Apple sign-in failed. Please try again.');
    } on SignInWithAppleNotSupportedException {
      return const SocialToken('apple', error: 'Sign in with Apple needs iOS 13 or later.');
    } catch (_) {
      return const SocialToken('apple', error: 'Apple sign-in failed. Please try again.');
    }
  }
}
