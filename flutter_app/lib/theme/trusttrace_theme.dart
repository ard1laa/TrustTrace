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

  static ThemeData get lightTheme => _build(Brightness.light);

  static ThemeData get darkTheme => _build(Brightness.dark);

  /// One builder for both modes: soft layered elevation, stadium buttons with a
  /// press ripple, crisp tightened headings and roomy, uncluttered inputs.
  static ThemeData _build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final bg = dark ? darkBg : lightBg;
    final card = dark ? darkCard : lightCard;
    final border = dark ? darkBorder : lightBorder;
    final text = dark ? darkText : lightText;
    final subtext = dark ? darkSubtext : lightSubtext;
    final accent = dark ? const Color(0xFF58A6FF) : linkedInBlue;
    final scheme = dark
        ? ColorScheme.dark(primary: accent, secondary: linkedInBlue, surface: card, onSurface: text, outline: border, error: const Color(0xFFF85149))
        : ColorScheme.light(primary: accent, secondary: linkedInHover, surface: card, onSurface: text, outline: border, error: dangerRed);

    final base = ThemeData(useMaterial3: true, brightness: brightness, colorScheme: scheme);
    final textTheme = base.textTheme.apply(bodyColor: text, displayColor: text).copyWith(
          headlineSmall: base.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.4, color: text),
          titleLarge: base.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.3, color: text),
          titleMedium: base.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.15, color: text),
          bodySmall: base.textTheme.bodySmall?.copyWith(color: subtext),
          labelLarge: base.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: 0),
        );
    const stadium = StadiumBorder();
    final pressOverlay = WidgetStateProperty.resolveWith<Color?>((states) {
      if (states.contains(WidgetState.pressed)) return accent.withValues(alpha: 0.14);
      if (states.contains(WidgetState.hovered)) return accent.withValues(alpha: 0.06);
      return null;
    });

    return base.copyWith(
      scaffoldBackgroundColor: bg,
      primaryColor: linkedInBlue,
      textTheme: textTheme,
      dividerColor: border,
      highlightColor: Colors.transparent,
      splashFactory: InkRipple.splashFactory,
      appBarTheme: AppBarTheme(
        backgroundColor: card,
        foregroundColor: text,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        shadowColor: Colors.black.withValues(alpha: dark ? 0.5 : 0.08),
        surfaceTintColor: Colors.transparent,
        titleTextStyle: textTheme.titleMedium,
      ),
      cardTheme: CardThemeData(
        color: card,
        elevation: 1,
        shadowColor: Colors.black.withValues(alpha: dark ? 0.45 : 0.07),
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: border.withValues(alpha: dark ? 1 : 0.75), width: 1),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: ButtonStyle(
          shape: const WidgetStatePropertyAll(stadium),
          elevation: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.pressed) ? 0 : 0.5),
          shadowColor: WidgetStatePropertyAll(linkedInBlue.withValues(alpha: 0.35)),
          overlayColor: WidgetStatePropertyAll(Colors.white.withValues(alpha: 0.12)),
          textStyle: WidgetStatePropertyAll(textTheme.labelLarge),
          animationDuration: const Duration(milliseconds: 160),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          shape: const WidgetStatePropertyAll(stadium),
          side: WidgetStateProperty.resolveWith((s) => BorderSide(
                color: s.contains(WidgetState.disabled) ? border : accent.withValues(alpha: 0.85),
                width: 1.2,
              )),
          foregroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.disabled) ? subtext : accent),
          overlayColor: pressOverlay,
          textStyle: WidgetStatePropertyAll(textTheme.labelLarge),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: ButtonStyle(
          shape: const WidgetStatePropertyAll(stadium),
          overlayColor: pressOverlay,
          textStyle: WidgetStatePropertyAll(textTheme.labelLarge),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? bg : Colors.white,
        hintStyle: TextStyle(color: subtext.withValues(alpha: 0.8)),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: dark ? border : const Color(0xFFC0BFBC))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: accent, width: 1.6)),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        elevation: 6,
        backgroundColor: dark ? const Color(0xFF2D333B) : const Color(0xFF1F2328),
        contentTextStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13.5),
        actionTextColor: const Color(0xFF79C0FF),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: subtext.withValues(alpha: 0.35),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        indicatorColor: accent.withValues(alpha: dark ? 0.18 : 0.12),
        labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
              fontSize: 11.5,
              fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600,
              color: s.contains(WidgetState.selected) ? accent : subtext,
            )),
      ),
      chipTheme: base.chipTheme.copyWith(
        shape: const StadiumBorder(),
        side: BorderSide(color: border),
        backgroundColor: card,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: accent),
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
