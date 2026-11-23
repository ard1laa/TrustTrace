import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class TrustTraceTheme {
  // Global 3-Way Theme Notifier ('Light' | 'Dark' | 'System')
  static final ValueNotifier<ThemeMode> themeModeNotifier =
      ValueNotifier<ThemeMode>(ThemeMode.light);

  // Exact LinkedIn Palette from Web App
  static const Color linkedInBlue = Color(0xFF0A66C2);
  static const Color linkedInHover = Color(0xFF004182);
  static const Color linkedInLightPill = Color(0xFFEBF3FB);
  static const Color successGreen = Color(0xFF057642);
  static const Color dangerRed = Color(0xFFC91A2B);
  static const Color warningAmber = Color(0xFFB45309);

  // Light Mode Colors
  static const Color lightBg = Color(0xFFF4F2EE);
  static const Color lightCard = Color(0xFFFFFFFF);
  static const Color lightBorder = Color(0xFFE0DFDC);
  static const Color lightText = Color(0xFF191919);
  static const Color lightSubtext = Color(0xFF666666);

  // Dark Mode Colors
  static const Color darkBg = Color(0xFF0D1117);
  static const Color darkCard = Color(0xFF1B1F23);
  static const Color darkBorder = Color(0xFF30363D);
  static const Color darkText = Color(0xFFE6EDF3);
  static const Color darkSubtext = Color(0xFF8B949E);

  /// Normalize role strings consistently across the entire app
  static String normalizeRole(dynamic rawRole) {
    final r = (rawRole ?? 'student').toString().trim().toLowerCase();
    if (r == 'admin' ||
        r == 'university' ||
        r == 'issuer' ||
        r == 'registrar' ||
        r.contains('admin')) {
      return 'admin';
    }
    if (r == 'recruiter' ||
        r == 'verifier' ||
        r == 'employer' ||
        r.contains('recruiter')) {
      return 'recruiter';
    }
    return 'student';
  }

  /// Truncate long cryptographic hashes, DIDs, and CIDs cleanly for iPhone screens
  static String truncateMiddle(String value, {int head = 14, int tail = 8}) {
    final clean = value.trim();
    if (clean.length <= head + tail + 3) return clean;
    return '${clean.substring(0, head)}...${clean.substring(clean.length - tail)}';
  }

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: lightBg,
      primaryColor: linkedInBlue,
      colorScheme: const ColorScheme.light(
        primary: linkedInBlue,
        secondary: linkedInHover,
        surface: lightCard,
        onSurface: lightText,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: lightCard,
        foregroundColor: lightText,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: lightCard,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: lightBorder, width: 1),
        ),
      ),
      dividerColor: lightBorder,
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: darkBg,
      primaryColor: linkedInBlue,
      colorScheme: const ColorScheme.dark(
        primary: Color(0xFF58A6FF),
        secondary: linkedInBlue,
        surface: darkCard,
        onSurface: darkText,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: darkCard,
        foregroundColor: darkText,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: darkCard,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: darkBorder, width: 1),
        ),
      ),
      dividerColor: darkBorder,
    );
  }
}

/// Custom Brand Logo Widget loading `assets/images/logo.png`
class BrandLogoBadge extends StatelessWidget {
  final double size;
  final double borderRadius;

  const BrandLogoBadge({
    super.key,
    this.size = 34,
    this.borderRadius = 8,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.08),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(
          color: isDark ? TrustTraceTheme.darkBorder : TrustTraceTheme.lightBorder,
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius * 0.75),
        child: Image.asset(
          'assets/images/logo.png',
          width: size,
          height: size,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Icon(
            Icons.verified_user,
            color: TrustTraceTheme.linkedInBlue,
            size: size * 0.65,
          ),
        ),
      ),
    );
  }
}

/// Truncated Cryptographic String Row with 1-Tap Copy for iPhone Viewports
class CopyableCryptoRow extends StatelessWidget {
  final String label;
  final String value;

  const CopyableCryptoRow({
    super.key,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final subColor =
        isDark ? TrustTraceTheme.darkSubtext : TrustTraceTheme.lightSubtext;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 82,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: subColor,
              ),
            ),
          ),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: isDark ? TrustTraceTheme.darkBg : TrustTraceTheme.lightBg,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: isDark
                      ? TrustTraceTheme.darkBorder
                      : TrustTraceTheme.lightBorder,
                ),
              ),
              child: Text(
                TrustTraceTheme.truncateMiddle(value, head: 14, tail: 8),
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 11.5,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
          const SizedBox(width: 6),
          InkWell(
            borderRadius: BorderRadius.circular(6),
            onTap: () {
              Clipboard.setData(ClipboardData(text: value));
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('$label copied to clipboard'),
                  duration: const Duration(seconds: 2),
                ),
              );
            },
            child: Padding(
              padding: const EdgeInsets.all(6),
              child: Icon(
                Icons.copy_rounded,
                size: 15,
                color: isDark
                    ? const Color(0xFF58A6FF)
                    : TrustTraceTheme.linkedInBlue,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Top AppBar 3-Way Theme Switcher Widget (Light | Dark | System) Compact for iPhone
class ThemeSwitcherBar extends StatelessWidget {
  const ThemeSwitcherBar({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: TrustTraceTheme.themeModeNotifier,
      builder: (context, currentMode, _) {
        final isDark = Theme.of(context).brightness == Brightness.dark;
        final bg = isDark ? TrustTraceTheme.darkBg : TrustTraceTheme.lightBg;
        final border =
            isDark ? TrustTraceTheme.darkBorder : TrustTraceTheme.lightBorder;

        return Container(
          margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildSegment(
                context: context,
                mode: ThemeMode.light,
                currentMode: currentMode,
                icon: Icons.wb_sunny_outlined,
                tooltip: 'Light Theme',
              ),
              _buildSegment(
                context: context,
                mode: ThemeMode.dark,
                currentMode: currentMode,
                icon: Icons.dark_mode_outlined,
                tooltip: 'Dark Theme',
              ),
              _buildSegment(
                context: context,
                mode: ThemeMode.system,
                currentMode: currentMode,
                icon: Icons.phone_iphone_outlined,
                tooltip: 'Follow Device Theme',
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSegment({
    required BuildContext context,
    required ThemeMode mode,
    required ThemeMode currentMode,
    required IconData icon,
    required String tooltip,
  }) {
    final active = mode == currentMode;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final activeBg =
        isDark ? TrustTraceTheme.darkCard : TrustTraceTheme.lightCard;
    final activeColor =
        isDark ? const Color(0xFF58A6FF) : TrustTraceTheme.linkedInBlue;
    final inactiveColor =
        isDark ? TrustTraceTheme.darkSubtext : TrustTraceTheme.lightSubtext;

    return Tooltip(
      message: tooltip,
      child: InkWell(
        borderRadius: BorderRadius.circular(6),
        onTap: () => TrustTraceTheme.themeModeNotifier.value = mode,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
          decoration: BoxDecoration(
            color: active ? activeBg : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(
            icon,
            size: 15,
            color: active ? activeColor : inactiveColor,
          ),
        ),
      ),
    );
  }
}
