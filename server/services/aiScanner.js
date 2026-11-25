import crypto from 'crypto';
import path from 'path';
import zlib from 'zlib';
import { compareNames, findNameInText, nameTokens } from './nameMatch.js';
import { extractLayout, textOnlyLayout } from './ocrLayout.js';
import { parseCertificate, looksLikePersonName, extractDateLine, CATEGORIES } from './certificateParser.js';
import { assessImageQuality } from './imageQuality.js';
import { similarity } from './nameMatch.js';
import { detectScene } from './sceneDetector.js';
import { analyzeTampering, locateNameRegion } from './tamperForensics.js';
import { crossCheckEvent } from './eventCrossCheck.js';
import { resolveField, inferAxisFromText } from '../../shared/skillTaxonomy.js';

// ---------------------------------------------------------------------------
// Check 6 — generator signatures. Only matched against metadata fields
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

// Check 4 — fictional entities that recur in AI-generated certificate templates.
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
  "nameEditEvidence": string,
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
Rules:
- Judge the layout separately from the graphic design. Ribbons, diagonal bands, swooshes, gradients, borders, seals, photos, rotated decorative panels and script fonts are normal certificate design and are NOT evidence of anything.
- is3dMockupOrTabletop: true only when the whole sheet is an object in a scene — visible table/desk/wall/hands around it, a cast shadow, or perspective where the sheet's text lines are rotated or converge together with its edges. Level text on a decorative tilted panel is a flat design.
- isAiGeneratedOrFake: only for clear generation artefacts (garbled or nonsense text, melted seals or signatures).
- nameLooksEdited: compare the recipient name with the text around it. A different font for the name is normal. Flag only physical evidence of pasting: a rectangle of slightly different background behind the name, halo or blurred edges around the letters, remnants of other letters, a baseline or tilt that differs from the page, or sharpness/resolution unlike the rest of the page. Put the evidence in nameEditEvidence, else "".
- eventOrProgramName is the specific event or course, not "Certificate of Achievement". resultOrPlacement is e.g. "1st Place", "CGPA 3.85", or "".
- textLines: every printed line, top to bottom; box_2d values are 0-1000.`;
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
// status: pass | warn (suspicious → registrar) | inconclusive (couldn't be
// checked → registrar) | fail (clear evidence → rejected).
function gate(id, number, title, status, detail, labels = {}, extra = {}) {
  const passed = status !== 'fail';
  return {
    id,
    gateNumber: number,
    title,
    status,
    passed,
    criticalFail: !passed,
    score: status === 'pass' ? 100 : status === 'warn' ? 60 : status === 'inconclusive' ? 50 : 0,
    statusLabel:
      status === 'pass'
        ? labels.pass || 'Passed'
        : status === 'warn'
        ? labels.warn || 'Needs review'
        : status === 'inconclusive'
        ? labels.inconclusive || 'Could not check'
        : labels.fail || 'Rejected',
    detail,
    ...extra
  };
}

const normalise = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function locateTitleLine(lines, title) {
  const target = normalise(title);
  if (target.length < 4) return null;
  let best = null;
  for (const l of lines) {
    const text = normalise(l.text);
    if (!text) continue;
    const score = text.includes(target) || target.includes(text) ? Math.min(text.length, target.length) / Math.max(text.length, target.length) + 0.3 : similarity(text, target);
    if (score >= 0.8 && (!best || score > best.score)) best = { line: l, score };
  }
  return best?.line || null;
}

// "Certificate No: UTM-2025-00123", "Credential ID ABC123", "Serial #..."
const CERT_NUMBER = /\b(?:certificate|cert\.?|credential|serial|reference|ref\.?|verification|award)\s*(?:no\.?|number|num\.?|#|id|code)\s*[:.#-]?\s*([A-Z0-9][A-Z0-9\-/.]{3,30}[A-Z0-9])/i;
function extractCertificateNumber(lines) {
  for (const l of lines) {
    const m = l.text.match(CERT_NUMBER);
    if (m && /\d/.test(m[1])) return m[1].toUpperCase();
  }
  return '';
}

// ---------------------------------------------------------------------------
// Pipeline (8 checks). Outcomes:
//   verified     — every check ran and found nothing (not proof of authenticity)
//   review       — something suspicious; a registrar decides
//   inconclusive — a key check couldn't run (unreadable, name not found); registrar
//   rejected     — clear evidence (name mismatch, known AI template, edited
//                  field, generator metadata, file registered to someone else)
//   1. Image quality & readability      5. Issuer & event (online cross-check)
//   2. Document layout (photo / 3D)     6. File metadata (AI generators)
//   3. Recipient name vs. account       7. Tamper forensics: name, date, title
//   4. AI-template content              8. Consistency & registry (dates, duplicates)
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
  clientOcrText = '',
  registryCheck = null
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
  const isPdf = mimeType.includes('pdf');
  const gates = [];

  // Gate 1 — image quality & readability. Never a reason to reject; a poor
  // image makes every other check unreliable, so the result is inconclusive.
  const quality = await assessImageQuality(buffer, mimeType, layout).catch(() => ({ level: 'fair', issues: ['Image quality could not be measured.'], metrics: {} }));
  const qualityStatus = quality.level === 'good' || quality.level === 'fair' ? 'pass' : 'inconclusive';
  gates.push(
    gate(
      'gate_quality', 1, 'Image Quality & Readability',
      qualityStatus,
      quality.issues.length ? quality.issues.join(' ') : isPdf ? 'Text extracted from the PDF.' : 'Sharp, readable image.',
      { pass: quality.level === 'fair' ? 'Acceptable' : 'Passed', inconclusive: quality.level === 'unreadable' ? 'Unreadable' : 'Poor quality' },
      { alwaysShowDetail: quality.level !== 'good' }
    )
  );

  // Gate 2 — flat document vs. certificate shown in a 3D scene. A photographed
  // certificate is not evidence of forgery, so this check never rejects.
  const scene = isPdf
    ? { verdict: 'flat', reason: 'Flat document layout confirmed (PDF).', geometry: null, shape: null, text: null }
    : await detectScene({ buffer, layout, visionSaysScene: gemini ? Boolean(gemini.is3dMockupOrTabletop) : null, clientGeometry: geometry });
  const sceneStatus = scene.verdict === 'flat' ? 'pass' : 'warn';
  gates.push(
    gate(
      'gate_layout', 2, 'Document Layout',
      sceneStatus,
      sceneStatus === 'warn'
        ? `${scene.reason} A registrar will confirm it is an original. For instant verification, upload the original PDF or use the in-app camera.`
        : scene.reason,
      { warn: scene.verdict === 'scene' ? 'Photo / 3D scene' : 'Check layout' }
    )
  );

  // Gate 3 — recipient identity
  const triggerName = gemini?.recipientName && looksLikePersonName(gemini.recipientName) ? gemini.recipientName.trim() : parsed.recipient?.name || '';
  let identityStatus = 'pass';
  let identityVerified = false;
  let identityDetail;
  if (!studentName.trim()) {
    identityDetail = 'No account name to compare against.';
  } else if (!hasOcr) {
    identityStatus = 'inconclusive';
    identityDetail = 'No machine-readable text, so the recipient name could not be checked.';
  } else {
    const inText = findNameInText(ocrText, studentName);
    const vsTrigger = triggerName ? compareNames(triggerName, studentName) : null;
    if (inText.found || vsTrigger?.matched) {
      identityVerified = true;
      identityDetail = `Recipient matches the account holder (${studentName}).`;
    } else if (triggerName && nameTokens(triggerName).length >= 2) {
      const closeness = similarity(nameTokens(triggerName).join(''), nameTokens(studentName).join(''));
      if ((vsTrigger?.matchedTokens || 0) === 0 && closeness < 0.5) {
        identityStatus = 'fail';
        identityDetail = `This certificate is issued to "${triggerName}", which does not match your account name "${studentName}".`;
      } else {
        // Partly matching: often an OCR misread of a decorative name, sometimes a near-copy.
        identityStatus = 'warn';
        identityDetail = `The printed name reads as "${triggerName}", which only partly matches "${studentName}". A registrar will compare them.`;
      }
    } else {
      identityStatus = 'inconclusive';
      identityDetail = 'The recipient name could not be read clearly (decorative font or low resolution).';
    }
  }
  gates.push(
    gate('gate_recipient', 3, 'Recipient Identity', identityStatus, identityDetail, { fail: 'Name mismatch', warn: 'Partial match', inconclusive: 'Name unreadable' }, { alwaysShowDetail: true })
  );

  // Gate 4 — AI-generated template content. Known template text is evidence;
  // a vision model's impression is only a reason for a human to look.
  const blacklistHits = AI_HALLUCINATION_BLACKLIST.filter((item) => item.pattern.test(ocrText)).map((i) => i.label);
  const aiOpinion = Boolean(gemini?.isAiGeneratedOrFake) && blacklistHits.length === 0 && hasOcr;
  gates.push(
    gate(
      'gate_aiTemplate', 4, 'AI Template Check',
      blacklistHits.length ? 'fail' : aiOpinion ? 'warn' : 'pass',
      blacklistHits.length
        ? `Matched known AI-generated template content: ${blacklistHits.join('; ')}.`
        : aiOpinion
        ? 'The vision model reported possible AI-generation artefacts (garbled text or seals). A registrar will check.'
        : 'No AI-template content found.',
      { fail: 'AI template', warn: 'Possible AI image' }
    )
  );

  // Gate 5 — issuer & event, cross-checked online
  const issuer = (parsed.issuer || studentUniversity || 'University Registrar Office').trim();
  const fictionalIssuer = /global\s+institute\s+of\s+artificial\s+intelligence/i.test(issuer);
  const eventCheck = hasOcr && !fictionalIssuer
    ? await crossCheckEvent({ eventName: parsed.eventName || parsed.title, issuer: parsed.issuer, text: ocrText })
    : { status: 'skipped', detail: hasOcr ? '' : 'No readable event or issuer text.', evidence: [] };
  const issuerStatus = fictionalIssuer ? 'fail' : eventCheck.deadDomains?.length ? 'warn' : 'pass';
  gates.push(
    gate(
      'gate_issuer', 5, 'Issuer & Event',
      issuerStatus,
      fictionalIssuer ? `"${issuer}" is a known fictional issuer.` : `Issuer: ${issuer}. ${eventCheck.detail || ''}`.trim(),
      { fail: 'Fictional issuer', warn: 'Unverified website' },
      { alwaysShowDetail: true }
    )
  );

  // Gate 6 — generator metadata
  const metaHit = GENERATOR_PATTERNS.map((re) => metadata.text.match(re)?.[0]).find(Boolean);
  const nameHit = GENERATOR_FILENAMES.some((re) => re.test(path.basename(fileName)));
  const generatorSignature = metaHit || (nameHit ? `filename "${path.basename(fileName)}"` : null);
  gates.push(
    gate(
      'gate_metadata', 6, 'File Metadata',
      generatorSignature ? 'fail' : 'pass',
      generatorSignature
        ? `AI image generator signature found in file metadata (${generatorSignature}).`
        : metadata.hasC2pa ? 'Content Credentials present with no AI-generation claim.' : 'No AI generator signatures in file metadata.',
      { fail: 'AI metadata' }
    )
  );

  // Gate 7 — tamper forensics on the fields a forger changes: name, date, title.
  const nameLine = locateNameRegion(layout, [identityVerified ? studentName : '', triggerName, studentName]);
  const dateHit = extractDateLine(lines);
  const titleLine = locateTitleLine(lines, parsed.eventName || parsed.title);
  const targets = [
    { field: 'name', line: nameLine },
    { field: 'date', line: dateHit.line && dateHit.line !== nameLine ? dateHit.line : null },
    { field: 'title', line: titleLine && titleLine !== nameLine && titleLine !== dateHit.line ? titleLine : null }
  ];
  const tamper = await analyzeTampering({ buffer, mimeType, layout, targets, metadataText: metadata.text });
  if (gemini?.nameLooksEdited && tamper.verdict === 'clean') {
    const evidence = String(gemini.nameEditEvidence || '').trim().slice(0, 160);
    tamper.signals.push({ id: 'visual', field: 'name', severity: 'moderate', label: 'Visual check flagged the name', detail: evidence ? `The vision model reports a pasted name: ${evidence}.` : 'The vision model reports visible signs of a pasted name.' });
    tamper.verdict = 'suspicious';
  }
  const flagged = tamper.signals.filter((s) => s.severity !== 'weak');
  const nameChecked = isPdf ? tamper.applicable : (tamper.fieldsChecked || []).includes('name') && tamper.regionAnalysis;
  const tamperStatus =
    tamper.verdict === 'tampered' ? 'fail' : tamper.verdict === 'suspicious' ? 'warn' : nameChecked ? 'pass' : 'inconclusive';
  const checkedFields = (tamper.fieldsChecked || []).map((f) => ({ name: 'name', date: 'date', title: 'title' })[f]).filter(Boolean);
  const editedFields = [...new Set(flagged.map((s) => s.field).filter(Boolean))];
  gates.push(
    gate(
      'gate_tamper', 7, 'Tamper Forensics',
      tamperStatus,
      flagged.length
        ? flagged.map((s) => s.detail).join(' ')
        : tamperStatus === 'pass'
        ? isPdf
          ? 'No signs of the PDF being edited after issue.'
          : `No signs of editing on the ${checkedFields.join(', ')} (error level, noise, background and alignment).`
        : `The name region could not be analysed. ${tamper.reason || (tamper.metrics?.note ?? '')}`.trim(),
      {
        fail: editedFields.length ? `Edited ${editedFields.join(' & ')}` : 'Edited document',
        warn: editedFields.length ? `Possible edit: ${editedFields.join(' & ')}` : 'Possible edit',
        inconclusive: 'Not analysed'
      },
      { alwaysShowDetail: true, fieldsChecked: tamper.fieldsChecked || [] }
    )
  );

  // Gate 8 — internal consistency and the registry of existing credentials.
  const consistency = [];
  const now = new Date();
  const certificateNumber = extractCertificateNumber(lines);
  if (parsed.issuanceDate) {
    const dated = new Date(parsed.issuanceDate);
    if (dated.getTime() - now.getTime() > 7 * 86400000) consistency.push({ status: 'warn', text: `The certificate is dated ${parsed.issuanceDate}, which is in the future.` });
    const titleYears = [...`${parsed.title} ${parsed.eventName || ''}`.matchAll(/\b(19[89]\d|20\d\d)\b/g)].map((m) => Number(m[1]));
    const conflict = titleYears.find((y) => Math.abs(y - dated.getFullYear()) >= 2);
    if (conflict) consistency.push({ status: 'warn', text: `The date (${dated.getFullYear()}) doesn't match the year in the title (${conflict}).` });
  }
  if (registryCheck) {
    const found = await registryCheck({ fileHash, certificateNumber });
    if (found?.sameFileOtherAccount) consistency.push({ status: 'fail', text: 'This exact file is already registered to another student.' });
    else if (found?.sameFileThisAccount) consistency.push({ status: 'warn', text: 'You have already uploaded this exact file.' });
    if (found?.numberOtherAccount) consistency.push({ status: 'warn', text: `Certificate number ${certificateNumber} is already registered to another student — possibly a copied certificate with the name changed.` });
  }
  const consistencyStatus = consistency.some((c) => c.status === 'fail') ? 'fail' : consistency.length ? 'warn' : 'pass';
  gates.push(
    gate(
      'gate_consistency', 8, 'Consistency & Registry',
      consistencyStatus,
      consistency.length
        ? consistency.map((c) => c.text).join(' ')
        : `Date and details are consistent${certificateNumber ? `; certificate number ${certificateNumber} is not registered elsewhere` : ''}.`,
      { fail: 'Duplicate', warn: 'Inconsistent' }
    )
  );

  // Verdict: clear evidence rejects; suspicion → registrar; missing evidence →
  // "unable to verify" (also a registrar). "Verified" means every check ran
  // and found nothing — not a guarantee the certificate is genuine.
  const failed = gates.filter((g) => g.status === 'fail');
  const warned = gates.filter((g) => g.status === 'warn');
  const unknown = gates.filter((g) => g.status === 'inconclusive');
  const outcome = failed.length ? 'rejected' : warned.length ? 'review' : unknown.length ? 'inconclusive' : 'verified';
  const confidence =
    outcome === 'rejected'
      ? Math.max(5, 30 - (failed.length - 1) * 10)
      : outcome === 'review'
      ? Math.max(35, 65 - (warned.length - 1) * 10)
      : outcome === 'inconclusive'
      ? 45
      : (tamper.fieldsChecked || []).length >= 2 || isPdf ? 100 : 92;

  const title = (parsed.title || '').trim();
  const domain = axes.includes(gemini?.competencyDomain)
    ? gemini.competencyDomain
    : inferAxisFromText(field.id, `${title} ${parsed.category.type} ${ocrText} ${fileName}`) || axes[0];
  const category = CATEGORIES.includes(gemini?.category) && parsed.category.type === 'Other' ? gemini.category : parsed.category.type;
  const scoring = parsed.scoring.requiresScoring || !gemini?.resultOrPlacement
    ? parsed.scoring
    : { requiresScoring: true, kind: 'placement', result: String(gemini.resultOrPlacement).slice(0, 40), evidence: 'vision model' };

  const describe = (g) => `${g.title}: ${g.detail}`;
  const forensics = {
    fileHash,
    fileSizeKB: Number((buffer.length / 1024).toFixed(1)),
    mimeType,
    dimensions: dims ? `${dims.width}×${dims.height}px` : geometry ? `${geometry.sourceWidth || geometry.width}×${geometry.sourceHeight || geometry.height}px` : 'Document',
    geometry: scene.geometry || geometry,
    scene: { verdict: scene.verdict, shape: scene.shape, text: scene.text },
    quality: { level: quality.level, metrics: quality.metrics },
    ocrAvailable: hasOcr,
    ocrProvider: layout.provider,
    layoutAvailable: layout.hasBoxes,
    identityVerified,
    certificateNumber,
    outcome,
    overallConfidence: confidence,
    confidenceLabel: outcome === 'verified' ? 'High' : outcome === 'rejected' ? 'High (problem found)' : 'Low — needs a person',
    passed: outcome !== 'rejected',
    isAiRejected: outcome === 'rejected',
    hasCriticalFail: outcome === 'rejected',
    identityMismatch: identityStatus === 'fail',
    requiresAdminQueue: outcome === 'review' || outcome === 'inconclusive',
    extractedRecipientName: identityVerified || !triggerName ? studentName : triggerName,
    extractedIssuer: issuer,
    eventCheck,
    tamper: { verdict: tamper.verdict, applicable: tamper.applicable, fieldsChecked: tamper.fieldsChecked || [], signals: tamper.signals, metrics: tamper.metrics, reason: tamper.reason || '' },
    gates,
    rejectionReasons: failed.map(describe),
    reviewReasons: [...warned, ...unknown].map(describe),
    inconclusiveReasons: unknown.map(describe),
    verdict:
      outcome === 'rejected'
        ? `Rejected — ${failed.map((g) => g.statusLabel.toLowerCase()).join(', ')}`
        : outcome === 'review'
        ? `Needs registrar review — ${warned.map((g) => g.statusLabel.toLowerCase()).join(', ')}`
        : outcome === 'inconclusive'
        ? `Unable to verify automatically — ${unknown.map((g) => g.statusLabel.toLowerCase()).join(', ')}`
        : `Verified — no problems found in ${gates.length} checks`,
    analyzedAt: new Date().toISOString()
  };

  return {
    engineUsed: `TrustTrace 8-check (${layout.provider === 'none' ? 'metadata only' : layout.provider}${gemini ? ' + Gemini' : ''})`,
    extracted: {
      studentName,
      studentId,
      achievementTitle: title || '',
      certificateHeading: parsed.heading,
      eventName: parsed.eventName,
      issuingOrganization: issuer,
      issuanceDate: parsed.issuanceDate || '',
      competencyDomain: domain,
      achievementType: category,
      typeConfidence: parsed.category.confidence,
      typeSignals: parsed.category.signals,
      requiresScoring: scoring.requiresScoring,
      achievementResult: scoring.result,
      resultKind: scoring.kind,
      certificateNumber,
      detected: { title: Boolean(title), issuer: Boolean(parsed.issuer), date: Boolean(parsed.issuanceDate), result: Boolean(scoring.result) },
      attainedLevel: 'Expert / Mastery',
      masteryScore: outcome === 'rejected' ? 0 : 100
    },
    forensics
  };
}
