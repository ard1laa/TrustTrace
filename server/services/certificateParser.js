// Turns OCR lines into the fields of the submission form: title, issuer, date,
// category and scoring. Works with layout boxes (font size, centring) when the
// OCR provider has them, and falls back to reading order and keywords.

const NON_NAME_WORDS = new Set([
  'certificate', 'certification', 'achievement', 'excellence', 'completion', 'appreciation', 'participation',
  'recognition', 'award', 'awarded', 'presented', 'proudly', 'hereby', 'certifies', 'certify', 'that', 'this',
  'institute', 'university', 'universiti', 'college', 'faculty', 'school', 'department', 'office', 'registrar',
  'council', 'society', 'club', 'program', 'programme', 'course', 'workshop', 'symposium', 'hackathon', 'director',
  'president', 'dean', 'chairperson', 'professor', 'instructor', 'coordinator', 'date', 'issued', 'signature',
  'seal', 'verified', 'credential', 'honor', 'honours', 'distinction', 'of', 'the', 'and', 'for', 'in', 'place',
  'winner', 'champion', 'competition', 'seminar', 'conference', 'held', 'malaysia', 'technology'
]);

const RECIPIENT_TRIGGER =
  /(?:awarded\s+to|presented\s+to|certifies\s+that|certify\s+that|conferred\s+(?:up)?on|granted\s+to|recipient\s*:|student\s+name\s*:|name\s*:|diberikan\s+kepada|dianugerahkan\s+kepada)/i;

const HEADING_RE = /^(?:e-?)?(?:certificate|certification|sijil|award)\s+(?:of\s+)?([a-z]+)?/i;
const GENERIC_LINE_RE =
  /^(?:this\s+(?:is\s+to\s+)?certif|(?:is\s+)?(?:hereby\s+)?(?:proudly\s+)?(?:presented|awarded|given)\s+to|has\s+(?:successfully|participated|completed|attended)|in\s+recognition\s+of|for\s+(?:his|her|their)\b|we\s+hereby|signature|date\b|issued\s+on|certificate\s+(?:id|no|number)|serial|verify\s+at|www\.|https?:)/i;
const CONNECTOR_START_RE = /^(?:for|in|at|on|held|has|have|who|by|during|as|to|and|with|of|from|organi[sz]ed)\b/i;
const SIGNATORY_RE = /\b(dean|director|chair(?:man|person)?|president|vice[-\s]chancellor|rector|registrar|head\s+of|advisor|adviser|secretary|treasurer|coordinator|manager|ceo|signature|signed)\b/i;
const DATE_WORD_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

const EVENT_WORDS = [
  ['hackathon', 3], ['datathon', 3], ['ideathon', 3], ['competition', 2.5], ['championship', 2.5], ['contest', 2.5],
  ['olympiad', 2.5], ['challenge', 2], ['tournament', 2.5], ['cup', 1], ['league', 1], ['workshop', 2.5],
  ['bootcamp', 2.5], ['masterclass', 2.5], ['training', 2], ['course', 1.5], ['programme', 1.5], ['program', 1.5],
  ['seminar', 2.5], ['webinar', 2.5], ['conference', 2.5], ['symposium', 2.5], ['summit', 2], ['forum', 1.5],
  ['colloquium', 2], ['convention', 2], ['festival', 1.5], ['expo', 1.5], ['carnival', 1.5], ['camp', 1.5],
  ['games', 1], ['week', 1], ['day', 0.5], ['series', 1], ['session', 1], ['talk', 1.5], ['lecture', 1.5],
  ['debate', 2], ['moot', 2], ['quiz', 2], ['showcase', 1.5], ['exhibition', 1.5], ['jam', 1.5], ['marathon', 1.5]
];

