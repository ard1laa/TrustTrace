import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../core/skill_taxonomy.dart';
import '../theme/trusttrace_theme.dart';

class _Node {
  final String id;
  final String label;
  final String kind; // root | axis | cred
  final Color color;
  final double radius;
  final Map<String, dynamic>? credential;
  final String badge;
  Offset pos;
  Offset disp = Offset.zero;
  _Node(this.id, this.label, this.kind, this.color, this.radius, this.pos, {this.credential, this.badge = ''});
}

/// Holder → skill axes → credentials, laid out with Fruchterman–Reingold
/// (f_a = d²/k, f_r = k²/d), the same model as the web D3 graph.
class SkillGraph extends StatefulWidget {
  final Map<String, dynamic> holder;
  final List<Map<String, dynamic>> credentials;
  final FieldOfStudy field;
  final double height;
  final ValueChanged<Map<String, dynamic>>? onTapCredential;
  const SkillGraph({super.key, required this.holder, required this.credentials, required this.field, this.height = 320, this.onTapCredential});

  @override
  State<SkillGraph> createState() => _SkillGraphState();
}

class _SkillGraphState extends State<SkillGraph> {
  List<_Node> _nodes = [];
  List<(int, int)> _edges = [];
  Size _laidOutFor = Size.zero;
  String _signature = '';

  void _layout(Size size) {
    final visible = widget.credentials.where((c) => c['isPublic'] != false && c['state'] != 'Draft').toList();
    final sig = '${widget.field.id}|${size.width.round()}|${visible.map((c) => '${c['id']}${c['state']}').join(',')}';
    if (sig == _signature) return;
    _signature = sig;
    _laidOutFor = size;

    final rnd = math.Random(7);
    final c = Offset(size.width / 2, size.height / 2);
    Offset jitter(double r) => c + Offset((rnd.nextDouble() - 0.5) * r, (rnd.nextDouble() - 0.5) * r);

    final nodes = <_Node>[_Node('root', (widget.holder['name'] ?? 'Holder').toString().split(' ').take(2).join(' '), 'root', TrustTraceTheme.linkedInBlue, 22, c, badge: 'DID')];
    final edges = <(int, int)>[];
    for (final axis in widget.field.axisNames) {
      final creds = visible.where((cr) => SkillTaxonomy.axisFor(cr, widget.field) == axis).toList();
      if (creds.isEmpty) continue;
      final avg = creds.map((cr) => num.tryParse('${cr['masteryScore']}') ?? 0).reduce((a, b) => a + b) / creds.length;
      final color = SkillTaxonomy.colorFor(widget.field, axis);
      nodes.add(_Node('axis-$axis', axis, 'axis', color, 18, jitter(160), badge: '${avg.round()}%'));
      final axisIdx = nodes.length - 1;
      edges.add((0, axisIdx));
      for (final cr in creds) {
        final revoked = cr['state'] == 'Revoked';
        final title = (cr['achievementTitle'] ?? '').toString();
        nodes.add(_Node('${cr['id']}', title.length > 20 ? '${title.substring(0, 18)}…' : title, 'cred', revoked ? TrustTraceTheme.dangerRed : color, 13, jitter(240),
            credential: cr, badge: revoked ? 'REV' : '${cr['masteryScore'] ?? ''}'));
        edges.add((axisIdx, nodes.length - 1));
      }
    }

    final k = 0.55 * math.sqrt(size.width * size.height / nodes.length);
    var temp = size.width / 8;
    for (var iter = 0; iter < 260; iter++) {
      for (final v in nodes) {
        v.disp = Offset.zero;
        for (final u in nodes) {
          if (identical(u, v)) continue;
          final delta = v.pos - u.pos;
          final d = math.max(delta.distance, 0.01);
          v.disp += delta / d * (k * k / d);
        }
      }
      for (final (a, b) in edges) {
        final delta = nodes[a].pos - nodes[b].pos;
        final d = math.max(delta.distance, 0.01);
        final force = delta / d * (d * d / k);
        nodes[a].disp -= force;
        nodes[b].disp += force;
      }
      for (final v in nodes) {
        final d = math.max(v.disp.distance, 0.01);
        v.pos += v.disp / d * math.min(d, temp);
        v.pos = Offset(v.pos.dx.clamp(44.0, size.width - 44), v.pos.dy.clamp(30.0, size.height - 34));
      }
      nodes[0].pos = Offset.lerp(nodes[0].pos, c, 0.2)!;
      temp *= 0.985;
    }
    _nodes = nodes;
    _edges = edges;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return LayoutBuilder(builder: (context, box) {
      final size = Size(box.maxWidth, widget.height);
      _layout(size);
      return ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Container(
          height: widget.height,
          color: isDark ? TrustTraceTheme.darkBg : const Color(0xFFFAF9F7),
          child: _nodes.length <= 1
              ? Center(child: Text('Verified credentials will appear here', style: TextStyle(color: Theme.of(context).hintColor, fontSize: 12.5)))
              : InteractiveViewer(
                  minScale: 0.6,
                  maxScale: 2.5,
                  boundaryMargin: const EdgeInsets.all(80),
                  child: GestureDetector(
                    onTapUp: (d) {
                      for (final n in _nodes.where((n) => n.kind == 'cred')) {
                        if ((n.pos - d.localPosition).distance <= n.radius + 8) {
                          widget.onTapCredential?.call(n.credential!);
                          return;
                        }
                      }
                    },
                    child: CustomPaint(size: _laidOutFor, painter: _GraphPainter(_nodes, _edges, isDark)),
                  ),
                ),
        ),
      );
    });
  }
}

