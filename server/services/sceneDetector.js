// Gate 1 — is this a flat document, or a certificate shown as an object in a
// 3D scene (on a desk, in a mock-up, photographed at an angle)?
//
// Colour masks alone confuse the two: a designed certificate with a coloured
// frame, diagonal ribbons or a decorative tilted card also leaves a white
// region with slanted edges. So the page's own layout casts the deciding vote:
//
//   1. Shape   — the largest paper region (holes filled) must be a clean
//                quadrilateral with background on 3+ sides. Ribbons and
//                swooshes leave 5-8 sided shapes and fail this test.
//   2. Motion  — that quad is either rotated (parallel sides, all tilted by θ)
//                or in perspective (opposite sides converge).
//   3. Text    — a real rotated sheet rotates its text by the same θ. A
//                decorative tilted card behind level text is a design.
//
// Outcomes: 'scene' (reject), 'possible' (registrar review), 'flat' (pass).
// Genuine designs are never rejected on shape alone.
import sharp from 'sharp';
import { analyzeDocumentGeometry, isPaper, GEOMETRY_VERSION } from '../../shared/documentGeometry.js';

const SIDE = 200;
const fmt = (n, d = 3) => Number(n.toFixed(d));
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function largestComponent(mask, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let best = { id: -1, size: 0 };
  let id = 0;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = id;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of next) {
        if (q >= 0 && mask[q] && label[q] < 0) {
          label[q] = id;
          queue[tail++] = q;
        }
      }
    }
    if (tail > best.size) best = { id, size: tail };
    id++;
  }
  const comp = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (label[i] === best.id) comp[i] = 1;
  return comp;
}

// Text, seals and photos inside the sheet are holes in the paper mask; fill them.
function fillHoles(comp, w, h) {
  const outside = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let tail = 0;
  const seed = (p) => {
    if (!comp[p] && !outside[p]) {
      outside[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  for (let head = 0; head < tail; head++) {
    const p = queue[head];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }
  const filled = new Uint8Array(w * h);
  let area = 0;
  for (let i = 0; i < w * h; i++) {
    if (!outside[i]) {
      filled[i] = 1;
      area++;
    }
  }
  return { filled, area };
}

function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const polyArea = (poly) => Math.abs(poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0)) / 2;
const triArea = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;

// Largest quadrilateral with corners on the hull (kept in hull order).
function maxQuad(hull) {
  let pts = hull;
  if (pts.length > 90) pts = Array.from({ length: 90 }, (_, i) => hull[Math.floor((i * hull.length) / 90)]);
  const n = pts.length;
  if (n < 4) return null;
  let best = { area: 0, quad: null };
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      let k1 = -1;
      let a1 = 0;
      for (let k = i + 1; k < j; k++) {
        const a = triArea(pts[i], pts[k], pts[j]);
        if (a > a1) [a1, k1] = [a, k];
      }
      let k2 = -1;
      let a2 = 0;
      for (let k = j + 1; k < n + i; k++) {
        const a = triArea(pts[i], pts[j], pts[k % n]);
        if (a > a2) [a2, k2] = [a, k % n];
      }
      if (k1 >= 0 && k2 >= 0 && a1 + a2 > best.area) best = { area: a1 + a2, quad: [pts[i], pts[k1], pts[j], pts[k2]] };
    }
  }
  return best.quad ? best : null;
}

// Signed deviation of a side from the nearest axis, in degrees (-45…45).
function axisDeviation(a, b) {
  const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return ((((deg + 45) % 90) + 90) % 90) - 45;
}