// Phrases that introduce the event or programme name on most certificates.
const EVENT_INTRO_RE =
  /(?:for\s+(?:participating|taking\s+part|attending|completing|winning|achieving|being|his|her|their|outstanding|excellent|successfully)[^.]*?\b(?:in|at|of|the)\b|has\s+(?:successfully\s+)?(?:completed|participated\s+in|attended|finished)|in\s+recognition\s+of[^.]*?\b(?:in|at)\b|during\s+the|at\s+the)\s*$/i;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const CATEGORIES = ['Competition', 'Hackathon', 'Workshop', 'Seminar', 'Other'];

const CATEGORY_KEYWORDS = {
  Hackathon: [
    ['hackathon', 6], ['hack-a-thon', 6], ['datathon', 5], ['ideathon', 5], ['buildathon', 5], ['codefest', 5],
    ['game jam', 5], ['hack day', 4], ['coding marathon', 4], ['hackfest', 5], ['devpost', 3]
  ],
  Competition: [
    ['competition', 4], ['championship', 4], ['contest', 4], ['olympiad', 4], ['tournament', 4], ['challenge', 2],
    ['case competition', 4], ['pitching', 2.5], ['pitch competition', 4], ['debate', 3], ['moot', 3], ['quiz', 3],
    ['cup', 1.5], ['league', 1.5], ['finalist', 2.5], ['champion', 2.5], ['runner-up', 2.5], ['runner up', 2.5],
    ['1st place', 2.5], ['2nd place', 2.5], ['3rd place', 2.5], ['first place', 2.5], ['winner', 2], ['medal', 2],
    ['grand prize', 2.5], ['judges', 1.5], ['awarded', 0.5]
  ],
  Workshop: [
    ['workshop', 6], ['bootcamp', 4], ['boot camp', 4], ['masterclass', 4], ['master class', 4], ['hands-on', 3],
    ['training', 3], ['course', 2], ['short course', 3], ['tutorial', 2.5], ['clinic', 2.5], ['lab session', 3],
    ['certification programme', 2], ['certification program', 2], ['completion', 1.5], ['module', 1.5], ['skills', 0.5]
  ],
  Seminar: [
    ['seminar', 6], ['webinar', 6], ['conference', 4.5], ['symposium', 4.5], ['summit', 3], ['colloquium', 4],
    ['forum', 3], ['talk', 2], ['public lecture', 4], ['lecture', 3], ['panel', 2], ['keynote', 3],
    ['convention', 3], ['sharing session', 4], ['town hall', 2], ['attendance', 1.5], ['attended', 1.5]
  ]
};

function countPhrase(haystack, phrase) {
  const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+')}\\b`, 'gi');
  return (haystack.match(re) || []).length;
}

export function classifyCategory({ title = '', heading = '', text = '' }) {
  const body = String(text).toLowerCase();
  const focus = `${title} ${heading}`.toLowerCase();
  const scores = {};
  const signals = {};
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const [phrase, weight] of words) {
      // Words in the title or heading count three times as much as body text.
      const inFocus = countPhrase(focus, phrase);
      const inBody = Math.min(3, countPhrase(body, phrase));
      if (inFocus || inBody) {
        score += weight * (inFocus * 3 + Math.max(0, inBody - inFocus));
        (signals[category] ||= []).push(phrase);
      }
    }
    scores[category] = score;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, topScore] = ranked[0];
  const second = ranked[1][1];
  if (topScore < 2) return { type: 'Other', confidence: 0, signals: [], scores };
  const confidence = Math.round(Math.min(1, (topScore - second) / topScore + topScore / 40) * 100);
  return { type: top, confidence: Math.max(40, Math.min(99, confidence)), signals: [...new Set(signals[top])].slice(0, 4), scores };
}

