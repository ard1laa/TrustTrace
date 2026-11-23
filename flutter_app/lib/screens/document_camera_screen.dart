import 'dart:math' as math;
import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;
import '../theme/trusttrace_theme.dart';

/// A certificate photo cropped to the on-screen guide, with quality readings.
class CapturedDocument {
  final Uint8List jpeg;
  final int width;
  final int height;
  final double sharpness;
  final double glare;
  final double brightness;
  const CapturedDocument(this.jpeg, this.width, this.height, this.sharpness, this.glare, this.brightness);

  bool get isBlurry => sharpness < 60;
  bool get hasGlare => glare > 0.06;
  bool get isDark => brightness < 70;
  bool get looksGood => !isBlurry && !hasGlare && !isDark;
  String get fileName => 'certificate_scan_${DateTime.now().millisecondsSinceEpoch}.jpg';
}

/// KYC-style capture: instructions first, then a framed camera.
/// Returns null if the user cancels.
Future<CapturedDocument?> captureDocument(BuildContext context, {String title = 'Scan your certificate'}) {
  return Navigator.of(context).push<CapturedDocument>(
    MaterialPageRoute(fullscreenDialog: true, builder: (_) => _CaptureInstructions(title: title)),
  );
}

// ---------------------------------------------------------------------------
// Step 1 — instructions
// ---------------------------------------------------------------------------
class _CaptureInstructions extends StatelessWidget {
  final String title;
  const _CaptureInstructions({required this.title});

  @override
  Widget build(BuildContext context) {
    final hint = Theme.of(context).hintColor;
    return Scaffold(
      appBar: AppBar(leading: const CloseButton(), title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17))),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              const _FrameIllustration(),
              const SizedBox(height: 28),
              const Text('Before you scan', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
              const SizedBox(height: 6),
              Text('A clear photo lets us read and verify your certificate automatically.',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: hint, height: 1.35)),
              const SizedBox(height: 24),
              const _Tip(icon: Icons.crop_landscape_rounded, title: 'Flat and well-lit', body: 'Place the certificate on a flat surface in good light.'),
              const _Tip(icon: Icons.wb_sunny_outlined, title: 'No glare or shadows', body: 'Avoid reflections from lamps and keep your shadow off the page.'),
              const _Tip(icon: Icons.center_focus_strong_outlined, title: 'Sharp and readable', body: 'Fill the frame and hold still until every line of text is in focus.'),
              const Spacer(flex: 2),
              FilledButton.icon(
                onPressed: () async {
                  final nav = Navigator.of(context);
                  final result = await nav.push<CapturedDocument>(MaterialPageRoute(builder: (_) => const _DocumentCamera()));
                  if (result != null) nav.pop(result);
                },
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), shape: const StadiumBorder()),
                icon: const Icon(Icons.photo_camera_rounded),
                label: const Text('Open camera', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tip extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;
  const _Tip({required this.icon, required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: TrustTraceTheme.linkedInBlue.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: TrustTraceTheme.linkedInBlue, size: 21),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
            const SizedBox(height: 2),
            Text(body, style: TextStyle(fontSize: 13, color: Theme.of(context).hintColor, height: 1.3)),
          ]),
        ),
      ]),
    );
  }
}