function paperShape(rgba, w, h) {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = isPaper(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) ? 1 : 0;
  const comp = largestComponent(mask, w, h);
  const { filled, area } = fillHoles(comp, w, h);
  if (area < w * h * 0.08) return null;

  const boundary = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!filled[p]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !filled[p - 1] || !filled[p + 1] || !filled[p - w] || !filled[p + w]) {
        boundary.push([x, y]);
      }
    }
  }
  const hull = convexHull(boundary);
  const hullArea = polyArea(hull);
  const quad = maxQuad(hull);
  if (!quad || !hullArea) return null;

  const sides = quad.quad.map((p, i) => axisDeviation(p, quad.quad[(i + 1) % 4]));
  const rotation = median(sides);
  const perspective = Math.max(Math.abs(sides[0] - sides[2]), Math.abs(sides[1] - sides[3]));
  return {
    areaRatio: fmt(area / (w * h)),
    solidity: fmt(area / hullArea),
    quadFit: fmt(Math.min(1, quad.area / area)),
    rotation: fmt(rotation, 1),
    perspective: fmt(perspective, 1)
  };
}

// Text orientation from layout OCR. Only engines that measure real line angles
// count (Cloud Vision, Apple Vision); Gemini boxes are axis-aligned.
function textOrientation(layout) {
  if (!layout?.hasBoxes || /gemini/i.test(layout.provider || '')) return { reliable: false };
  const lines = (layout.lines || []).filter((l) => l.box && l.text.replace(/[^A-Za-z]/g, '').length >= 6 && Number.isFinite(l.angle));
  if (lines.length < 3) return { reliable: false, lines: lines.length };
  const angles = lines.map((l) => l.angle);
  return { reliable: true, lines: lines.length, tilt: fmt(median(angles), 1), spread: fmt(median(angles.map((a) => Math.abs(a - median(angles)))), 1) };
}

export async function detectScene({ buffer, layout, visionSaysScene = null, clientGeometry = null }) {
  let geometry = null;
  let shape = null;
  try {
    const { data, info } = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize(SIDE, SIDE, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    geometry = analyzeDocumentGeometry(data, info.width, info.height);
    shape = paperShape(data, info.width, info.height);
  } catch {
    // Undecodable here (e.g. HEIC without codec): fall back to the client's measurement.
  }
  const text = textOrientation(layout);
  const g = geometry || (clientGeometry?.version === GEOMETRY_VERSION ? clientGeometry : null);
  const result = (verdict, reason) => ({ verdict, reason, geometry: g, shape, text, visionSaysScene });

  if (!g) return result('flat', 'Flat document (PDF or vector file).');

  const framed = g.marginSides >= 3 && g.paperRatio >= 0.12 && g.paperRatio <= 0.88;
  const cleanQuad = shape && shape.solidity >= 0.9 && shape.quadFit >= 0.92;
  const rotated = cleanQuad && Math.abs(shape.rotation) >= 3 && shape.perspective < 4;
  const perspective = cleanQuad && shape.perspective >= 4;

  if (!framed || !(rotated || perspective)) {
    if (visionSaysScene && framed && text.reliable && Math.abs(text.tilt) >= 3) {
      return result('possible', 'The vision model and the text angle suggest a photographed or mocked-up certificate.');
    }
    const shaped = framed && g.maxSkew >= 0.08 && !cleanQuad;
    return result('flat', shaped ? 'Flat document — slanted shapes are part of the certificate design.' : 'Flat document layout confirmed.');
  }

  if (rotated) {
    if (text.reliable) {
      const followsSheet = Math.abs(text.tilt - shape.rotation) <= 2.5 && Math.abs(text.tilt) >= 2 && text.spread <= 1.5;
      if (followsSheet) return result('scene', `The certificate is a sheet rotated ${Math.abs(shape.rotation).toFixed(0)}° inside a larger scene, and its text is rotated with it.`);
      if (Math.abs(text.tilt) < 1) return result('flat', 'Flat document — the tilted panel is a design element; the text is level.');
    }
    return visionSaysScene
      ? result('scene', 'The certificate appears as a rotated sheet in a 3D scene.')
      : result('possible', 'The certificate may be a rotated sheet inside a larger image.');
  }

  // Perspective: converging edges are a strong 3D cue, but some templates draw trapezoid panels.
  if (visionSaysScene || (text.reliable && Math.abs(text.tilt) >= 2)) {
    return result('scene', 'The certificate is shown in perspective (on a desk or at an angle).');
  }
  return result('possible', 'The certificate appears to be shown in perspective. A registrar will confirm it is a flat original.');
}