// ---------------------------------------------------------------------------
// Scoring / results
// ---------------------------------------------------------------------------
const ORDINAL = { first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th' };

const RESULT_PATTERNS = [
  {
    kind: 'placement',
    re: /\b(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth)\s+(place|prize|position|runner[\s-]?up)\b/i,
    label: (m) => `${ORDINAL[m[1].toLowerCase()] || m[1]} ${/runner/i.test(m[2]) ? 'Runner-up' : m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase()}`
  },
  { kind: 'placement', re: /\b(grand\s+(?:prize|champion)|overall\s+champion|champions?|winners?)\b/i, label: (m) => (/grand/i.test(m[1]) ? 'Grand Prize' : /champ/i.test(m[1]) ? 'Champion' : 'Winner') },
  { kind: 'placement', re: /\b(runner[\s-]?up)\b/i, label: () => 'Runner-up' },
  { kind: 'placement', re: /\b(gold|silver|bronze)\s+(medal|award)\b/i, label: (m) => `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2].toLowerCase()}` },
  { kind: 'placement', re: /\b(finalist|semi[\s-]?finalist|top\s+\d{1,2})\b/i, label: (m) => m[1].replace(/\b\w/g, (c) => c.toUpperCase()) },
  { kind: 'placement', re: /\bbest\s+(paper|presenter|project|speaker|design|innovation|poster)(?:\s+award)?\b/i, label: (m) => `Best ${m[1].toLowerCase()}` },
  { kind: 'gpa', re: /\b(c?gpa|pngk|png)\s*(?:of|:|-)?\s*([0-4]\.\d{1,2})\b/i, label: (m) => `${m[1].toUpperCase()} ${m[2]}` },
  { kind: 'score', re: /\b(?:score|marks?|result)\s*(?:of|:|-)?\s*(\d{1,3}(?:\.\d+)?)\s*(%|\/\s*100|percent)?/i, label: (m) => `${m[1]}${m[2] ? '%' : ''}` },
  { kind: 'score', re: /\b(\d{2,3}(?:\.\d+)?)\s*%\s*(?:score|marks?)?/i, label: (m) => `${m[1]}%`, guard: (m) => Number(m[1]) <= 100 },
  { kind: 'grade', re: /\bgrade\s*(?::|-)?\s*([A-F][+-]?)\b/, label: (m) => `Grade ${m[1]}` },
  { kind: 'honour', re: /\bwith\s+(high\s+distinction|distinction|merit|honou?rs)\b|\bdean'?s\s+list\b/i, label: (m) => (m[1] ? `With ${m[1].toLowerCase()}` : "Dean's list") }
];

export function detectScoring(text) {
  const clean = String(text || '').replace(/\s+/g, ' ');
  for (const pattern of RESULT_PATTERNS) {
    const m = clean.match(pattern.re);
    if (m && (!pattern.guard || pattern.guard(m))) {
      return { requiresScoring: true, kind: pattern.kind, result: pattern.label(m), evidence: m[0] };
    }
  }
  return { requiresScoring: false, kind: null, result: '', evidence: '' };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function isoDate(y, m, d) {
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || y < 1990 || y > new Date().getFullYear() + 1) return null;
  return date.toISOString().slice(0, 10);
}

function datesInLine(line) {
  const out = [];
  let m;
  const dmy = /\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/g;
  while ((m = dmy.exec(line))) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) out.push(isoDate(+m[3], mon, +m[1]));
  }
  const mdy = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g;
  while ((m = mdy.exec(line))) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) out.push(isoDate(+m[3], mon, +m[2]));
  }
  const iso = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
  while ((m = iso.exec(line))) out.push(isoDate(+m[1], +m[2], +m[3]));
  // Numeric dates are read day-first (Malaysian/UK convention) unless that's impossible.
  const num = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g;
  while ((m = num.exec(line))) {
    const a = +m[1];
    const b = +m[2];
    out.push(a > 12 || b <= 12 ? isoDate(+m[3], b, a) : isoDate(+m[3], a, b));
  }
  return out.filter(Boolean);
}

export function extractDate(lines) {
  let best = null;
  lines.forEach((line, i) => {
    const found = datesInLine(line.text);
    if (!found.length) return;
    // Prefer dates labelled as the issue/event date; later lines usually hold it.
    const weight = (/\b(date|issued|held\s+on|on\b|tarikh)/i.test(line.text) ? 2 : 0) + i / Math.max(1, lines.length);
    if (!best || weight > best.weight) best = { date: found[found.length - 1], weight };
  });
  return best?.date || '';
}

