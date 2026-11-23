// Tamper forensics around the recipient's name.
//
// A forged certificate is usually a genuine one with the name replaced. The
// pasted text has a different history from the rest of the page, which shows
// up as:
//   • Error level analysis — re-saving at several JPEG qualities and comparing
//     how each text line responds ("JPEG ghosts"). Lines that were saved
//     together respond identically; a pasted name doesn't.
//   • Sensor-noise mismatch — a pasted name on a photo is noise-free.
//   • Layout anomalies — off the centre axis, skewed differently, or a font
//     size/baseline jump inside a sentence.
// Every metric compares the name to the other text lines on the same document,
// so genuine designs (script fonts, coloured names) aren't penalised.
//
// PDFs are checked structurally instead: incremental edits and editor tools.
import sharp from 'sharp';

const EDITOR_SOFTWARE = /photoshop|gimp|pixelmator|affinity\s+photo|picsart|snapseed|lightroom|photopea|fotor|polarr|paint\.net|krita|inpaint|remove\.bg|facetune|pixlr/i;
const PDF_EDITORS = /pdfescape|sejda|ilovepdf|smallpdf|pdf-?xchange|foxit\s+(?:phantom|editor)|pdfelement|wondershare|pdffiller|docfly|xodo|nitro|pdf\s*candy|pdf24|online\s*pdf\s*editor|soda\s*pdf|able2extract|pdf\s*buddy|dochub/i;

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mad = (arr) => {
  const m = median(arr);
  return median(arr.map((v) => Math.abs(v - m)));
};
const fmt = (n, d = 2) => Number(n.toFixed(d));

// ---------------------------------------------------------------------------
// Pixel helpers
// ---------------------------------------------------------------------------
const GHOST_QUALITIES = [50, 60, 65, 70, 75, 80, 85, 90, 95];

// Greyscale at native resolution (resampling would erase the JPEG grid),
// cropped to the text area on 8-pixel boundaries so block alignment survives.
async function loadRaster(buffer, lines) {
  const oriented = await sharp(buffer, { failOn: 'none' }).rotate().removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = oriented.info;
  const xs = lines.flatMap((l) => [l.box.x, l.box.x + l.box.w]);
  const ys = lines.flatMap((l) => [l.box.y - l.box.h * 0.7, l.box.y + l.box.h * 1.7]);
  const left = Math.max(0, Math.floor((Math.min(...xs) * width - 8) / 8) * 8);
  const top = Math.max(0, Math.floor((Math.min(...ys) * height - 8) / 8) * 8);
  const right = Math.min(width, Math.ceil(Math.max(...xs) * width + 8));
  const bottom = Math.min(height, Math.ceil(Math.max(...ys) * height + 8));
  const cw = right - left;
  const ch = bottom - top;
  const lum = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) lum.set(oriented.data.subarray((y + top) * width + left, (y + top) * width + left + cw), y * cw);
  return { fullWidth: width, fullHeight: height, left, top, width: cw, height: ch, lum };
}

function rectOf(box, r, padY = 0.15, padX = 0.02) {
  const x0 = Math.max(0, Math.floor((box.x - box.w * padX) * r.fullWidth) - r.left);
  const x1 = Math.min(r.width, Math.ceil((box.x + box.w * (1 + padX)) * r.fullWidth) - r.left);
  const y0 = Math.max(0, Math.floor((box.y - box.h * padY) * r.fullHeight) - r.top);
  const y1 = Math.min(r.height, Math.ceil((box.y + box.h * (1 + padY)) * r.fullHeight) - r.top);
  return { x0, x1, y0, y1 };
}

// JPEG ghosts: re-save at several qualities and record, per region, how much
// it changes. Regions that share a compression history share a curve shape.
async function ghostCurves(r, rects) {
  const curves = rects.map(() => []);
  for (const q of GHOST_QUALITIES) {
    const jpeg = await sharp(r.lum, { raw: { width: r.width, height: r.height, channels: 1 } }).jpeg({ quality: q }).toBuffer();
    const { data } = await sharp(jpeg).greyscale().raw().toBuffer({ resolveWithObject: true });
    rects.forEach((rect, k) => {
      let sum = 0;
      let n = 0;
      for (let y = rect.y0; y < rect.y1; y++) {
        for (let x = rect.x0; x < rect.x1; x++) {
          const i = y * r.width + x;
          sum += (r.lum[i] - data[i]) ** 2;
          n++;
        }
      }
      curves[k].push(n ? sum / n : 0);
    });
  }
  return curves.map((c) => {
    const max = Math.max(...c);
    const min = Math.min(...c);
    return { informative: max >= 0.5, shape: c.map((v) => (v - min) / (max - min || 1)) };
  });
}

