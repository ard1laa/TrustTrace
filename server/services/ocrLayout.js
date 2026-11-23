// Layout-aware OCR. Every provider is normalised to the same shape so the
// parser and the forensic checks don't care where the text came from:
//
//   { provider, hasBoxes, width, height, lines: [{ text, confidence, box, angle, words }] }
//   box = { x, y, w, h } normalised 0…1, top-left origin; angle in degrees.
//
// Provider order: Google Cloud Vision (GOOGLE_VISION_API_KEY) → macOS Vision
// helper (server/ocr/vision_layout) → plain text lines (no boxes).
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const HELPER = path.resolve(process.cwd(), 'server', 'ocr', 'vision_layout');
const LEGACY_HELPER = path.resolve(process.cwd(), 'server', 'crypto', 'mac_vision_ocr');

const round = (n) => Math.round(n * 10000) / 10000;

function lineFrom(text, box, { confidence = 1, angle = 0, words = [] } = {}) {
  return {
    text: String(text || '').trim(),
    confidence,
    angle,
    words,
    box: box ? { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) } : null
  };
}

function angleOf(p1, p2, width = 1, height = 1) {
  return (Math.atan2((p2[1] - p1[1]) * height, (p2[0] - p1[0]) * width) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Google Cloud Vision (DOCUMENT_TEXT_DETECTION)
// ---------------------------------------------------------------------------
function boxFromVertices(vertices, width, height) {
  const xs = vertices.map((v) => (v.x ?? 0) / width);
  const ys = vertices.map((v) => (v.y ?? 0) / height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function linesFromVisionPage(page) {
  const normalized = !page.width || !page.height;
  const W = normalized ? 1 : page.width;
  const H = normalized ? 1 : page.height;
  const verts = (bb) => (normalized ? bb.normalizedVertices : bb.vertices) || [];
  const lines = [];

  for (const block of page.blocks || []) {
    for (const para of block.paragraphs || []) {
      let words = [];
      const flush = () => {
        if (!words.length) return;
        const xs = words.flatMap((w) => [w.box.x, w.box.x + w.box.w]);
        const ys = words.flatMap((w) => [w.box.y, w.box.y + w.box.h]);
        const first = words[0].quad;
        const last = words[words.length - 1].quad;
        lines.push(
          lineFrom(
            words.map((w) => w.text).join(' '),
            { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
            {
              confidence: words.reduce((s, w) => s + w.confidence, 0) / words.length,
              angle: first && last ? angleOf(first[0], last[1], W, H) : 0,
              words: words.map(({ text, box }) => ({ text, box }))
            }
          )
        );
        words = [];
      };

      for (const word of para.words || []) {
        const symbols = word.symbols || [];
        const text = symbols.map((s) => s.text).join('');
        const v = verts(word.boundingBox);
        if (!text || v.length < 4) continue;
        words.push({
          text,
          confidence: word.confidence ?? 1,
          box: boxFromVertices(v, W, H),
          quad: v.map((p) => [(p.x ?? 0) / W, (p.y ?? 0) / H])
        });
        const brk = symbols[symbols.length - 1]?.property?.detectedBreak?.type;
        if (brk === 'EOL_SURE_SPACE' || brk === 'LINE_BREAK') flush();
      }
      flush();
    }
  }
  return { lines, width: page.width || null, height: page.height || null };
}

async function googleVisionLayout(buffer, mimeType, apiKey) {
  const isPdf = mimeType.includes('pdf');
  const content = buffer.toString('base64');
  const url = `https://vision.googleapis.com/v1/${isPdf ? 'files' : 'images'}:annotate?key=${encodeURIComponent(apiKey)}`;
  const request = isPdf
    ? { inputConfig: { content, mimeType: 'application/pdf' }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], pages: [1] }
    : { image: { content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [request] }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`Cloud Vision HTTP ${res.status}`);
  const data = await res.json();
  const response = isPdf ? data.responses?.[0]?.responses?.[0] : data.responses?.[0];
  const page = response?.fullTextAnnotation?.pages?.[0];
  if (!page) return null;
  const { lines, width, height } = linesFromVisionPage(page);
  return { provider: 'Google Cloud Vision', hasBoxes: true, width, height, lines };
}

// ---------------------------------------------------------------------------
// macOS Vision helper
// ---------------------------------------------------------------------------
async function withTempFile(buffer, mimeType, fn) {
  const ext = mimeType.includes('pdf') ? '.pdf' : mimeType.includes('jp') ? '.jpg' : mimeType.includes('webp') ? '.webp' : '.png';
  const file = path.join(os.tmpdir(), `tt_ocr_${crypto.randomUUID()}${ext}`);
  await fs.promises.writeFile(file, buffer);
  try {
    return await fn(file);
  } finally {
    fs.promises.rm(file, { force: true }).catch(() => {});
  }
}

async function macVisionLayout(buffer, mimeType) {
  if (process.platform !== 'darwin' || !fs.existsSync(HELPER)) return null;
  return withTempFile(buffer, mimeType, async (file) => {
    // First call after boot loads the Vision model, which can take a while.
    const { stdout } = await execFileAsync(HELPER, [file], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    const W = parsed.width || 1;
    const H = parsed.height || 1;
    const lines = (parsed.lines || [])
      .map((l) => {
        const [x, y, w, h] = l.box || [];
        const q = l.quad || [];
        return lineFrom(l.text, { x, y, w, h }, {
          confidence: l.confidence,
          angle: q.length === 4 ? angleOf(q[0], q[1], W, H) : 0,
          words: (l.words || []).map((wd) => ({ text: wd.text, box: { x: wd.box[0], y: wd.box[1], w: wd.box[2], h: wd.box[3] } }))
        });
      })
      .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    return { provider: 'Apple Vision', hasBoxes: true, width: parsed.width, height: parsed.height, lines };
  });
}

async function legacyMacOcr(buffer, mimeType) {
  if (process.platform !== 'darwin' || !fs.existsSync(LEGACY_HELPER)) return null;
  return withTempFile(buffer, mimeType, async (file) => {
    const { stdout } = await execFileAsync(LEGACY_HELPER, [file], { timeout: 20000 });
    const parsed = JSON.parse(stdout.trim());
    const lines = (parsed.ocrLines || []).map((t) => lineFrom(t, null));
    return { provider: 'Apple Vision (text only)', hasBoxes: false, width: null, height: null, lines };
  });
}

export function textOnlyLayout(text, provider = 'Text') {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => lineFrom(t, null));
  return { provider, hasBoxes: false, width: null, height: null, lines };
}

export async function extractLayout(buffer, mimeType) {
  const errors = [];
  const key = (process.env.GOOGLE_VISION_API_KEY || '').trim();
  const attempts = [
    key ? () => googleVisionLayout(buffer, mimeType, key) : null,
    () => macVisionLayout(buffer, mimeType),
    () => legacyMacOcr(buffer, mimeType)
  ].filter(Boolean);

  for (const attempt of attempts) {
    try {
      const layout = await attempt();
      if (layout?.lines?.length) return { ...layout, errors };
    } catch (err) {
      errors.push(err.message);
    }
  }
  return { provider: 'none', hasBoxes: false, width: null, height: null, lines: [], errors };
}

// Loads the Vision model at boot so the first upload isn't slow.
export function warmUpLayoutOcr() {
  if (process.platform !== 'darwin' || !fs.existsSync(HELPER)) return;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  macVisionLayout(png, 'image/png').catch(() => {});
}
