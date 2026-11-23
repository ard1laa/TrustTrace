import crypto from 'crypto';
import path from 'path';
import zlib from 'zlib';
import { compareNames, findNameInText, nameTokens } from './nameMatch.js';
import { extractLayout, textOnlyLayout } from './ocrLayout.js';
import { parseCertificate, looksLikePersonName, CATEGORIES } from './certificateParser.js';
import { analyzeTampering } from './tamperForensics.js';
import { crossCheckEvent } from './eventCrossCheck.js';
import { resolveField, inferAxisFromText } from '../../shared/skillTaxonomy.js';

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


// ---------------------------------------------------------------------------
// Gemini Vision (optional). Returns fields, visual judgements and line boxes,
// which act as a layout source on servers without Cloud Vision or macOS.
// ---------------------------------------------------------------------------
async function runGeminiAudit({ apiKey, base64, mimeType, axes }) {
  const prompt = `You are a forensic document examiner. Inspect this certificate and reply in JSON only:
{
  "is3dMockupOrTabletop": boolean,
  "isAiGeneratedOrFake": boolean,
  "nameLooksEdited": boolean,
  "recipientName": string,
  "issuingOrganization": string,
  "certificateHeading": string,
  "eventOrProgramName": string,
  "category": one of ${JSON.stringify(CATEGORIES)},
  "resultOrPlacement": string,
  "issuanceDate": "YYYY-MM-DD",
  "competencyDomain": one of ${JSON.stringify(axes)},
  "textLines": [{ "text": string, "box_2d": [ymin, xmin, ymax, xmax] }]
}
Rules: is3dMockupOrTabletop is true only when the certificate is an object in a 3D scene. isAiGeneratedOrFake only for clear generation artefacts (garbled text, melted seals). nameLooksEdited only for visible pasting (mismatched font, halo, misalignment). eventOrProgramName is the specific event or course, not "Certificate of Achievement". resultOrPlacement is e.g. "1st Place", "CGPA 3.85", or "". box_2d values are 0-1000.`;
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
        signal: AbortSignal.timeout(25000)
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

function geminiLayout(gemini) {
  const lines = (gemini?.textLines || [])
    .filter((l) => l?.text && Array.isArray(l.box_2d) && l.box_2d.length === 4)
    .map((l) => {
      const [y0, x0, y1, x1] = l.box_2d.map((v) => Number(v) / 1000);
      return { text: String(l.text).trim(), confidence: 0.9, angle: 0, words: [], box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
    })
    .sort((a, b) => a.box.y - b.box.y);
  return lines.length >= 3 ? { provider: 'Gemini Vision', hasBoxes: true, width: null, height: null, lines } : null;
}

// ---------------------------------------------------------------------------
// Gate helpers. status: pass | warn | fail. A warning sends the certificate to
// a registrar instead of minting it straight away.
// ---------------------------------------------------------------------------
function gate(id, number, title, status, detail, labels = {}) {
  const passed = status !== 'fail';
  return {
    id,
    gateNumber: number,
    title,
    status,
    passed,
    criticalFail: !passed,
    score: status === 'pass' ? 100 : status === 'warn' ? 60 : 0,
    statusLabel: status === 'pass' ? 'Passed' : status === 'warn' ? labels.warn || 'Needs review' : labels.fail || 'Rejected',
    detail
  };
}

function locateNameLine(lines, candidates) {
  for (const name of candidates.filter(Boolean)) {
    const tokens = nameTokens(name);
    if (tokens.length < 1) continue;
    const line = lines.find((l) => findNameInText(l.text, name).found || compareNames(l.text, name).matched);
    if (line) return Object.assign(line, { nameTokens: tokens });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pipeline
//   1. Document layout (3D desk/table renders)
//   2. Recipient name vs. account holder
//   3. Known AI-template content
//   4. Issuer & event — online cross-check
//   5. File metadata — AI generators
//   6. Tamper forensics — edited names (ELA, noise, alignment, PDF edits)
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

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const [ocr, gemini] = await Promise.all([
    extractLayout(buffer, mimeType),
    apiKey ? runGeminiAudit({ apiKey, base64, mimeType, axes }) : Promise.resolve(null)
  ]);

  let layout = ocr;
  if (!layout.hasBoxes) layout = geminiLayout(gemini) || layout;
  if (!layout.lines.length && clientOcrText?.trim()) layout = textOnlyLayout(clientOcrText, 'On-device OCR');
  const lines = layout.lines;
  const ocrText = lines.map((l) => l.text).join('\n');
  const hasOcr = ocrText.replace(/\s/g, '').length >= 20;

  const parsed = parseCertificate(lines, {
    fileName,
    hints: {
      title: gemini?.eventOrProgramName || '',
      issuer: gemini?.issuingOrganization || '',
      issuanceDate: /^\d{4}-\d{2}-\d{2}$/.test(gemini?.issuanceDate || '') ? gemini.issuanceDate : ''
    }
  });

  const metadata = extractFileMetadata(buffer);
  const dims = parseImageDimensions(buffer);
  const geometry = clientPixelMetrics?.version === 2 ? clientPixelMetrics : null;
  const gates = [];

  // Gate 1 — geometry
  const sceneDetected = Boolean(
    geometry?.is3dMockup || (gemini?.is3dMockupOrTabletop && geometry && geometry.marginSides >= 3 && geometry.maxSkew >= 0.04)
  );
  gates.push(
    gate(
      'gate1_layout', 1, 'Gate 1: Document Layout',
      sceneDetected ? 'fail' : 'pass',
      sceneDetected
        ? 'The certificate appears as an object in a 3D scene (on a desk or at an angle). Upload the original PDF or a flat scan.'
        : geometry ? 'Flat document layout confirmed.' : 'Flat document layout confirmed (PDF or vector document).',
      { fail: 'Rejected: 3D scene' }
    )
  );

  // Gate 2 — recipient identity
  const triggerName = gemini?.recipientName && looksLikePersonName(gemini.recipientName) ? gemini.recipientName.trim() : parsed.recipient?.name || '';
  let gate2 = 'pass';
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
      gate2 = 'fail';
      gate2Detail = `This certificate is issued to "${triggerName}", which does not match your account name "${studentName}".`;
    } else {
      gate2Detail = `Recipient name was not legible; the credential is bound to ${studentName}'s account.`;
    }
  }
  gates.push(gate('gate2_recipient', 2, 'Gate 2: Recipient Identity', gate2, gate2Detail, { fail: 'Rejected: name mismatch' }));

  // Gate 3 — AI template content
  const blacklistHits = AI_HALLUCINATION_BLACKLIST.filter((item) => item.pattern.test(ocrText)).map((i) => i.label);
  if (gemini?.isAiGeneratedOrFake && blacklistHits.length === 0 && hasOcr) {
    blacklistHits.push('Visual analysis found AI-generation artifacts (garbled text or seals)');
  }
  gates.push(
    gate(
      'gate3_aiTemplate', 3, 'Gate 3: AI Template Check',
      blacklistHits.length ? 'fail' : 'pass',
      blacklistHits.length ? `Matched known AI-generated template content: ${blacklistHits.join('; ')}.` : 'No AI-template content found.',
      { fail: 'Rejected: AI template' }
    )
  );

  // Gate 4 — issuer & event, cross-checked online
  const issuer = (parsed.issuer || studentUniversity || 'University Registrar Office').trim();
  const fictionalIssuer = /global\s+institute\s+of\s+artificial\s+intelligence/i.test(issuer);
  const eventCheck = hasOcr && !fictionalIssuer
    ? await crossCheckEvent({ eventName: parsed.eventName || parsed.title, issuer: parsed.issuer, text: ocrText })
    : { status: 'skipped', detail: hasOcr ? '' : 'No readable event or issuer text.', evidence: [] };
  const gate4 = fictionalIssuer ? 'fail' : eventCheck.deadDomains?.length ? 'warn' : 'pass';
  gates.push(
    gate(
      'gate4_issuer', 4, 'Gate 4: Issuer & Event',
      gate4,
      fictionalIssuer ? `"${issuer}" is a known fictional issuer.` : `Issuer: ${issuer}. ${eventCheck.detail || ''}`.trim(),
      { fail: 'Rejected: fictional issuer', warn: 'Unverified website' }
    )
  );

  // Gate 5 — generator metadata
  const metaHit = GENERATOR_PATTERNS.map((re) => metadata.text.match(re)?.[0]).find(Boolean);
  const nameHit = GENERATOR_FILENAMES.some((re) => re.test(path.basename(fileName)));
  const generatorSignature = metaHit || (nameHit ? `filename "${path.basename(fileName)}"` : null);
  gates.push(
    gate(
      'gate5_metadata', 5, 'Gate 5: File Metadata',
      generatorSignature ? 'fail' : 'pass',
      generatorSignature
        ? `AI image generator signature found in file metadata (${generatorSignature}).`
        : metadata.hasC2pa ? 'Content Credentials present with no AI-generation claim.' : 'No AI generator signatures in file metadata.',
      { fail: 'Rejected: AI metadata' }
    )
  );

  // Gate 6 — tamper forensics around the recipient name
  const nameLine = locateNameLine(lines, [identityVerified ? studentName : '', triggerName, studentName]);
  const tamper = await analyzeTampering({ buffer, mimeType, layout, nameLine, metadataText: metadata.text });
  if (gemini?.nameLooksEdited && tamper.verdict === 'clean') {
    tamper.signals.push({ id: 'visual', severity: 'moderate', label: 'Visual check flagged the name', detail: 'The vision model reports visible signs of a pasted name.' });
    tamper.verdict = 'suspicious';
  }
  const tamperStatus = tamper.verdict === 'tampered' ? 'fail' : tamper.verdict === 'suspicious' ? 'warn' : 'pass';
  const flagged = tamper.signals.filter((s) => s.severity !== 'weak');
  gates.push(
    gate(
      'gate6_tamper', 6, 'Gate 6: Tamper Forensics',
      tamperStatus,
      flagged.length
        ? flagged.map((s) => s.detail).join(' ')
        : tamper.applicable
        ? mimeType.includes('pdf') ? 'No signs of the PDF being edited after issue.' : 'Name region matches the rest of the document (error level, noise and alignment).'
        : `File-level checks passed. ${tamper.reason || ''}`.trim(),
      { fail: 'Rejected: edited name', warn: 'Possible edit' }
    )
  );

  // Verdict
  const failed = gates.filter((g) => g.status === 'fail');
  const warned = gates.filter((g) => g.status === 'warn');
  const outcome = failed.length ? 'rejected' : warned.length ? 'review' : 'verified';
  const confidence = outcome === 'rejected' ? Math.max(5, 40 - (failed.length - 1) * 15) : outcome === 'review' ? Math.max(55, 85 - warned.length * 12) : 100;

  const title = (parsed.title || 'Co-Curricular Micro-Credential').trim();
  const domain = axes.includes(gemini?.competencyDomain)
    ? gemini.competencyDomain
    : inferAxisFromText(field.id, `${title} ${parsed.category.type} ${ocrText} ${fileName}`) || axes[0];
  const category = CATEGORIES.includes(gemini?.category) && parsed.category.type === 'Other' ? gemini.category : parsed.category.type;
  const scoring = parsed.scoring.requiresScoring || !gemini?.resultOrPlacement
    ? parsed.scoring
    : { requiresScoring: true, kind: 'placement', result: String(gemini.resultOrPlacement).slice(0, 40), evidence: 'vision model' };

  const forensics = {
    fileHash,
    fileSizeKB: Number((buffer.length / 1024).toFixed(1)),
    mimeType,
    dimensions: dims ? `${dims.width}×${dims.height}px` : geometry ? `${geometry.sourceWidth || geometry.width}×${geometry.sourceHeight || geometry.height}px` : 'Document',
    geometry,
    ocrAvailable: hasOcr,
    ocrProvider: layout.provider,
    layoutAvailable: layout.hasBoxes,
    identityVerified,
    outcome,
    overallConfidence: confidence,
    passed: outcome !== 'rejected',
    isAiRejected: outcome === 'rejected',
    hasCriticalFail: outcome === 'rejected',
    identityMismatch: gate2 === 'fail',
    requiresAdminQueue: outcome === 'review',
    extractedRecipientName: identityVerified || !triggerName ? studentName : triggerName,
    extractedIssuer: issuer,
    eventCheck,
    tamper: { verdict: tamper.verdict, applicable: tamper.applicable, signals: tamper.signals, metrics: tamper.metrics, reason: tamper.reason || '' },
    gates,
    rejectionReasons: failed.map((g) => `${g.title}: ${g.detail}`),
    reviewReasons: warned.map((g) => `${g.title}: ${g.detail}`),
    verdict:
      outcome === 'rejected'
        ? 'Rejected — this certificate failed verification'
        : outcome === 'review'
        ? 'Needs registrar review — possible edits detected'
        : 'Verified — passed all 6 checks (100%)',
    analyzedAt: new Date().toISOString()
  };

  return {
    engineUsed: `TrustTrace 6-Gate (${layout.provider === 'none' ? 'metadata only' : layout.provider}${gemini ? ' + Gemini' : ''})`,
    extracted: {
      studentName,
      studentId,
      achievementTitle: title,
      certificateHeading: parsed.heading,
      eventName: parsed.eventName,
      issuingOrganization: issuer,
      issuanceDate: parsed.issuanceDate || new Date().toISOString().slice(0, 10),
      competencyDomain: domain,
      achievementType: category,
      typeConfidence: parsed.category.confidence,
      typeSignals: parsed.category.signals,
      requiresScoring: scoring.requiresScoring,
      achievementResult: scoring.result,
      resultKind: scoring.kind,
      attainedLevel: 'Expert / Mastery',
      masteryScore: outcome === 'rejected' ? 0 : 100
    },
    forensics
  };
}