class _GraphPainter extends CustomPainter {
  final List<_Node> nodes;
  final List<(int, int)> edges;
  final bool isDark;
  _GraphPainter(this.nodes, this.edges, this.isDark);

  @override
  void paint(Canvas canvas, Size size) {
    final edgePaint = Paint()
      ..strokeWidth = 1.6
      ..color = isDark ? const Color(0xFF30363D) : const Color(0xFFCBD5E1);
    for (final (a, b) in edges) {
      canvas.drawLine(nodes[a].pos, nodes[b].pos, edgePaint);
    }
    for (final n in nodes) {
      final isCred = n.kind == 'cred';
      canvas.drawCircle(n.pos, n.radius, Paint()..color = isCred ? (isDark ? TrustTraceTheme.darkBg : Colors.white) : n.color);
      canvas.drawCircle(
          n.pos,
          n.radius,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2.2
            ..color = n.color);
      _text(canvas, n.badge, n.pos, 8.5, isCred ? n.color : Colors.white, FontWeight.w800, 40);

      final labelPos = n.pos + Offset(0, n.radius + 10);
      final tp = _painter(n.label, 9.5, isDark ? TrustTraceTheme.darkText : TrustTraceTheme.lightText, FontWeight.w600, 110);
      final rect = RRect.fromRectAndRadius(Rect.fromCenter(center: labelPos, width: tp.width + 10, height: tp.height + 4), const Radius.circular(4));
      canvas.drawRRect(rect, Paint()..color = (isDark ? TrustTraceTheme.darkCard : Colors.white).withValues(alpha: 0.92));
      tp.paint(canvas, labelPos - Offset(tp.width / 2, tp.height / 2));
    }
  }

  TextPainter _painter(String s, double size, Color color, FontWeight weight, double maxW) => TextPainter(
        text: TextSpan(text: s, style: TextStyle(fontSize: size, color: color, fontWeight: weight)),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        ellipsis: '…',
      )..layout(maxWidth: maxW);

  void _text(Canvas c, String s, Offset center, double size, Color color, FontWeight w, double maxW) {
    final tp = _painter(s, size, color, w, maxW);
    tp.paint(c, center - Offset(tp.width / 2, tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _GraphPainter old) => old.nodes != nodes || old.isDark != isDark;
}