// Sensor noise measured only on flat background (≥2 px from any edge), so
// anti-aliased glyph edges don't count as noise.
function flatNoise(r, rect) {
  const { width, lum } = r;
  const x0 = rect.x0 + 2;
  const x1 = rect.x1 - 2;
  const y0 = rect.y0 + 2;
  const y1 = rect.y1 - 2;
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  const edge = new Uint8Array((x1 - x0) * (y1 - y0));
  const ew = x1 - x0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      const g = Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + width] - lum[i - width]);
      if (g > 14) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const yy = y - y0 + dy;
            const xx = x - x0 + dx;
            if (yy >= 0 && xx >= 0 && yy < y1 - y0 && xx < ew) edge[yy * ew + xx] = 1;
          }
        }
      }
    }
  }
  const residuals = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (edge[(y - y0) * ew + (x - x0)]) continue;
      const i = y * width + x;
      const local = (lum[i - 1] + lum[i + 1] + lum[i - width] + lum[i + width] + lum[i - width - 1] + lum[i - width + 1] + lum[i + width - 1] + lum[i + width + 1]) / 8;
      residuals.push(lum[i] - local);
    }
  }
  if (residuals.length < 150) return null;
  const mean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
  return Math.sqrt(residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / residuals.length);
}

function signal(id, severity, label, detail, value) {
  return { id, severity, label, detail, value };
}

