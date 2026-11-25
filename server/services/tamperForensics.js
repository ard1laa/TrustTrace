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
import { compareNames, findNameInText, nameTokens, similarity } from './nameMatch.js';

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

function signal(id, severity, label, detail, value, field = null) {
  return { id, severity, label, detail, value, field };
}

// ---------------------------------------------------------------------------
// Locating the name. Decorative script names are where OCR is weakest, and
// exactly where a forger pastes, so three strategies are tried in turn:
//   1. text   — a line that reads as the expected name
//   2. fuzzy  — the line most similar to it (OCR slips like "Hafv BinAIi")
//   3. slot   — the line or gap right after "certify that" / "presented to"
// ---------------------------------------------------------------------------
const NAME_CUE = /(certif(?:y|ies)\s+that|presented\s+to|awarded\s+to|conferred\s+(?:up)?on|granted\s+to|is\s+hereby\s+(?:awarded|given)\s+to|this\s+is\s+to\s+(?:certify|acknowledge)|recogni[sz]es?)\s*[:.,]?\s*$/i;
const SENTENCE_WORDS = /\b(has|have|for|in|of|the|on|at|with|by|from|participat|complet|organi[sz]ed|held)\w*/i;

export function locateNameRegion(layout, candidates = []) {
  const lines = (layout?.lines || []).filter((l) => l.box).sort((a, b) => a.box.y - b.box.y);
  if (!lines.length) return null;
  const names = [...new Set(candidates.filter(Boolean))];

  for (const name of names) {
    const line = lines.find((l) => findNameInText(l.text, name).found || compareNames(l.text, name).matched);
    if (line) return Object.assign(line, { nameTokens: nameTokens(name), locatedBy: 'text' });
  }

  let fuzzy = null;
  for (const name of names) {
    const target = nameTokens(name).join('');
    for (const l of lines) {
      const tokens = nameTokens(l.text);
      if (tokens.length < 1 || tokens.length > 7) continue;
      const score = similarity(tokens.join(''), target);
      if (score >= 0.72 && (!fuzzy || score > fuzzy.score)) fuzzy = { line: l, score, name };
    }
  }
  if (fuzzy) return Object.assign(fuzzy.line, { nameTokens: nameTokens(fuzzy.name), locatedBy: 'fuzzy' });

  const cueIndex = lines.findIndex((l) => NAME_CUE.test(l.text.trim()));
  const cue = lines[cueIndex];
  const next = lines[cueIndex + 1];
  if (!cue || !next) return null;
  const nextIsName = nameTokens(next.text).length >= 1 && nameTokens(next.text).length <= 6 && !SENTENCE_WORDS.test(next.text);
  if (nextIsName) return Object.assign(next, { nameTokens: names[0] ? nameTokens(names[0]) : nameTokens(next.text), locatedBy: 'slot' });

  // Nothing legible between the cue and the next sentence: the name is there, unread.
  const top = cue.box.y + cue.box.h;
  const gap = next.box.y - top;
  const lineH = Math.max(cue.box.h, next.box.h);
  if (gap < lineH * 1.2) return null;
  const width = Math.min(0.9, Math.max(cue.box.w, next.box.w) * 1.05);
  const axis = (cue.box.x + cue.box.w / 2 + next.box.x + next.box.w / 2) / 2;
  return {
    text: '',
    words: [],
    angle: ((cue.angle || 0) + (next.angle || 0)) / 2,
    confidence: 0,
    nameTokens: names[0] ? nameTokens(names[0]) : [],
    locatedBy: 'gap',
    box: { x: Math.max(0, axis - width / 2), y: top + gap * 0.1, w: width, h: gap * 0.8 }
  };
}

// ---------------------------------------------------------------------------
// Background patch: a pasted name usually sits on a rectangle filled to match
// the paper. Its top and bottom edges are long, straight, low-contrast steps
// hugging the name. Designed banners are high-contrast and wider, and if the
// other text lines sit on panels too, it's the design.
// ---------------------------------------------------------------------------
function rowMeans(r, y, x0, x1) {
  const out = new Float32Array(x1 - x0);
  for (let x = x0; x < x1; x++) out[x - x0] = r.lum[y * r.width + x];
  return out;
}

