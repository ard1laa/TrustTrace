import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../core/skill_taxonomy.dart';
import '../theme/trusttrace_theme.dart';

/// Multi-axis radar whose axes follow the holder's field of study.
class SkillRadar extends StatelessWidget {
  final List<Map<String, dynamic>> credentials;
  final FieldOfStudy field;
  final bool showLegend;
  const SkillRadar({super.key, required this.credentials, required this.field, this.showLegend = true});

  @override
  Widget build(BuildContext context) {
    final scores = SkillTaxonomy.scores(credentials, field);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AspectRatio(
          aspectRatio: 1.15,
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1),
            duration: const Duration(milliseconds: 550),
            curve: Curves.easeOutCubic,
            builder: (_, t, __) => CustomPaint(painter: _RadarPainter(scores, t, isDark, Theme.of(context).textTheme.bodySmall!)),
          ),
        ),
        if (showLegend) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 14,
            runSpacing: 4,
            alignment: WrapAlignment.center,
            children: [
              _legend(TrustTraceTheme.linkedInBlue, 'Verified skills', false),
              _legend(isDark ? const Color(0xFF6E7681) : const Color(0xFFA0A9B4), '${field.label} benchmark', true),
            ],
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, box) {
              final tileWidth = box.maxWidth >= 300 ? (box.maxWidth - 8) / 2 : box.maxWidth;
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: scores.map((s) => SizedBox(width: tileWidth, child: _ScoreTile(s))).toList(),
              );
            },
          ),
        ],
      ],
    );
  }

  Widget _legend(Color c, String label, bool dashed) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 14, height: 3, decoration: BoxDecoration(color: dashed ? c.withValues(alpha: 0.6) : c, borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 6),
          Flexible(child: Text(label, style: const TextStyle(fontSize: 11))),
        ],
      );
}

class _ScoreTile extends StatelessWidget {
  final AxisScore s;
  const _ScoreTile(this.s);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: isDark ? TrustTraceTheme.darkBg : TrustTraceTheme.lightBg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: s.color, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(s.axis, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
                Text('${s.count} credential${s.count == 1 ? '' : 's'}', style: TextStyle(fontSize: 10, color: Theme.of(context).hintColor)),
              ],
            ),
          ),
          Text('${s.score}%',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
                color: s.score >= s.benchmark ? TrustTraceTheme.successGreen : (s.score > 0 ? TrustTraceTheme.linkedInBlue : Colors.grey),
              )),
        ],
      ),
    );
  }
}

class _RadarPainter extends CustomPainter {
  final List<AxisScore> scores;
  final double t;
  final bool isDark;
  final TextStyle labelStyle;
  _RadarPainter(this.scores, this.t, this.isDark, this.labelStyle);

  @override
  void paint(Canvas canvas, Size size) {
    final n = scores.length;
    final center = Offset(size.width / 2, size.height / 2 + 4);
    final radius = math.min(size.width, size.height) / 2 - 42;
    Offset at(int i, double frac) {
      final angle = -math.pi / 2 + 2 * math.pi * i / n;
      return center + Offset(math.cos(angle), math.sin(angle)) * radius * frac;
    }

    final grid = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = isDark ? Colors.white.withValues(alpha: 0.09) : Colors.black.withValues(alpha: 0.08);
    for (final ring in [0.25, 0.5, 0.75, 1.0]) {
      canvas.drawPath(Path()..addPolygon([for (var i = 0; i < n; i++) at(i, ring)], true), grid);
    }
    for (var i = 0; i < n; i++) {
      canvas.drawLine(center, at(i, 1), grid);
    }

    final bench = Path()..addPolygon([for (var i = 0; i < n; i++) at(i, scores[i].benchmark / 100)], true);
    final benchPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..color = isDark ? const Color(0xFF6E7681) : const Color(0xFFA0A9B4);
    for (final metric in bench.computeMetrics()) {
      for (double d = 0; d < metric.length; d += 8) {
        canvas.drawPath(metric.extractPath(d, d + 4), benchPaint);
      }
    }

    final points = [for (var i = 0; i < n; i++) at(i, scores[i].score / 100 * t)];
    final shape = Path()..addPolygon(points, true);
    canvas.drawPath(shape, Paint()..color = TrustTraceTheme.linkedInBlue.withValues(alpha: 0.2));
    canvas.drawPath(
        shape,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = TrustTraceTheme.linkedInBlue);
    for (final p in points) {
      canvas.drawCircle(p, 3.5, Paint()..color = TrustTraceTheme.linkedInBlue);
    }

    for (var i = 0; i < n; i++) {
      final pos = at(i, 1.0) + (at(i, 1.0) - center) / radius * 18;
      final tp = TextPainter(
        text: TextSpan(
            text: scores[i].axis,
            style: labelStyle.copyWith(fontSize: 10.5, fontWeight: FontWeight.w700, color: isDark ? TrustTraceTheme.darkText : TrustTraceTheme.lightText)),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
        maxLines: 2,
      )..layout(maxWidth: 86);
      tp.paint(canvas, pos - Offset(tp.width / 2, tp.height / 2));
    }
  }

  @override
  bool shouldRepaint(covariant _RadarPainter old) => old.t != t || old.scores != scores || old.isDark != isDark;
}