// ---------------------------------------------------------------------------
// Names, issuer, title
// ---------------------------------------------------------------------------
export function looksLikePersonName(text) {
  const words = String(text || '').replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 7) return false;
  if (words.some((w) => NON_NAME_WORDS.has(w.toLowerCase()))) return false;
  if (/\d/.test(text)) return false;
  const letters = words.join('').replace(/[^A-Za-zÀ-ÿ'-]/g, '');
  return letters.length / words.join('').length >= 0.85;
}

// Only names introduced by an explicit phrase ("awarded to …") are trusted
// enough to reject a certificate.
export function extractRecipientFromTrigger(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].text;
    const m = line.match(RECIPIENT_TRIGGER);
    if (!m) continue;
    const after = line.slice(m.index + m[0].length).replace(/^[:\s\-–—]+/, '').trim();
    if (looksLikePersonName(after)) return { name: after, lineIndex: i };
    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      if (looksLikePersonName(lines[j].text)) return { name: lines[j].text.trim(), lineIndex: j };
    }
  }
  return null;
}

const ISSUER_STRONG = /\b(university|universiti|institute|institut|college|kolej|politeknik|polytechnic|academy|akademi|school\s+of|ministry|kementerian)\b/i;
const ISSUER_MEDIUM = /\b(faculty|fakulti|department|council|society|association|foundation|corporation|berhad|sdn\.?\s*bhd|inc\.?|ltd\.?|llc|ieee|acm|unesco|unicef|google|microsoft|amazon|aws|ibm|cisco|oracle|huawei|petronas|club|kelab|persatuan|organi[sz]ation|agency|centre|center)\b/i;

export function extractIssuer(lines) {
  let best = null;
  lines.forEach((line, i) => {
    const t = line.text.trim();
    if (t.length < 4 || t.length > 100 || SIGNATORY_RE.test(t) && !ISSUER_STRONG.test(t)) return;
    let score = ISSUER_STRONG.test(t) ? 3 : ISSUER_MEDIUM.test(t) ? 1.8 : 0;
    if (!score) return;
    if (/^(faculty|department|fakulti)\b/i.test(t)) score -= 0.6;
    if (CONNECTOR_START_RE.test(t) || /^(organi[sz]ed|in\s+collaboration|supported)\s+by/i.test(t)) score -= 0.4;
    score += line.box ? (1 - line.box.y) * 1.2 : (1 - i / Math.max(1, lines.length)) * 1.2;
    if (!best || score > best.score) best = { text: toTitleCase(t.replace(/^(organi[sz]ed|presented|issued)\s+by\s*/i, '')), score };
  });
  return best?.text || '';
}

