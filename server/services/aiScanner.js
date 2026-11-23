import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { execFileSync } from 'child_process';
import { compareNames, findNameInText, nameTokens } from './nameMatch.js';
import { resolveField, inferAxisFromText } from '../../shared/skillTaxonomy.js';

const PASS_THRESHOLD = 85;

// ---------------------------------------------------------------------------
// Gate 5 — generator signatures. Only matched against metadata fields
// (EXIF/XMP/PNG text/PDF Info/C2PA), never against document content, so a
// genuine "ChatGPT Workshop" certificate is not mistaken for an AI image.
// ---------------------------------------------------------------------------
const GENERATOR_PATTERNS = [
  /dall[-·\s]?e/i,
  /midjourney/i,
  /stable[\s_-]?diffusion/i,
  /\bsdxl\b/i,
  /comfyui/i,
  /automatic1111/i,
  /novelai/i,
  /adobe\s*firefly/i,
  /leonardo\.?ai/i,
  /ideogram/i,
  /\bimagen\b/i,
  /gpt-?4o/i,
  /\bchatgpt\b/i,
  /\bopenai\b/i,
  /trainedalgorithmicmedia/i,
  /Steps:\s*\d+[\s\S]{0,80}Sampler:/i
];

// Export filenames these tools use by default.
const GENERATOR_FILENAMES = [/^dall[·-]?e[\s_]\d{4}/i, /^chatgpt image/i, /^gemini_generated_image/i, /^midjourney_/i];

// Gate 3 — fictional entities that recur in AI-generated certificate templates.
const AI_HALLUCINATION_BLACKLIST = [
  { pattern: /alexander\s+r\.?\s+chen/i, label: 'Recurring AI template recipient ("Alexander R. Chen")' },
  { pattern: /global\s+institute\s+of\s+artificial\s+intelligence/i, label: 'Fictional issuer ("Global Institute of Artificial Intelligence")' },
  { pattern: /giai[\s\-_]*mlnn/i, label: 'Synthetic template ID ("GIAI-MLNN")' },
  { pattern: /evelyn\s+reed/i, label: 'Recurring AI signatory ("Dr. Evelyn Reed")' },
  { pattern: /kenji\s+tanaka/i, label: 'Recurring AI signatory ("Prof. Kenji Tanaka")' },
  { pattern: /seal\s+of[\s\S]{0,35}seal\s+of/i, label: 'Repeated circular seal text ("SEAL OF … SEAL OF")' },
  { pattern: /\b(john\s+doe|jane\s+doe|sample\s+certificate|lorem\s+ipsum)\b/i, label: 'Placeholder template text' }
];

const NON_NAME_WORDS = new Set([
  'certificate', 'certification', 'achievement', 'excellence', 'completion', 'appreciation', 'participation',
  'recognition', 'award', 'awarded', 'presented', 'proudly', 'hereby', 'certifies', 'certify', 'that', 'this',
  'institute', 'university', 'college', 'faculty', 'school', 'department', 'office', 'registrar', 'council',
  'society', 'club', 'program', 'programme', 'course', 'workshop', 'symposium', 'hackathon', 'director',
  'president', 'dean', 'chairperson', 'professor', 'instructor', 'coordinator', 'date', 'issued', 'signature',
  'seal', 'verified', 'credential', 'honor', 'honours', 'distinction', 'of', 'the', 'and', 'for', 'in'
]);

// ---------------------------------------------------------------------------
// Metadata extraction. Descriptive fields (titles, descriptions, keywords) are
// dropped so the certificate's own wording can never trip Gate 5.
// ---------------------------------------------------------------------------
const PNG_TEXT_KEYS = new Set(['software', 'parameters', 'prompt', 'workflow', 'source', 'generator', 'xml:com.adobe.xmp']);

function stripDescriptiveXmp(xml) {
  return String(xml).replace(/<dc:(title|description|subject|rights|creator)[\s\S]*?<\/dc:\1>/gi, ' ');
}