// ---------------------------------------------------------------------------
// Raster documents
// ---------------------------------------------------------------------------
async function analyzeRaster({ buffer, mimeType, layout, nameLine, metadataText }) {
  const signals = [];
  const metrics = {};

  // File-level: camera photo later opened in an editor.
  const editor = metadataText.match(EDITOR_SOFTWARE)?.[0];
  const fromCamera = /\b(make|model)\b[\s\S]{0,40}\b(apple|samsung|google|huawei|xiaomi|oppo|vivo|canon|nikon|sony|fujifilm)\b|iphone|pixel\s\d/i.test(metadataText);
  if (editor && fromCamera) {
    signals.push(signal('editedPhoto', 'moderate', 'Photo edited after capture', `The camera photo was re-saved with ${editor}.`, editor));
  } else if (editor) {
    signals.push(signal('editorSoftware', 'weak', 'Image editor in metadata', `File was last saved with ${editor}.`, editor));
  }

  if (!layout?.hasBoxes || !nameLine?.box) {
    return { applicable: false, reason: layout?.hasBoxes ? 'The recipient name was not located on the page.' : 'Text positions are unavailable from the current OCR engine.', signals, metrics };
  }

  const peers = layout.lines.filter(
    (l) => l !== nameLine && l.box && l.box.h >= 0.012 && l.box.w >= 0.06 && l.text.replace(/[^A-Za-z]/g, '').length >= 4
  );
  metrics.peerCount = peers.length;

  if (peers.length >= 3) {
    const raster = await loadRaster(buffer, [nameLine, ...peers]);
    const rects = [nameLine, ...peers].map((l) => rectOf(l.box, raster));

    // 1. Error level analysis across qualities (JPEG ghosts).
    const curves = await ghostCurves(raster, rects);
    const [nameCurve, ...peerCurves] = curves;
    const usable = peerCurves.filter((c) => c.informative);
    if (nameCurve.informative && usable.length >= 3) {
      const reference = GHOST_QUALITIES.map((_, i) => median(usable.map((c) => c.shape[i])));
      const distance = (c) => c.shape.reduce((s, v, i) => s + Math.abs(v - reference[i]), 0) / GHOST_QUALITIES.length;
      const peerDistances = usable.map(distance);
      const nameDistance = distance(nameCurve);
      const peerMax = Math.max(0.01, ...peerDistances);
      metrics.ela = { nameDistance: fmt(nameDistance, 3), peerMax: fmt(peerMax, 3), ratio: fmt(nameDistance / peerMax) };
      // Lossless files carry no compression history of their own, so differences
      // there come from content; demand a larger outlier before flagging.
      const lossless = !/jpe?g/i.test(mimeType);
      const [strongAt, moderateAt] = lossless ? [3.5, 2.6] : [3, 2];
      if (nameDistance > 0.045 && nameDistance / peerMax > strongAt) {
        signals.push(signal('ela', 'strong', 'Compression history differs on the name', `Error level analysis shows the name was saved a different number of times, or at a different quality, than the rest of the certificate (${(nameDistance / peerMax).toFixed(1)}× outside the normal range).`, nameDistance));
      } else if (nameDistance > 0.025 && nameDistance / peerMax > moderateAt) {
        signals.push(signal('ela', 'moderate', 'Unusual compression around the name', `The name's error level sits ${(nameDistance / peerMax).toFixed(1)}× outside the range of the other text.`, nameDistance));
      }
    }

    // 2. Sensor noise: only meaningful when the page itself is noisy (a photo).
    const nameNoise = flatNoise(raster, rectOf(nameLine.box, raster, 0.6, 0.04));
    const peerNoise = peers.map((l) => flatNoise(raster, rectOf(l.box, raster, 0.6, 0.04))).filter((v) => v !== null);
    const noiseMed = median(peerNoise);
    metrics.noise = { name: nameNoise === null ? null : fmt(nameNoise), peers: fmt(noiseMed) };
    if (nameNoise !== null && peerNoise.length >= 3 && noiseMed >= 1.2) {
      const nr = nameNoise / noiseMed;
      if (nr < 0.3) signals.push(signal('noise', 'strong', 'Name is missing camera noise', 'The background behind the name is perfectly clean while the rest of the photo has sensor noise — typical of pasted text.', nr));
      else if (nr < 0.5) signals.push(signal('noise', 'moderate', 'Lower noise behind the name', 'The area behind the name is smoother than the rest of the photo.', nr));
    }
  } else {
    metrics.note = 'Not enough comparable text lines for region analysis.';
  }

  // 4. Alignment: centred documents keep every line on one axis.
  const wide = peers.filter((l) => l.box.w > 0.12);
  const centres = wide.map((l) => l.box.x + l.box.w / 2);
  const axis = median(centres);
  const onAxis = centres.filter((c) => Math.abs(c - axis) < 0.02).length;
  if (wide.length >= 3 && onAxis / wide.length >= 0.6) {
    const offset = Math.abs(nameLine.box.x + nameLine.box.w / 2 - axis);
    metrics.centreOffset = fmt(offset, 3);
    if (offset > 0.06) signals.push(signal('alignment', 'moderate', 'Name is off the centre line', `Every other line is centred, but the name sits ${(offset * 100).toFixed(1)}% off the axis.`, offset));
    else if (offset > 0.035) signals.push(signal('alignment', 'weak', 'Name slightly off-centre', `The name is ${(offset * 100).toFixed(1)}% off the document’s centre line.`, offset));
  }

  // 5. Skew: in a photo every line shares the same perspective.
  const angles = peers.map((l) => l.angle || 0);
  if (angles.length >= 3) {
    const med = median(angles);
    const dev = Math.abs((nameLine.angle || 0) - med);
    metrics.skewDeviation = fmt(dev);
    if (dev > 2 && mad(angles) < 0.8) {
      signals.push(signal('skew', dev > 4 ? 'strong' : 'moderate', 'Name is tilted differently', `The name is rotated ${dev.toFixed(1)}° relative to the rest of the text.`, dev));
    }
  }

  // 6. Font metrics inside a sentence ("… certifies that Jane Doe has …").
  const nameWords = new Set((nameLine.nameTokens || []).map((t) => t.toLowerCase()));
  const words = nameLine.words || [];
  const inName = words.filter((w) => nameWords.has(w.text.toLowerCase().replace(/[^a-z]/g, '')));
  const others = words.filter((w) => !inName.includes(w) && w.text.length > 1);
  if (inName.length && others.length >= 2) {
    const hName = median(inName.map((w) => w.box.h));
    const hOther = median(others.map((w) => w.box.h));
    const baseName = median(inName.map((w) => w.box.y + w.box.h));
    const baseOther = median(others.map((w) => w.box.y + w.box.h));
    const sizeRatio = hName / hOther;
    const baselineShift = Math.abs(baseName - baseOther) / hOther;
    metrics.inlineSizeRatio = fmt(sizeRatio);
    metrics.inlineBaselineShift = fmt(baselineShift);
    if (sizeRatio > 1.3 || sizeRatio < 0.75 || baselineShift > 0.3) {
      signals.push(signal('fontMetrics', baselineShift > 0.5 ? 'strong' : 'moderate', 'Font mismatch inside the sentence', `The name's letter height (${Math.round(sizeRatio * 100)}%) or baseline doesn't match the words around it.`, sizeRatio));
    }
  }

  return { applicable: true, signals, metrics };
}