class _FrameIllustration extends StatelessWidget {
  const _FrameIllustration();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Center(
      child: SizedBox(
        width: 200,
        height: 140,
        child: CustomPaint(
          painter: _CornerPainter(color: TrustTraceTheme.linkedInBlue, length: 26, stroke: 4, radius: 14),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Container(
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1B1F23) : Colors.white,
                borderRadius: BorderRadius.circular(6),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 14, offset: const Offset(0, 6))],
              ),
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              child: Column(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                for (final w in [0.5, 0.8, 0.62, 0.35])
                  FractionallySizedBox(
                    widthFactor: w,
                    child: Container(height: w == 0.8 ? 7 : 4, decoration: BoxDecoration(color: Colors.grey.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(3))),
                  ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Step 2 — framed camera
// ---------------------------------------------------------------------------
class _DocumentCamera extends StatefulWidget {
  const _DocumentCamera();

  @override
  State<_DocumentCamera> createState() => _DocumentCameraState();
}

class _DocumentCameraState extends State<_DocumentCamera> with WidgetsBindingObserver {
  CameraController? _controller;
  String? _error;
  bool _landscapeDoc = true;
  bool _torch = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      c.dispose();
      _controller = null;
    } else if (state == AppLifecycleState.resumed) {
      _start();
    }
  }

  Future<void> _start() async {
    try {
      final cameras = await availableCameras();
      final back = cameras.firstWhere((c) => c.lensDirection == CameraLensDirection.back, orElse: () => cameras.first);
      final controller = CameraController(back, ResolutionPreset.max, enableAudio: false, imageFormatGroup: ImageFormatGroup.jpeg);
      await controller.initialize();
      await controller.lockCaptureOrientation(DeviceOrientation.portraitUp);
      await controller.setFlashMode(FlashMode.off);
      if (!mounted) return controller.dispose();
      setState(() {
        _controller = controller;
        _error = null;
      });
    } on CameraException catch (e) {
      setState(() => _error = e.code == 'CameraAccessDenied' || e.code == 'CameraAccessDeniedWithoutPrompt'
          ? 'Camera access is off. Enable it for TrustTrace in Settings → Privacy → Camera.'
          : 'The camera could not start (${e.description ?? e.code}).');
    } catch (_) {
      setState(() => _error = 'No camera is available on this device.');
    }
  }

  /// The guide rectangle in screen coordinates.
  Rect _guide(Size size) {
    final ratio = _landscapeDoc ? 1 / 1.414 : 1.414; // height / width
    var w = size.width * 0.88;
    var h = w * ratio;
    final maxH = size.height * 0.62;
    if (h > maxH) {
      h = maxH;
      w = h / ratio;
    }
    return Rect.fromCenter(center: Offset(size.width / 2, size.height * 0.46), width: w, height: h);
  }

  Future<void> _capture(Size screen) async {
    final c = _controller;
    if (c == null || _busy) return;
    setState(() => _busy = true);
    HapticFeedback.mediumImpact();
    try {
      final shot = await c.takePicture();
      final bytes = await shot.readAsBytes();
      if (_torch) await c.setFlashMode(FlashMode.off);
      final guide = _guide(screen);
      final result = await compute(_processCapture, _CropRequest(bytes, screen.width, screen.height, guide.left, guide.top, guide.width, guide.height));
      if (!mounted) return;
      setState(() {
        _busy = false;
        _torch = false;
      });
      final accepted = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _CaptureReview(doc: result)));
      if (accepted == true && mounted) Navigator.of(context).pop(result);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not take the photo. Please try again.')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;
    return Scaffold(
      backgroundColor: Colors.black,
      body: LayoutBuilder(builder: (context, box) {
        final screen = Size(box.maxWidth, box.maxHeight);
        final guide = _guide(screen);
        return Stack(fit: StackFit.expand, children: [
          if (c != null && c.value.isInitialized)
            GestureDetector(
              onTapDown: (d) {
                final p = Offset(d.localPosition.dx / screen.width, d.localPosition.dy / screen.height);
                c.setFocusPoint(p).catchError((_) {});
                c.setExposurePoint(p).catchError((_) {});
              },
              child: ClipRect(
                child: FittedBox(
                  fit: BoxFit.cover,
                  child: SizedBox(
                    // The plugin reports a landscape aspect ratio; the UI is portrait.
                    width: screen.width,
                    height: screen.width * c.value.aspectRatio,
                    child: CameraPreview(c),
                  ),
                ),
              ),
            )
          else
            Center(
              child: _error == null
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Padding(
                      padding: const EdgeInsets.all(32),
                      child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 15, height: 1.4)),
                    ),
            ),
          // Dimmed surround with a clear cut-out and corner brackets.
          IgnorePointer(child: CustomPaint(painter: _OverlayPainter(guide))),
          IgnorePointer(
            child: CustomPaint(painter: _CornerPainter(color: Colors.white, length: 30, stroke: 4, radius: 16, rect: guide)),
          ),
          // Top bar
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(children: [
                IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, color: Colors.white)),
                const Spacer(),
                IconButton(
                  tooltip: _torch ? 'Turn off light' : 'Turn on light',
                  onPressed: c == null
                      ? null
                      : () async {
                          setState(() => _torch = !_torch);
                          await c.setFlashMode(_torch ? FlashMode.torch : FlashMode.off).catchError((_) {});
                        },
                  icon: Icon(_torch ? Icons.flash_on_rounded : Icons.flash_off_rounded, color: Colors.white),
                ),
              ]),
            ),
          ),
          // Prompt above the frame
          Positioned(
            left: 24,
            right: 24,
            top: math.max(guide.top - 64, MediaQuery.of(context).padding.top + 56),
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(20)),
                child: const Text('Align the certificate inside the frame',
                    textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13.5)),
              ),
            ),
          ),
          // Bottom controls
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(28, 0, 28, 24),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  _RoundButton(
                    icon: _landscapeDoc ? Icons.crop_portrait_rounded : Icons.crop_landscape_rounded,
                    label: _landscapeDoc ? 'Portrait' : 'Landscape',
                    onTap: () => setState(() => _landscapeDoc = !_landscapeDoc),
                  ),
                  Semantics(
                    button: true,
                    label: 'Take photo',
                    child: GestureDetector(
                      onTap: c == null || _busy ? null : () => _capture(screen),
                      child: Container(
                        width: 78,
                        height: 78,
                        padding: const EdgeInsets.all(5),
                        decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 4)),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          decoration: BoxDecoration(shape: BoxShape.circle, color: _busy ? Colors.white38 : Colors.white),
                          child: _busy ? const Padding(padding: EdgeInsets.all(18), child: CircularProgressIndicator(strokeWidth: 3)) : null,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 64),
                ]),
              ),
            ),
          ),
        ]);
      }),
    );
  }
}