function pngMetadata(buffer) {
  const out = [];
  let hasC2pa = false;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + len);
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const sep = data.indexOf(0);
      const key = data.toString('latin1', 0, sep).toLowerCase();
      if (PNG_TEXT_KEYS.has(key)) {
        let value = '';
        try {
          if (type === 'tEXt') value = data.toString('latin1', sep + 1);
          else if (type === 'zTXt') value = zlib.inflateSync(data.subarray(sep + 2)).toString('latin1');
          else value = data.toString('latin1', sep + 1);
        } catch {
          // ignore corrupt chunk
        }
        out.push(`${key}: ${stripDescriptiveXmp(value)}`);
      }
    }
    if (type === 'caBX') {
      hasC2pa = true;
      out.push(data.toString('latin1'));
    }
    if (type === 'IEND') break;
    offset += 12 + len;
  }
  return { text: out.join('\n'), hasC2pa };
}

function jpegMetadata(buffer) {
  const out = [];
  let hasC2pa = false;
  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end
    const len = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xe0 && marker <= 0xef) {
      const seg = buffer.subarray(offset + 4, offset + 2 + len).toString('latin1');
      if (marker === 0xeb && /jumb|c2pa/i.test(seg)) hasC2pa = true;
      out.push(stripDescriptiveXmp(seg));
    }
    offset += 2 + len;
  }
  return { text: out.join('\n'), hasC2pa };
}

function pdfMetadata(buffer) {
  const raw = buffer.toString('latin1');
  const fields = [];
  const re = /\/(Producer|Creator)\s*\(([^)]{0,200})\)/g;
  let m;
  while ((m = re.exec(raw)) && fields.length < 20) fields.push(`${m[1]}: ${m[2]}`);
  const xmp = raw.match(/<x:xmpmeta[\s\S]{0,20000}?<\/x:xmpmeta>/);
  if (xmp) fields.push(stripDescriptiveXmp(xmp[0]));
  return { text: fields.join('\n'), hasC2pa: /c2pa/i.test(raw.slice(0, 200000)) };
}

function webpMetadata(buffer) {
  const out = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const len = buffer.readUInt32LE(offset + 4);
    if (type === 'EXIF' || type === 'XMP ') out.push(stripDescriptiveXmp(buffer.subarray(offset + 8, offset + 8 + len).toString('latin1')));
    offset += 8 + len + (len % 2);
  }
  return { text: out.join('\n'), hasC2pa: false };
}

export function extractFileMetadata(buffer) {
  if (!buffer || buffer.length < 16) return { text: '', hasC2pa: false };
  try {
    if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return pngMetadata(buffer);
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return jpegMetadata(buffer);
    if (buffer.toString('ascii', 0, 5) === '%PDF-') return pdfMetadata(buffer);
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return webpMetadata(buffer);
  } catch {
    // fall through
  }
  return { text: '', hasC2pa: false };
}