// ---------------------------------------------------------------------------
// PDFs
// ---------------------------------------------------------------------------
function analyzePdf(buffer) {
  const raw = buffer.toString('latin1');
  const signals = [];
  const eofCount = (raw.match(/%%EOF/g) || []).length;
  const producers = [...raw.matchAll(/\/(?:Producer|Creator)\s*\(([^)]{0,160})\)/g)].map((m) => m[1]);
  const editor = producers.map((p) => p.match(PDF_EDITORS)?.[0]).find(Boolean);
  const dates = (key) => [...raw.matchAll(new RegExp(`/${key}\\s*\\(D:(\\d{8,14})`, 'g'))].map((m) => m[1]);
  const created = dates('CreationDate')[0];
  const modified = dates('ModDate').pop();
  const daysApart = created && modified ? (Date.parse(`${modified.slice(0, 4)}-${modified.slice(4, 6)}-${modified.slice(6, 8)}`) - Date.parse(`${created.slice(0, 4)}-${created.slice(4, 6)}-${created.slice(6, 8)}`)) / 86400000 : 0;
  const incremental = eofCount > 1 && /\/Prev\s+\d+/.test(raw);
  const freeTextAnnots = (raw.match(/\/Subtype\s*\/FreeText/g) || []).length;

  if (editor && incremental) {
    signals.push(signal('pdfEdit', 'moderate', 'Edited with a PDF editor', `The PDF was modified after it was created, using ${editor}.`, editor));
  } else if (editor) {
    signals.push(signal('pdfEditor', 'weak', 'PDF editor in metadata', `Last saved with ${editor}.`, editor));
  } else if (incremental && daysApart > 2) {
    signals.push(signal('pdfRevision', 'weak', 'PDF revised after issue', `The file was changed ${Math.round(daysApart)} days after it was created.`, daysApart));
  }
  if (freeTextAnnots) {
    signals.push(signal('pdfOverlay', editor || incremental ? 'strong' : 'moderate', 'Text box overlaid on the PDF', `${freeTextAnnots} free-text annotation(s) sit on top of the page — a common way to cover and retype a name.`, freeTextAnnots));
  }
  return { applicable: true, signals, metrics: { revisions: eofCount, producers: [...new Set(producers)].slice(0, 4), daysBetweenCreateAndModify: Math.round(daysApart) } };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function analyzeTampering({ buffer, mimeType, layout, nameLine, metadataText = '' }) {
  let result;
  try {
    result = mimeType.includes('pdf') ? analyzePdf(buffer) : await analyzeRaster({ buffer, mimeType, layout, nameLine, metadataText });
  } catch (err) {
    result = { applicable: false, reason: `Forensic analysis failed: ${err.message}`, signals: [], metrics: {} };
  }
  const strong = result.signals.filter((s) => s.severity === 'strong').length;
  const moderate = result.signals.filter((s) => s.severity === 'moderate').length;
  const weak = result.signals.filter((s) => s.severity === 'weak').length;
  // Strong evidence rejects; anything moderate goes to a registrar.
  const verdict = strong || moderate >= 3 ? 'tampered' : moderate ? 'suspicious' : 'clean';
  return { ...result, verdict, counts: { strong, moderate, weak } };
}