class _RoundButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _RoundButton({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 64,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Material(
          color: Colors.white.withValues(alpha: 0.16),
          shape: const CircleBorder(),
          child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: Padding(padding: const EdgeInsets.all(12), child: Icon(icon, color: Colors.white))),
        ),
        const SizedBox(height: 6),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
      ]),
    );
  }
}

class _OverlayPainter extends CustomPainter {
  final Rect guide;
  _OverlayPainter(this.guide);

  @override
  void paint(Canvas canvas, Size size) {
    final outer = Path()..addRect(Offset.zero & size);
    final hole = Path()..addRRect(RRect.fromRectAndRadius(guide, const Radius.circular(16)));
    canvas.drawPath(Path.combine(PathOperation.difference, outer, hole), Paint()..color = Colors.black.withValues(alpha: 0.58));
    canvas.drawRRect(
      RRect.fromRectAndRadius(guide, const Radius.circular(16)),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Colors.white.withValues(alpha: 0.35),
    );
  }

  @override
  bool shouldRepaint(covariant _OverlayPainter old) => old.guide != guide;
}

class _CornerPainter extends CustomPainter {
  final Color color;
  final double length;
  final double stroke;
  final double radius;
  final Rect? rect;
  _CornerPainter({required this.color, required this.length, required this.stroke, required this.radius, this.rect});

  @override
  void paint(Canvas canvas, Size size) {
    final r = rect ?? (Offset.zero & size);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    final k = radius;
    final path = Path()
      // top-left
      ..moveTo(r.left, r.top + length)
      ..lineTo(r.left, r.top + k)
      ..arcToPoint(Offset(r.left + k, r.top), radius: Radius.circular(k))
      ..lineTo(r.left + length, r.top)
      // top-right
      ..moveTo(r.right - length, r.top)
      ..lineTo(r.right - k, r.top)
      ..arcToPoint(Offset(r.right, r.top + k), radius: Radius.circular(k))
      ..lineTo(r.right, r.top + length)
      // bottom-right
      ..moveTo(r.right, r.bottom - length)
      ..lineTo(r.right, r.bottom - k)
      ..arcToPoint(Offset(r.right - k, r.bottom), radius: Radius.circular(k))
      ..lineTo(r.right - length, r.bottom)
      // bottom-left
      ..moveTo(r.left + length, r.bottom)
      ..lineTo(r.left + k, r.bottom)
      ..arcToPoint(Offset(r.left, r.bottom - k), radius: Radius.circular(k))
      ..lineTo(r.left, r.bottom - length);
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _CornerPainter old) => old.rect != rect || old.color != color;
}

// ---------------------------------------------------------------------------
// Step 3 — review the crop
// ---------------------------------------------------------------------------
class _CaptureReview extends StatelessWidget {
  final CapturedDocument doc;
  const _CaptureReview({required this.doc});