function bandStats(r, y0, y1, x0, x1) {
  const n = x1 - x0;
  const cols = new Float32Array(n);
  for (let y = y0; y < y1; y++) {
    const row = rowMeans(r, y, x0, x1);
    for (let i = 0; i < n; i++) cols[i] += row[i] / (y1 - y0);
  }
  const mean = cols.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(cols.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  return { cols, mean, sd };
}

// Strongest straight step (inside minus outside) above or below a text box.
function patchEdge(r, rect, side) {
  const h = rect.y1 - rect.y0;
  const inset = Math.round((rect.x1 - rect.x0) * 0.08);
  const x0 = rect.x0 + inset;
  const x1 = rect.x1 - inset;
  if (x1 - x0 < 40 || h < 8) return null;
  let best = null;
  // Start slightly inside the box: OCR boxes vary in how much of the ascenders
  // and descenders they include, so the patch edge can fall just inside.
  // Rows through the text itself are skipped by the flatness test below.
  for (let d = -Math.round(h * 0.2); d <= Math.round(h * 1.1); d++) {
    const y = side === 'top' ? rect.y0 - d : rect.y1 + d;
    if (y - 6 < 0 || y + 7 > r.height) continue;
    const before = bandStats(r, y - 5, y - 1, x0, x1);
    const after = bandStats(r, y + 2, y + 6, x0, x1);
    if (before.sd > 5 || after.sd > 5) continue; // text or texture, not a flat edge
    let agree = 0;
    const step = after.mean - before.mean;
    for (let i = 0; i < before.cols.length; i++) {
      const diff = after.cols[i] - before.cols[i];
      if (Math.sign(diff) === Math.sign(step) && Math.abs(diff) >= 1) agree++;
    }
    const consistency = agree / before.cols.length;
    if (Math.abs(step) >= 1.5 && consistency >= 0.8 && (!best || Math.abs(step) > Math.abs(best.step))) {
      // inside − outside: below the top edge is inside; above the bottom edge is inside.
      best = { step, inside: side === 'top' ? step : -step, distance: Math.max(0, d) / h };
    }
  }
  return best;
}

function patchAround(r, rect) {
  const top = patchEdge(r, rect, 'top');
  const bottom = patchEdge(r, rect, 'bottom');
  if (!top || !bottom || Math.sign(top.inside) !== Math.sign(bottom.inside)) return null;
  return { contrast: (Math.abs(top.inside) + Math.abs(bottom.inside)) / 2, tight: Math.max(top.distance, bottom.distance) };
}

// ---------------------------------------------------------------------------
// Raster documents
// ---------------------------------------------------------------------------
const FIELD_NAMES = { name: 'name', date: 'date', title: 'title' };
const FIELD_LABELS = { name: 'recipient name', date: 'certificate date', title: 'achievement title' };

async function analyzeRaster({ buffer, mimeType, layout, targets, metadataText }) {
  const signals = [];
  const metrics = { fields: {} };

  // File-level: camera photo later opened in an editor.
  const editor = metadataText.match(EDITOR_SOFTWARE)?.[0];
  const fromCamera = /\b(make|model)\b[\s\S]{0,40}\b(apple|samsung|google|huawei|xiaomi|oppo|vivo|canon|nikon|sony|fujifilm)\b|iphone|pixel\s\d/i.test(metadataText);
  if (editor && fromCamera) {
    signals.push(signal('editedPhoto', 'moderate', 'Photo edited after capture', `The camera photo was re-saved with ${editor}.`, editor));
  } else if (editor) {
    signals.push(signal('editorSoftware', 'weak', 'Image editor in metadata', `File was last saved with ${editor}.`, editor));
  }

  const located = [];
  for (const t of targets) {
    if (t.line?.box && !located.some((o) => o.line === t.line)) located.push(t);
  }
  const nameTarget = located.find((t) => t.field === 'name');
  if (!layout?.hasBoxes || !located.length) {
    return {
      applicable: false,
      fieldsChecked: [],
      reason: layout?.hasBoxes ? 'The recipient name, date and title were not located on the page.' : 'Text positions are unavailable from the current OCR engine.',
      signals,
      metrics
    };
  }

  const targetLines = new Set(located.map((t) => t.line));
  const peers = layout.lines.filter(
    (l) => !targetLines.has(l) && l.box && l.box.h >= 0.012 && l.box.w >= 0.06 && l.text.replace(/[^A-Za-z]/g, '').length >= 4
  );
  metrics.peerCount = peers.length;

  if (peers.length >= 3) {
    const raster = await loadRaster(buffer, [...located.map((t) => t.line), ...peers]);
    const targetRects = located.map((t) => rectOf(t.line.box, raster));
    const peerRects = peers.map((l) => rectOf(l.box, raster));

    // 1. Error level analysis across qualities (JPEG ghosts), each field vs. the other text.
    const curves = await ghostCurves(raster, [...targetRects, ...peerRects]);
    const usable = curves.slice(located.length).filter((c) => c.informative);
    // Lossless files carry no compression history of their own, so differences
    // there come from content; demand a larger outlier before flagging.
    const lossless = !/jpe?g/i.test(mimeType);
    const [strongAt, moderateAt] = lossless ? [3.5, 2.6] : [3, 2];
    if (usable.length >= 3) {
      const reference = GHOST_QUALITIES.map((_, i) => median(usable.map((c) => c.shape[i])));
      const distance = (c) => c.shape.reduce((s, v, i) => s + Math.abs(v - reference[i]), 0) / GHOST_QUALITIES.length;
      const peerMax = Math.max(0.01, ...usable.map(distance));
      located.forEach((t, k) => {
        const curve = curves[k];
        if (!curve.informative) return;
        const d = distance(curve);
        const ratio = d / peerMax;
        const fm = (metrics.fields[t.field] ||= {});
        fm.ela = { distance: fmt(d, 3), peerMax: fmt(peerMax, 3), ratio: fmt(ratio) };
        if (t.field === 'name') metrics.ela = { nameDistance: fmt(d, 3), peerMax: fmt(peerMax, 3), ratio: fmt(ratio) };
        const label = FIELD_LABELS[t.field];
        if (d > 0.045 && ratio > strongAt) {
          signals.push(signal('ela', 'strong', `Compression history differs on the ${FIELD_NAMES[t.field]}`, `Error level analysis shows the ${label} was saved a different number of times, or at a different quality, than the rest of the certificate (${ratio.toFixed(1)}× outside the normal range).`, d, t.field));
        } else if (d > 0.025 && ratio > moderateAt) {
          signals.push(signal('ela', 'moderate', `Unusual compression around the ${FIELD_NAMES[t.field]}`, `The ${label}'s error level sits ${ratio.toFixed(1)}× outside the range of the other text.`, d, t.field));
        }
      });
    }

    // 2. Sensor noise: only meaningful when the page itself is noisy (a photo).
    // Measured close to the text: a pasted patch is only as big as the line.
    const peerNoise = peers.map((l) => flatNoise(raster, rectOf(l.box, raster, 0.25, 0.02))).filter((v) => v !== null);
    const noiseMed = median(peerNoise);
    for (const t of located) {
      const n = flatNoise(raster, rectOf(t.line.box, raster, 0.25, 0.02));
      (metrics.fields[t.field] ||= {}).noise = n === null ? null : fmt(n);
      if (t.field === 'name') metrics.noise = { name: n === null ? null : fmt(n), peers: fmt(noiseMed) };
      if (n === null || peerNoise.length < 3 || noiseMed < 1.2) continue;
      const nr = n / noiseMed;
      const label = FIELD_LABELS[t.field];
      if (nr < 0.3) signals.push(signal('noise', 'strong', `The ${FIELD_NAMES[t.field]} is missing camera noise`, `The background behind the ${label} is perfectly clean while the rest of the photo has sensor noise — typical of pasted text.`, nr, t.field));
      else if (nr < 0.5) signals.push(signal('noise', 'moderate', `Lower noise behind the ${FIELD_NAMES[t.field]}`, `The area behind the ${label} is smoother than the rest of the photo.`, nr, t.field));
    }
    metrics.noisePeers = fmt(noiseMed);

    // 3. Background patch hugging a field but no ordinary line (cover-up rectangle).
    const peerPatches = peers.filter((l) => patchAround(raster, rectOf(l.box, raster, 0, 0))).length;
    located.forEach((t, k) => {
      const patch = patchAround(raster, { ...targetRects[k], ...rectOf(t.line.box, raster, 0, 0) });
      (metrics.fields[t.field] ||= {}).patch = patch ? { contrast: fmt(patch.contrast, 1), tight: fmt(patch.tight), peersWithPanels: peerPatches } : null;
      if (t.field === 'name') metrics.patch = metrics.fields.name.patch;
      if (patch && patch.contrast <= 24 && peerPatches <= 1) {
        signals.push(
          signal(
            'patch',
            patch.contrast <= 10 ? 'moderate' : 'weak',
            `The ${FIELD_NAMES[t.field]} sits on a pasted background`,
            `A faint rectangle (${patch.contrast.toFixed(0)} grey levels from the paper) surrounds the ${FIELD_LABELS[t.field]} but no other text — typical of a cover-up patch.`,
            patch.contrast,
            t.field
          )
        );
      }
    });
  } else {
    metrics.note = 'Not enough comparable text lines for region analysis.';
  }

  if (nameTarget) analyzeNameLayout(nameTarget.line, peers, signals, metrics);
  metrics.nameLocatedBy = nameTarget?.line.locatedBy || null;
  return { applicable: true, fieldsChecked: located.map((t) => t.field), regionAnalysis: peers.length >= 3, signals, metrics };
}

// Layout checks that only make sense for the name.
function analyzeNameLayout(nameLine, peers, signals, metrics) {
  // Alignment: centred documents keep every line on one axis.
  const wide = peers.filter((l) => l.box.w > 0.12);
  const centres = wide.map((l) => l.box.x + l.box.w / 2);
  const axis = median(centres);
  const onAxis = centres.filter((c) => Math.abs(c - axis) < 0.02).length;
  if (wide.length >= 3 && onAxis / wide.length >= 0.6 && nameLine.locatedBy !== 'gap') {
    const offset = Math.abs(nameLine.box.x + nameLine.box.w / 2 - axis);
    metrics.centreOffset = fmt(offset, 3);
    if (offset > 0.06) signals.push(signal('alignment', 'moderate', 'Name is off the centre line', `Every other line is centred, but the name sits ${(offset * 100).toFixed(1)}% off the axis.`, offset, 'name'));
    else if (offset > 0.035) signals.push(signal('alignment', 'weak', 'Name slightly off-centre', `The name is ${(offset * 100).toFixed(1)}% off the document’s centre line.`, offset, 'name'));
  }

  // Skew: in a photo every line shares the same perspective.
  const angles = peers.map((l) => l.angle || 0);
  if (angles.length >= 3 && nameLine.locatedBy !== 'gap') {
    const med = median(angles);
    const dev = Math.abs((nameLine.angle || 0) - med);
    metrics.skewDeviation = fmt(dev);
    if (dev > 2 && mad(angles) < 0.8) {
      signals.push(signal('skew', dev > 4 ? 'strong' : 'moderate', 'Name is tilted differently', `The name is rotated ${dev.toFixed(1)}° relative to the rest of the text.`, dev, 'name'));
    }
  }

  // Font metrics inside a sentence ("… certifies that Jane Doe has …").
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
      signals.push(signal('fontMetrics', baselineShift > 0.5 ? 'strong' : 'moderate', 'Font mismatch inside the sentence', `The name's letter height (${Math.round(sizeRatio * 100)}%) or baseline doesn't match the words around it.`, sizeRatio, 'name'));
    }
  }
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
// targets: [{ field: 'name' | 'date' | 'title', line }] — or pass nameLine alone.
export async function analyzeTampering({ buffer, mimeType, layout, nameLine, targets, metadataText = '' }) {
  const fieldTargets = targets || [{ field: 'name', line: nameLine }];
  let result;
  try {
    result = mimeType.includes('pdf')
      ? analyzePdf(buffer)
      : await analyzeRaster({ buffer, mimeType, layout, targets: fieldTargets, metadataText });
  } catch (err) {
    result = { applicable: false, fieldsChecked: [], reason: `Forensic analysis failed: ${err.message}`, signals: [], metrics: {} };
  }
  const strong = result.signals.filter((s) => s.severity === 'strong').length;
  const moderate = result.signals.filter((s) => s.severity === 'moderate').length;
  const weak = result.signals.filter((s) => s.severity === 'weak').length;
  // Strong evidence rejects; anything moderate goes to a registrar.
  const verdict = strong || moderate >= 3 ? 'tampered' : moderate ? 'suspicious' : 'clean';
  return { ...result, verdict, counts: { strong, moderate, weak } };
}
