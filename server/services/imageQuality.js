// Image quality & readability. Never rejects a certificate on its own — it
// decides whether the other checks can be trusted. A blurry, tiny or washed-out
// upload makes OCR and forensics unreliable, so the result becomes
// "inconclusive" (sent to a registrar) instead of a false verdict either way.
import sharp from 'sharp';

const fmt = (n, d = 1) => Number(n.toFixed(d));

// Variance of the Laplacian on a 1000-px-wide greyscale copy: high for crisp
// text edges, low for motion blur or out-of-focus photos.
function laplacianVariance(lum, w, h) {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function percentile(hist, total, p) {
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * p) return v;
  }
  return 255;
}

export async function assessImageQuality(buffer, mimeType, layout) {
  if (mimeType.includes('pdf')) {
    const textChars = (layout?.lines || []).reduce((s, l) => s + l.text.replace(/\s/g, '').length, 0);
    return {
      level: textChars >= 20 ? 'good' : 'unreadable',
      issues: textChars >= 20 ? [] : ['No readable text could be extracted from the PDF (it may be a scan saved as an image).'],
      metrics: { textChars }
    };
  }

  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  const width = meta.autoOrient?.width || meta.width || 0;
  const height = meta.autoOrient?.height || meta.height || 0;
  const W = Math.min(1000, width || 1000);
  const { data, info } = await sharp(buffer, { failOn: 'none' }).rotate().greyscale().resize({ width: W, withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const hist = new Uint32Array(256);
  let sum = 0;
  for (const v of data) {
    hist[v]++;
    sum += v;
  }
  const total = data.length;
  // Ink-to-paper range: text covers only a few percent of a certificate, so
  // use the extremes rather than the bulk of the histogram.
  const ink = percentile(hist, total, 0.005);
  const paper = percentile(hist, total, 0.995);
  const mean = sum / total;
  const sharpness = laplacianVariance(data, info.width, info.height);

  const lines = layout?.lines || [];
  const textChars = lines.reduce((s, l) => s + l.text.replace(/\s/g, '').length, 0);
  const confidences = lines.map((l) => l.confidence).filter((c) => Number.isFinite(c) && c > 0);
  const ocrConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;

  const issues = [];
  let level = 'good';
  const shortSide = Math.min(width, height);
  const demote = (to, issue) => {
    issues.push(issue);
    const rank = { good: 0, fair: 1, poor: 2, unreadable: 3 };
    if (rank[to] > rank[level]) level = to;
  };

  if (shortSide < 350) demote('poor', `Very low resolution (${width}×${height}px). Upload the original file or a sharper photo.`);
  else if (shortSide < 700) demote('fair', `Low resolution (${width}×${height}px); small text may be misread.`);
  if (sharpness < 25) demote('poor', 'The image is blurry, so text and edits cannot be checked reliably.');
  else if (sharpness < 60) demote('fair', 'The image is slightly soft.');
  if (paper - ink < 70) demote('poor', 'Very low contrast — the text is faint or washed out.');
  else if (paper - ink < 100) demote('fair', 'Low contrast between the text and the paper.');
  if (mean < 60) demote('fair', 'The image is dark.');
  if (textChars < 20) demote('unreadable', 'No readable text was found on the certificate.');
  else if (ocrConfidence !== null && ocrConfidence < 0.45) demote('poor', 'The text was read with low confidence.');

  return {
    level,
    issues,
    metrics: { width, height, sharpness: fmt(sharpness), contrast: paper - ink, brightness: fmt(mean), textChars, ocrConfidence: ocrConfidence === null ? null : fmt(ocrConfidence, 2) }
  };
}
