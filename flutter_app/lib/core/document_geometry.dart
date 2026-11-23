// Port of shared/documentGeometry.js (Gate 1). Keep thresholds identical.
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

const _maxSkew = 0.08;
const _minMargin = 0.03;

bool _isPaper(int r, int g, int b) {
  final mx = math.max(r, math.max(g, b));
  final mn = math.min(r, math.min(g, b));
  final lum = 0.299 * r + 0.587 * g + 0.114 * b;
  final sat = mx == 0 ? 0 : (mx - mn) / mx;
  return lum >= 195 && sat <= 0.22;
}

double? _median(List<double> v) {
  if (v.isEmpty) return null;
  final s = [...v]..sort();
  return s[s.length ~/ 2];
}

double _edgeSlope(List<double?> profile) {
  final valid = <MapEntry<int, double>>[];
  for (var i = 0; i < profile.length; i++) {
    if (profile[i] != null) valid.add(MapEntry(i, profile[i]!));
  }
  if (valid.length < 8) return 0;
  final q = valid.length ~/ 4;
  final window = math.max(2, valid.length ~/ 10);
  double? sample(int c) => _median(valid.sublist(math.max(0, c - window), math.min(valid.length, c + window)).map((e) => e.value).toList());
  final i1 = valid[q].key;
  final i2 = valid[valid.length - 1 - q].key;
  final a = sample(q);
  final b = sample(valid.length - 1 - q);
  if (a == null || b == null || i1 == i2) return 0;
  return (b - a) / (i2 - i1);
}

Map<String, dynamic> analyzeDocumentGeometry(Uint8List rgba, int width, int height) {
  final mask = Uint8List(width * height);
  var paper = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      final i = (y * width + x) * 4;
      if (_isPaper(rgba[i], rgba[i + 1], rgba[i + 2])) {
        mask[y * width + x] = 1;
        paper++;
        minX = math.min(minX, x);
        maxX = math.max(maxX, x);
        minY = math.min(minY, y);
        maxY = math.max(maxY, y);
      }
    }
  }
  final paperRatio = paper / (width * height);
  final base = <String, dynamic>{
    'version': 2,
    'width': width,
    'height': height,
    'paperRatio': double.parse(paperRatio.toStringAsFixed(3)),
  };
  if (paper == 0 || maxX - minX < width * 0.2 || maxY - minY < height * 0.2) {
    return {...base, 'marginSides': 0, 'maxSkew': 0, 'spanRectangularity': 1, 'is3dMockup': false};
  }

  final margins = [minX / width, minY / height, (width - 1 - maxX) / width, (height - 1 - maxY) / height];
  final marginSides = margins.where((m) => m >= _minMargin).length;
  final boxW = maxX - minX + 1, boxH = maxY - minY + 1;

  final left = <double?>[], right = <double?>[];
  var spanArea = 0;
  for (var y = minY; y <= maxY; y++) {
    var l = -1, r = -1;
    for (var x = minX; x <= maxX; x++) {
      if (mask[y * width + x] == 1) {
        if (l < 0) l = x;
        r = x;
      }
    }
    final sig = l >= 0 && r - l >= boxW * 0.3;
    left.add(sig ? l.toDouble() : null);
    right.add(sig ? r.toDouble() : null);
    if (l >= 0) spanArea += r - l + 1;
  }
  final top = <double?>[], bottom = <double?>[];
  for (var x = minX; x <= maxX; x++) {
    var t = -1, b = -1;
    for (var y = minY; y <= maxY; y++) {
      if (mask[y * width + x] == 1) {
        if (t < 0) t = y;
        b = y;
      }
    }
    final sig = t >= 0 && b - t >= boxH * 0.3;
    top.add(sig ? t.toDouble() : null);
    bottom.add(sig ? b.toDouble() : null);
  }

  final maxSkew = [_edgeSlope(left), _edgeSlope(right), _edgeSlope(top), _edgeSlope(bottom)].map((v) => v.abs()).reduce(math.max);
  final rect = spanArea / (boxW * boxH);
  final is3d = marginSides >= 3 && paperRatio >= 0.12 && paperRatio <= 0.88 && maxSkew >= _maxSkew && rect < 0.97;
  return {
    ...base,
    'marginSides': marginSides,
    'maxSkew': double.parse(maxSkew.toStringAsFixed(3)),
    'spanRectangularity': double.parse(rect.toStringAsFixed(3)),
    'is3dMockup': is3d,
  };
}

/// Decodes image bytes at ~160px and runs the geometry check. Null for non-images.
Future<Map<String, dynamic>?> analyzeImageBytes(Uint8List bytes) async {
  try {
    final probe = await ui.instantiateImageCodec(bytes);
    final full = (await probe.getNextFrame()).image;
    final scale = math.min(1.0, 160 / math.max(full.width, full.height));
    final w = math.max(16, (full.width * scale).round());
    final h = math.max(16, (full.height * scale).round());
    final codec = await ui.instantiateImageCodec(bytes, targetWidth: w, targetHeight: h);
    final img = (await codec.getNextFrame()).image;
    final data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (data == null) return null;
    final result = analyzeDocumentGeometry(data.buffer.asUint8List(), img.width, img.height);
    return {...result, 'sourceWidth': full.width, 'sourceHeight': full.height};
  } catch (_) {
    return null;
  }
}
