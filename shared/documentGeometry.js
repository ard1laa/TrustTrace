// Gate 1 geometry check, run on the client before upload (web canvas, and a Dart
// port in flutter_app/lib/core/document_geometry.dart — keep them in sync).
//
// A flat scan, exported PDF page or designed certificate fills the frame: its
// paper region touches the image edges or sits inside an axis-aligned printed
// border. A "certificate on a desk" render shows the sheet as a skewed
// quadrilateral with background visible around it. We only flag the second case,
// and only when the skew is pronounced, so ordinary documents never fail.

export const GEOMETRY_VERSION = 2;
const MAX_SKEW = 0.08; // ~4.6° edge tilt
const MIN_MARGIN = 0.03; // background strip, as a fraction of the frame

export function isPaper(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = max === 0 ? 0 : (max - min) / max;
  return lum >= 195 && sat <= 0.22;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Slope of an edge profile (edge position per unit of travel), sampled at 25% and 75%.
function edgeSlope(profile) {
  const valid = profile.map((v, i) => [i, v]).filter(([, v]) => v !== null);
  if (valid.length < 8) return 0;
  const q = Math.floor(valid.length / 4);
  const window = Math.max(2, Math.floor(valid.length / 10));
  const sample = (center) => median(valid.slice(Math.max(0, center - window), center + window).map(([, v]) => v));
  const [i1] = valid[q];
  const [i2] = valid[valid.length - 1 - q];
  const a = sample(q);
  const b = sample(valid.length - 1 - q);
  if (a === null || b === null || i2 === i1) return 0;
  return (b - a) / (i2 - i1);
}

// rgba: Uint8ClampedArray/Uint8Array of width*height*4.
export function analyzeDocumentGeometry(rgba, width, height) {
  const mask = new Uint8Array(width * height);
  let paperCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (isPaper(rgba[i], rgba[i + 1], rgba[i + 2])) {
        mask[y * width + x] = 1;
        paperCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const paperRatio = paperCount / (width * height);
  const base = { version: GEOMETRY_VERSION, width, height, paperRatio: Number(paperRatio.toFixed(3)) };
  if (paperCount === 0 || maxX - minX < width * 0.2 || maxY - minY < height * 0.2) {
    return { ...base, marginSides: 0, maxSkew: 0, spanRectangularity: 1, is3dMockup: false };
  }

  const margins = [minX / width, minY / height, (width - 1 - maxX) / width, (height - 1 - maxY) / height];
  const marginSides = margins.filter((m) => m >= MIN_MARGIN).length;

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const left = [];
  const right = [];
  let spanArea = 0;
  for (let y = minY; y <= maxY; y++) {
    let l = -1;
    let r = -1;
    for (let x = minX; x <= maxX; x++) {
      if (mask[y * width + x]) {
        if (l < 0) l = x;
        r = x;
      }
    }
    const significant = l >= 0 && r - l >= boxW * 0.3;
    left.push(significant ? l : null);
    right.push(significant ? r : null);
    if (l >= 0) spanArea += r - l + 1;
  }

  const top = [];
  const bottom = [];
  for (let x = minX; x <= maxX; x++) {
    let t = -1;
    let b = -1;
    for (let y = minY; y <= maxY; y++) {
      if (mask[y * width + x]) {
        if (t < 0) t = y;
        b = y;
      }
    }
    const significant = t >= 0 && b - t >= boxH * 0.3;
    top.push(significant ? t : null);
    bottom.push(significant ? b : null);
  }

  const slopes = [edgeSlope(left), edgeSlope(right), edgeSlope(top), edgeSlope(bottom)].map(Math.abs);
  const maxSkew = Math.max(...slopes);
  const spanRectangularity = spanArea / (boxW * boxH);

  const is3dMockup =
    marginSides >= 3 && paperRatio >= 0.12 && paperRatio <= 0.88 && maxSkew >= MAX_SKEW && spanRectangularity < 0.97;

  return {
    ...base,
    marginSides,
    maxSkew: Number(maxSkew.toFixed(3)),
    spanRectangularity: Number(spanRectangularity.toFixed(3)),
    is3dMockup
  };
}

// Browser helper: downsample an image data URL and analyze it.
export function analyzeImageDataUrl(dataUrl, maxSide = 160) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(16, Math.round(img.naturalWidth * scale));
        const h = Math.max(16, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const result = analyzeDocumentGeometry(ctx.getImageData(0, 0, w, h).data, w, h);
        resolve({ ...result, sourceWidth: img.naturalWidth, sourceHeight: img.naturalHeight });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