  @override
  Widget build(BuildContext context) {
    final checks = [
      (!doc.isBlurry, doc.isBlurry ? 'Text looks blurry' : 'Text is sharp', Icons.center_focus_strong_outlined),
      (!doc.hasGlare, doc.hasGlare ? 'Glare on the page' : 'No glare', Icons.wb_sunny_outlined),
      (!doc.isDark, doc.isDark ? 'Too dark' : 'Good lighting', Icons.light_mode_outlined),
    ];
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Check your photo', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
      ),
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Center(child: ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.memory(doc.jpeg, fit: BoxFit.contain))),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final (ok, label, icon) in checks)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: (ok ? TrustTraceTheme.successGreen : TrustTraceTheme.warningAmber).withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(ok ? Icons.check_circle_rounded : icon, size: 15, color: ok ? TrustTraceTheme.successGreen : TrustTraceTheme.warningAmber),
                      const SizedBox(width: 5),
                      Text(label, style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600)),
                    ]),
                  ),
              ],
            ),
          ),
          if (!doc.looksGood)
            const Padding(
              padding: EdgeInsets.fromLTRB(24, 12, 24, 0),
              child: Text('A retake usually gives a faster, more reliable verification.',
                  textAlign: TextAlign.center, style: TextStyle(color: Colors.white70, fontSize: 12.5)),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context, false),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white38),
                    minimumSize: const Size.fromHeight(50),
                    shape: const StadiumBorder(),
                  ),
                  child: const Text('Retake', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () => Navigator.pop(context, true),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50), shape: const StadiumBorder()),
                  child: const Text('Use photo', style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Image processing (runs in a background isolate)
// ---------------------------------------------------------------------------
class _CropRequest {
  final Uint8List bytes;
  final double screenW, screenH, left, top, width, height;
  const _CropRequest(this.bytes, this.screenW, this.screenH, this.left, this.top, this.width, this.height);
}

CapturedDocument _processCapture(_CropRequest r) {
  final decoded = img.decodeImage(r.bytes);
  if (decoded == null) throw StateError('Unreadable photo');
  final photo = img.bakeOrientation(decoded);

  // The preview fills the screen with BoxFit.cover; map the guide back onto the photo.
  final scale = math.max(r.screenW / photo.width, r.screenH / photo.height);
  final offX = (r.screenW - photo.width * scale) / 2;
  final offY = (r.screenH - photo.height * scale) / 2;
  const margin = 0.02; // keep a sliver of border so no text is clipped
  final x0 = (((r.left - offX) / scale) - r.width / scale * margin).clamp(0, photo.width - 1).round();
  final y0 = (((r.top - offY) / scale) - r.height / scale * margin).clamp(0, photo.height - 1).round();
  final x1 = (((r.left + r.width - offX) / scale) + r.width / scale * margin).clamp(1, photo.width).round();
  final y1 = (((r.top + r.height - offY) / scale) + r.height / scale * margin).clamp(1, photo.height).round();
  var doc = img.copyCrop(photo, x: x0, y: y0, width: math.max(1, x1 - x0), height: math.max(1, y1 - y0));
  if (doc.width > 2400) doc = img.copyResize(doc, width: 2400, interpolation: img.Interpolation.average);

  // Quality readings on a small greyscale copy.
  final small = img.copyResize(doc, width: math.min(560, doc.width), interpolation: img.Interpolation.average);
  final w = small.width;
  final h = small.height;
  final rgb = small.getBytes(order: img.ChannelOrder.rgb);
  final lum = Float64List(w * h);
  var sum = 0.0;
  var clipped = 0;
  for (var i = 0, p = 0; i < w * h; i++, p += 3) {
    final l = 0.299 * rgb[p] + 0.587 * rgb[p + 1] + 0.114 * rgb[p + 2];
    lum[i] = l;
    sum += l;
    if (rgb[p] >= 252 && rgb[p + 1] >= 252 && rgb[p + 2] >= 252) clipped++;
  }
  // Variance of the Laplacian: low values mean soft, out-of-focus text.
  var lapSum = 0.0;
  var lapSq = 0.0;
  var n = 0;
  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      final i = y * w + x;
      final v = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w];
      lapSum += v;
      lapSq += v * v;
      n++;
    }
  }
  final mean = n == 0 ? 0.0 : lapSum / n;
  final sharpness = n == 0 ? 0.0 : lapSq / n - mean * mean;

  return CapturedDocument(
    Uint8List.fromList(img.encodeJpg(doc, quality: 92)),
    doc.width,
    doc.height,
    sharpness,
    clipped / (w * h),
    sum / (w * h),
  );
}

/// Exposed for tests: runs the crop/quality pipeline on raw JPEG bytes.
@visibleForTesting
CapturedDocument processCaptureForTest(Uint8List bytes, Size screen, Rect guide) =>
    _processCapture(_CropRequest(bytes, screen.width, screen.height, guide.left, guide.top, guide.width, guide.height));