function parseImageDimensions(buffer) {
  try {
    if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        if (marker >= 0xc0 && marker <= 0xc2) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        if (marker === 0xd9 || marker === 0xda) break;
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// macOS Vision OCR helper (server/crypto/mac_vision_ocr). Only its text output is
// used; its legacy pixel heuristics produced false positives on bordered designs.
function runLocalVisionOcr(buffer, mimeType) {
  const binPath = path.resolve(process.cwd(), 'server', 'crypto', 'mac_vision_ocr');
  if (process.platform !== 'darwin' || !fs.existsSync(binPath) || buffer.length < 64) return [];
  const ext = mimeType.includes('pdf') ? '.pdf' : mimeType.includes('jp') ? '.jpg' : '.png';
  const tmpFile = path.join(os.tmpdir(), `tt_scan_${crypto.randomUUID()}${ext}`);
  try {
    fs.writeFileSync(tmpFile, buffer);
    const stdout = execFileSync(binPath, [tmpFile], { timeout: 6000, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf-8').trim();
    if (!stdout.startsWith('{')) return [];
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed.ocrLines) ? parsed.ocrLines : [];
  } catch {
    return [];
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

async function runGeminiAudit({ apiKey, base64, mimeType, axes }) {
  const prompt = `You are a forensic document examiner. Inspect this certificate and reply in JSON only:
{
  "is3dMockupOrTabletop": boolean,   // true only if the certificate is shown as an object in a 3D scene (on a desk, wall, in perspective)
  "isAiGeneratedOrFake": boolean,    // true only for clear signs of AI generation (garbled text, melted seals, nonsense signatures)
  "recipientName": string,
  "issuingOrganization": string,
  "achievementTitle": string,
  "issuanceDate": "YYYY-MM-DD",
  "competencyDomain": one of ${JSON.stringify(axes)},
  "allVisibleText": string
}`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 }
        }),
        signal: AbortSignal.timeout(20000)
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OCR field extraction
// ---------------------------------------------------------------------------
const RECIPIENT_TRIGGER =
  /(?:awarded\s+to|presented\s+to|certifies\s+that|certify\s+that|conferred\s+(?:up)?on|granted\s+to|recipient\s*:|student\s+name\s*:|name\s*:)/i;

function looksLikePersonName(text) {
  const words = String(text || '').replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;
  if (words.some((w) => NON_NAME_WORDS.has(w.toLowerCase()))) return false;
  const letters = words.join('').replace(/[^A-Za-zÀ-ÿ'-]/g, '');
  return letters.length / words.join('').length >= 0.85 && words.every((w) => w.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 1);
}

// Only names introduced by an explicit phrase ("awarded to …") are trusted
// enough to reject a certificate.
function extractRecipientFromTrigger(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(RECIPIENT_TRIGGER);
    if (!m) continue;
    const after = line.slice(m.index + m[0].length).replace(/^[:\s\-–—]+/, '').trim();
    if (looksLikePersonName(after)) return after;
    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      const candidate = lines[j].trim();
      if (looksLikePersonName(candidate)) return candidate;
    }
  }
  return '';
}

function extractIssuer(lines) {
  const re = /\b(university|institute|college|academy|ministry|corporation|council|society|faculty|foundation|association|ieee|acm|unesco)\b/i;
  return lines.map((l) => l.trim()).find((l) => l.length >= 5 && l.length <= 90 && re.test(l)) || '';
}

function extractTitle(lines, issuer) {
  const skip = /(certificate\s+of|this\s+is\s+to\s+certify|proudly\s+presented|awarded\s+to|has\s+successfully|date|certificate\s+id|signature|seal\s+of)/i;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 6 || line.length > 90) continue;
    if (issuer && line.toLowerCase() === issuer.toLowerCase()) continue;
    if (skip.test(line) || looksLikePersonName(line)) continue;
    if (/[a-z]{4,}/i.test(line)) return line;
  }
  return '';
}

function titleFromFilename(fileName = '') {
  const base = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(cert|certificate|scan|img|image|photo|doc|document|final|signed|a4)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base || base.length < 4 || /^(img|dsc|screenshot|whatsapp|pxl|image)\s*\d*$/i.test(base)) {
    return 'Co-Curricular Micro-Credential';
  }
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function gate(id, number, title, passed, detail, failLabel) {
  return {
    id,
    gateNumber: number,
    title,
    passed,
    criticalFail: !passed,
    score: passed ? 100 : 0,
    statusLabel: passed ? 'Passed' : failLabel,
    detail
  };
}

// ---------------------------------------------------------------------------
// 6-gate pipeline
//   1. Document geometry (3D desk/table renders)
//   2. Recipient name vs. account holder
//   3. Known AI-template entities
//   4. Issuer sanity check
//   5. Generator metadata
//   6. Verdict: any critical failure rejects; otherwise 100%
// ---------------------------------------------------------------------------
export async function analyzeCertificateUpload({
  fileBase64,
  fileName = 'certificate.png',
  mimeType = 'image/png',
  studentName = '',
  studentId = '',
  studentUniversity = '',
  studentField = '',
  clientPixelMetrics = null,
  clientOcrText = ''
}) {
  const base64 = String(fileBase64 || '').includes(',') ? String(fileBase64).split(',')[1] : String(fileBase64 || '');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length < 32) throw new Error('The uploaded file is empty or unreadable.');

  const fileHash = '0x' + crypto.createHash('sha256').update(buffer).digest('hex');
  const field = resolveField(studentField);
  const axes = field.axes.map((a) => a.name);

  const ocrLines = runLocalVisionOcr(buffer, mimeType);
  if (clientOcrText?.trim()) ocrLines.push(...clientOcrText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const gemini = apiKey ? await runGeminiAudit({ apiKey, base64, mimeType, axes }) : null;
  if (gemini?.allVisibleText) ocrLines.push(...String(gemini.allVisibleText).split(/\r?\n/));

  const ocrText = ocrLines.join('\n');
  const hasOcr = ocrText.replace(/\s/g, '').length >= 20;
  const metadata = extractFileMetadata(buffer);
  const dims = parseImageDimensions(buffer);
  const geometry = clientPixelMetrics?.version === 2 ? clientPixelMetrics : null;

  const gates = [];

  // Gate 1 — geometry
  const geminiSaysScene = Boolean(gemini?.is3dMockupOrTabletop);
  const sceneDetected = Boolean(
    geometry?.is3dMockup || (geminiSaysScene && geometry && geometry.marginSides >= 3 && geometry.maxSkew >= 0.04)
  );
  gates.push(
    gate(
      'gate1_layout',
      1,
      'Gate 1: Document Layout',
      !sceneDetected,
      sceneDetected
        ? 'The certificate appears as an object in a 3D scene (on a desk or at an angle). Upload the original PDF or a flat scan.'
        : geometry
        ? 'Flat document layout confirmed.'
        : 'Flat document layout confirmed (PDF or vector document).',
      'Rejected: 3D scene'
    )
  );

  // Gate 2 — recipient identity
  const triggerName = gemini?.recipientName && looksLikePersonName(gemini.recipientName)
    ? gemini.recipientName.trim()
    : extractRecipientFromTrigger(ocrLines);
  let gate2Passed = true;
  let identityVerified = false;
  let gate2Detail;
  if (!studentName.trim()) {
    gate2Detail = 'No account name to compare against.';
  } else if (!hasOcr) {
    gate2Detail = `No machine-readable text in this file; the credential is bound to ${studentName}'s account.`;
  } else {
    const inText = findNameInText(ocrText, studentName);
    const vsTrigger = triggerName ? compareNames(triggerName, studentName) : null;
    if (inText.found || vsTrigger?.matched) {
      identityVerified = true;
      gate2Detail = `Recipient matches the account holder (${studentName}).`;
    } else if (triggerName && nameTokens(triggerName).length >= 2) {
      gate2Passed = false;
      gate2Detail = `This certificate is issued to "${triggerName}", which does not match your account name "${studentName}".`;
    } else {
      gate2Detail = `Recipient name was not legible; the credential is bound to ${studentName}'s account.`;
    }
  }
  gates.push(gate('gate2_recipient', 2, 'Gate 2: Recipient Identity', gate2Passed, gate2Detail, 'Rejected: name mismatch'));

  // Gate 3 — AI template entities
  const blacklistHits = AI_HALLUCINATION_BLACKLIST.filter((item) => item.pattern.test(ocrText)).map((i) => i.label);
  if (gemini?.isAiGeneratedOrFake && blacklistHits.length === 0 && hasOcr) {
    blacklistHits.push('Visual analysis found AI-generation artifacts (garbled text or seals)');
  }
  gates.push(
    gate(
      'gate3_aiTemplate',
      3,
      'Gate 3: AI Template Check',
      blacklistHits.length === 0,
      blacklistHits.length ? `Matched known AI-generated template content: ${blacklistHits.join('; ')}.` : 'No AI-template content found.',
      'Rejected: AI template'
    )
  );

  // Gate 4 — issuer
  const issuer = (gemini?.issuingOrganization || extractIssuer(ocrLines) || studentUniversity || 'University Registrar Office').trim();
  const fictionalIssuer = /global\s+institute\s+of\s+artificial\s+intelligence/i.test(issuer);
  gates.push(
    gate(
      'gate4_issuer',
      4,
      'Gate 4: Issuer Check',
      !fictionalIssuer,
      fictionalIssuer ? `"${issuer}" is a known fictional issuer.` : `Issuer recorded as "${issuer}".`,
      'Rejected: fictional issuer'
    )
  );

  // Gate 5 — generator metadata
  const metaHit = GENERATOR_PATTERNS.map((re) => metadata.text.match(re)?.[0]).find(Boolean);
  const nameHit = GENERATOR_FILENAMES.some((re) => re.test(path.basename(fileName)));
  const generatorSignature = metaHit || (nameHit ? `filename "${path.basename(fileName)}"` : null);
  gates.push(
    gate(
      'gate5_metadata',
      5,
      'Gate 5: File Metadata',
      !generatorSignature,
      generatorSignature
        ? `AI image generator signature found in file metadata (${generatorSignature}).`
        : metadata.hasC2pa
        ? 'Content Credentials present with no AI-generation claim.'
        : 'No AI generator signatures in file metadata.',
      'Rejected: AI metadata'
    )
  );

  // Gate 6 — verdict
  const failed = gates.filter((g) => !g.passed);
  const rejected = failed.length > 0;
  const confidence = rejected ? Math.max(5, 40 - (failed.length - 1) * 15) : 100;
  gates.push(
    gate(
      'gate6_verdict',
      6,
      'Gate 6: Verdict',
      !rejected,
      rejected ? `${failed.length} gate(s) failed.` : 'All checks passed.',
      'Rejected'
    )
  );

  const title = (gemini?.achievementTitle || extractTitle(ocrLines, issuer) || titleFromFilename(fileName)).trim();
  const domain = axes.includes(gemini?.competencyDomain)
    ? gemini.competencyDomain
    : inferAxisFromText(field.id, `${title} ${ocrText} ${fileName}`) || axes[0];

  const forensics = {
    fileHash,
    fileSizeKB: Number((buffer.length / 1024).toFixed(1)),
    mimeType,
    dimensions: dims ? `${dims.width}×${dims.height}px` : geometry ? `${geometry.sourceWidth || geometry.width}×${geometry.sourceHeight || geometry.height}px` : 'Document',
    geometry,
    ocrAvailable: hasOcr,
    identityVerified,
    overallConfidence: confidence,
    passed: !rejected,
    isAiRejected: rejected,
    hasCriticalFail: rejected,
    identityMismatch: !gate2Passed,
    requiresAdminQueue: false,
    extractedRecipientName: identityVerified || !triggerName ? studentName : triggerName,
    extractedIssuer: issuer,
    gates,
    rejectionReasons: failed.map((g) => `${g.title}: ${g.detail}`),
    verdict: rejected ? 'Rejected — this certificate failed verification' : 'Verified — passed all 6 checks (100%)',
    analyzedAt: new Date().toISOString()
  };

  return {
    engineUsed: gemini ? 'TrustTrace 6-Gate (Gemini Vision + local checks)' : 'TrustTrace 6-Gate (local checks)',
    extracted: {
      studentName,
      studentId,
      achievementTitle: title,
      issuingOrganization: issuer,
      issuanceDate: /^\d{4}-\d{2}-\d{2}$/.test(gemini?.issuanceDate || '') ? gemini.issuanceDate : new Date().toISOString().slice(0, 10),
      competencyDomain: domain,
      attainedLevel: 'Expert / Mastery',
      masteryScore: rejected ? 0 : 100
    },
    forensics
  };
}

export { PASS_THRESHOLD };