function toTitleCase(text) {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return text;
  const small = new Set(['of', 'and', 'the', 'in', 'on', 'for', 'at', 'to', 'a', 'an', 'by', 'with']);
  return text
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w)) return w;
      if (/^(ai|ui|ux|it|iot|utm|um|ukm|usm|upm|uitm|ieee|acm|aws|gdg|nasa|ctf|stem|ml|nlp|api|ar|vr|xr|ii|iii|iv)$/i.test(w)) return w.toUpperCase();
      if (i > 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join('');
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Scores every line as a candidate title using font size (box height),
// centring, position, event keywords and the phrase that introduces it.
export function extractTitle(lines, { issuer = '', recipient = '' } = {}) {
  const heights = lines.filter((l) => l.box).map((l) => l.box.h);
  const medianH = median(heights) || 1;
  let heading = '';
  let headingType = '';
  const candidates = [];

  lines.forEach((line, i) => {
    const t = line.text.trim().replace(/\s+/g, ' ');
    const headingMatch = t.match(HEADING_RE);
    if (headingMatch && t.split(' ').length <= 5) {
      if (!heading) {
        heading = toTitleCase(t);
        headingType = (headingMatch[1] || '').toLowerCase();
      }
      return;
    }
    if (t.length < 5 || t.length > 110) return;
    if (recipient && t.toLowerCase().includes(recipient.toLowerCase())) return;
    if (looksLikePersonName(t) || GENERIC_LINE_RE.test(t) || SIGNATORY_RE.test(t)) return;
    if (datesInLine(t).length && t.length < 40) return;
    if (!/[a-z]{3,}/i.test(t)) return;

    let score = 0;
    const lower = t.toLowerCase();
    for (const [word, weight] of EVENT_WORDS) if (new RegExp(`\\b${word}s?\\b`).test(lower)) score += weight;
    if (/\b(19|20)\d{2}\b/.test(t)) score += 1; // "Hackathon 2025"
    if (line.box) {
      score += Math.min(3, (line.box.h / medianH - 1) * 2.2); // larger type
      const cx = line.box.x + line.box.w / 2;
      if (Math.abs(cx - 0.5) < 0.06) score += 0.8;
      if (line.box.y < 0.75) score += 0.4;
    }
    const prev = lines[i - 1]?.text || '';
    if (EVENT_INTRO_RE.test(prev)) score += 3;
    if (CONNECTOR_START_RE.test(t)) score -= 2.5;
    if (issuer && lower === issuer.toLowerCase()) score -= 3;
    else if (ISSUER_STRONG.test(t) && !EVENT_WORDS.some(([w]) => lower.includes(w))) score -= 2;
    if (/[.!?]$/.test(t) && t.split(' ').length > 8) score -= 1.5; // sentence, not a title
    candidates.push({ text: t, score });
  });

  // Inline "…in the UTM Hackathon 2025" with nothing on its own line.
  for (const line of lines) {
    const m = line.text.match(/\b(?:in|at|of)\s+(?:the\s+)?([A-Z0-9][\w&'’:-]*(?:\s+[A-Z0-9][\w&'’:-]*){1,9})/);
    if (m && EVENT_WORDS.some(([w]) => m[1].toLowerCase().includes(w))) candidates.push({ text: m[1], score: 2.5 });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const title = best && best.score >= 1.5 ? toTitleCase(best.text.replace(/^[“"']|[”"']$/g, '')) : '';
  return { title, heading, headingType, candidates: candidates.slice(0, 3) };
}

export function titleFromFilename(fileName = '') {
  const base = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(cert|certificate|scan|img|image|photo|doc|document|final|signed|a4|copy)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base || base.length < 4 || /^(img|dsc|screenshot|whatsapp|pxl|image|photo|scan)\s*[\d\s]*$/i.test(base)) return '';
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export function parseCertificate(lines, { fileName = '', hints = {} } = {}) {
  const trigger = extractRecipientFromTrigger(lines);
  const issuer = (hints.issuer || extractIssuer(lines)).trim();
  const { title: layoutTitle, heading, headingType, candidates } = extractTitle(lines, { issuer, recipient: trigger?.name });
  const title = (hints.title && hints.title.length > 4 ? hints.title : layoutTitle) || heading || titleFromFilename(fileName);
  const text = lines.map((l) => l.text).join('\n');
  const category = classifyCategory({ title, heading, text });
  const scoring = detectScoring(`${title}\n${text}`);

  // "Certificate of Participation" with no placement never needs a score.
  if (/participation|attendance|appreciation/.test(headingType) && scoring.kind === 'placement' && !/\b(1st|2nd|3rd|first|second|third|champion|winner|runner)/i.test(scoring.evidence)) {
    Object.assign(scoring, { requiresScoring: false, kind: null, result: '' });
  }

  return {
    title,
    heading,
    eventName: layoutTitle && layoutTitle !== heading ? layoutTitle : '',
    issuer,
    issuanceDate: hints.issuanceDate || extractDate(lines),
    recipient: trigger,
    category,
    scoring,
    titleCandidates: candidates
  };
}
