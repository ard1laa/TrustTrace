// Field-of-study skill taxonomy shared by the API, the web app and (via
// GET /api/taxonomy) the Flutter app. Each field defines six radar axes.
//
// A credential's signed `competencyDomain` never changes after minting, so the
// axis a credential lands on is resolved at render time: exact axis match first,
// then keyword scoring over the credential text, then a legacy-domain fallback.

export const FIELDS = [
  {
    id: 'computer-science',
    label: 'Computer Science',
    axes: [
      { name: 'Computational Thinking', keywords: ['computational', 'problem solving', 'hackathon', 'olympiad', 'puzzle', 'challenge', 'ctf'] },
      { name: 'Programming', keywords: ['programming', 'coding', 'code', 'python', 'java', 'javascript', 'react', 'flutter', 'developer', 'software', 'web', 'app', 'mobile'] },
      { name: 'Logic & Algorithms', keywords: ['algorithm', 'logic', 'data structure', 'competitive', 'icpc', 'math', 'discrete', 'optimization'] },
      { name: 'System Architecture', keywords: ['architecture', 'system', 'cloud', 'aws', 'azure', 'devops', 'database', 'network', 'distributed', 'blockchain', 'infrastructure'] },
      { name: 'Data & AI', keywords: ['data', 'machine learning', 'ai', 'artificial intelligence', 'neural', 'analytics', 'deep learning', 'nlp', 'vision'] },
      { name: 'Collaboration', keywords: ['team', 'club', 'society', 'volunteer', 'lead', 'president', 'committee', 'community', 'mentor'] }
    ],
    benchmark: [76, 78, 74, 70, 72, 75]
  },
  {
    id: 'engineering',
    label: 'Engineering',
    axes: [
      { name: 'Design & Prototyping', keywords: ['design', 'prototype', 'cad', 'solidworks', 'fabrication', '3d print', 'maker'] },
      { name: 'Technical Analysis', keywords: ['analysis', 'simulation', 'matlab', 'calculation', 'modelling', 'modeling', 'testing'] },
      { name: 'Systems Integration', keywords: ['robotics', 'iot', 'embedded', 'arduino', 'esp32', 'circuit', 'electronics', 'control', 'mechatronics'] },
      { name: 'Project Management', keywords: ['project', 'management', 'planning', 'schedule', 'lead', 'coordinator', 'manager'] },
      { name: 'Safety & Standards', keywords: ['safety', 'standard', 'iso', 'quality', 'compliance', 'osha', 'risk', 'ethics'] },
      { name: 'Teamwork', keywords: ['team', 'club', 'society', 'volunteer', 'competition', 'community', 'committee'] }
    ],
    benchmark: [75, 74, 72, 70, 73, 77]
  },
  {
    id: 'biology',
    label: 'Biology',
    axes: [
      { name: 'Lab Research', keywords: ['lab', 'laboratory', 'research', 'pcr', 'microscopy', 'culture', 'assay', 'bench', 'wet lab'] },
      { name: 'Data Analysis', keywords: ['data', 'analysis', 'statistics', 'bioinformatics', 'r programming', 'spss', 'genomics', 'sequencing'] },
      { name: 'Scientific Method', keywords: ['scientific', 'experiment', 'hypothesis', 'methodology', 'thesis', 'symposium', 'publication', 'poster'] },
      { name: 'Bioethics', keywords: ['ethics', 'bioethics', 'integrity', 'compliance', 'consent', 'policy', 'welfare'] },
      { name: 'Field Work', keywords: ['field', 'ecology', 'conservation', 'expedition', 'marine', 'wildlife', 'sampling', 'environment'] },
      { name: 'Science Communication', keywords: ['communication', 'presentation', 'outreach', 'writing', 'teaching', 'tutor', 'public', 'volunteer'] }
    ],
    benchmark: [76, 73, 75, 70, 68, 72]
  },
  {
    id: 'business',
    label: 'Business',
    axes: [
      { name: 'Strategy', keywords: ['strategy', 'case competition', 'consulting', 'business plan', 'operations'] },
      { name: 'Finance & Analytics', keywords: ['finance', 'accounting', 'investment', 'analytics', 'excel', 'valuation', 'trading', 'economics'] },
      { name: 'Marketing', keywords: ['marketing', 'brand', 'social media', 'campaign', 'sales', 'digital', 'advertising'] },
      { name: 'Entrepreneurship', keywords: ['startup', 'entrepreneur', 'pitch', 'venture', 'innovation', 'incubator', 'founder'] },
      { name: 'Negotiation', keywords: ['negotiation', 'debate', 'mun', 'mediation', 'diplomacy', 'moot'] },
      { name: 'Leadership', keywords: ['lead', 'president', 'director', 'chair', 'head', 'captain', 'manager', 'exco', 'committee'] }
    ],
    benchmark: [74, 72, 73, 70, 69, 77]
  },
  {
    id: 'others',
    label: 'Others',
    axes: [
      { name: 'Leadership', keywords: ['lead', 'president', 'director', 'chair', 'head', 'captain', 'founder', 'exco', 'secretary', 'treasurer'] },
      { name: 'Communication', keywords: ['communication', 'presentation', 'writing', 'public speaking', 'media', 'journalism', 'debate'] },
      { name: 'Problem Solving', keywords: ['problem', 'hackathon', 'challenge', 'competition', 'analysis', 'innovation', 'case'] },
      { name: 'Adaptability', keywords: ['exchange', 'mobility', 'global', 'international', 'agile', 'bootcamp', 'adapt'] },
      { name: 'Teamwork', keywords: ['team', 'club', 'society', 'volunteer', 'community', 'committee', 'outreach', 'charity'] },
      { name: 'Critical Thinking', keywords: ['research', 'ethics', 'policy', 'critical', 'evaluation', 'reasoning', 'thesis'] }
    ],
    benchmark: [76, 75, 74, 72, 78, 71]
  }
];

export const DEFAULT_FIELD_ID = 'others';

// Original six domains used by credentials minted before field-aware axes.
export const LEGACY_DOMAINS = [
  'Computational Thinking',
  'Leadership',
  'Technical Engineering',
  'Adaptability',
  'Conflict Resolution',
  'Teamwork'
];

const LEGACY_AXIS_MAP = {
  'computer-science': {
    'Computational Thinking': 'Computational Thinking',
    'Technical Engineering': 'System Architecture',
    Leadership: 'Collaboration',
    Teamwork: 'Collaboration',
    Adaptability: 'Computational Thinking',
    'Conflict Resolution': 'Collaboration'
  },
  engineering: {
    'Computational Thinking': 'Technical Analysis',
    'Technical Engineering': 'Systems Integration',
    Leadership: 'Project Management',
    Teamwork: 'Teamwork',
    Adaptability: 'Design & Prototyping',
    'Conflict Resolution': 'Teamwork'
  },
  biology: {
    'Computational Thinking': 'Data Analysis',
    'Technical Engineering': 'Lab Research',
    Leadership: 'Science Communication',
    Teamwork: 'Science Communication',
    Adaptability: 'Field Work',
    'Conflict Resolution': 'Bioethics'
  },
  business: {
    'Computational Thinking': 'Finance & Analytics',
    'Technical Engineering': 'Strategy',
    Leadership: 'Leadership',
    Teamwork: 'Leadership',
    Adaptability: 'Entrepreneurship',
    'Conflict Resolution': 'Negotiation'
  },
  others: {
    'Computational Thinking': 'Problem Solving',
    'Technical Engineering': 'Problem Solving',
    Leadership: 'Leadership',
    Teamwork: 'Teamwork',
    Adaptability: 'Adaptability',
    'Conflict Resolution': 'Communication'
  }
};

export const AXIS_COLORS = ['#0A66C2', '#0F766E', '#7C3AED', '#B45309', '#BE185D', '#15803D'];

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

// Accepts a field id, a field label, or a free-text program ("BSc Computer Science").
export function resolveField(fieldOrProgram) {
  const q = normalize(fieldOrProgram);
  if (!q) return FIELDS.find((f) => f.id === DEFAULT_FIELD_ID);
  const exact = FIELDS.find((f) => f.id === q || normalize(f.label) === q);
  if (exact) return exact;
  const hints = [
    ['computer-science', ['computer', 'computing', 'software', 'information tech', 'it\\b', 'data science', 'cyber', 'informatics']],
    ['engineering', ['engineering', 'mechanical', 'electrical', 'civil', 'chemical eng', 'mechatronic']],
    ['biology', ['biology', 'biotech', 'biomedical', 'life science', 'microbio', 'genetics', 'biochem']],
    ['business', ['business', 'management', 'finance', 'accounting', 'marketing', 'economics', 'commerce', 'mba']]
  ];
  for (const [id, words] of hints) {
    if (words.some((w) => new RegExp(`\\b${w}`).test(q))) return FIELDS.find((f) => f.id === id);
  }
  return FIELDS.find((f) => f.id === DEFAULT_FIELD_ID);
}

export function fieldForUser(user) {
  return resolveField(user?.fieldOfStudy || user?.program);
}

export function axisNames(fieldOrProgram) {
  return resolveField(fieldOrProgram).axes.map((a) => a.name);
}

export function inferAxisFromText(fieldOrProgram, text) {
  const field = resolveField(fieldOrProgram);
  const haystack = ` ${normalize(text)} `;
  let best = null;
  let bestScore = 0;
  for (const axis of field.axes) {
    let score = 0;
    for (const kw of axis.keywords) {
      if (haystack.includes(kw)) score += kw.includes(' ') ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = axis.name;
    }
  }
  return best;
}

// Resolves which radar axis a credential contributes to for a given field.
export function axisForCredential(credential, fieldOrProgram) {
  const field = resolveField(fieldOrProgram);
  const names = field.axes.map((a) => a.name);
  const domain = credential?.competencyDomain || '';
  if (names.includes(domain)) return domain;

  const text = `${credential?.achievementTitle || ''} ${credential?.description || ''} ${credential?.issuingOrganization || ''}`;
  const byKeyword = inferAxisFromText(field.id, text);
  if (byKeyword) return byKeyword;

  const legacy = LEGACY_AXIS_MAP[field.id]?.[domain];
  if (legacy) return legacy;

  return names[names.length - 1];
}

export function axisColor(fieldOrProgram, axisName) {
  const idx = axisNames(fieldOrProgram).indexOf(axisName);
  return AXIS_COLORS[idx >= 0 ? idx : 0];
}

// Average mastery per axis, counting only credentials a viewer is allowed to see.
export function computeAxisScores(credentials, fieldOrProgram, { respectPrivacy = true } = {}) {
  const field = resolveField(fieldOrProgram);
  const buckets = new Map(field.axes.map((a) => [a.name, []]));
  for (const cred of credentials || []) {
    if (respectPrivacy && cred.isPublic === false) continue;
    if (cred.state === 'Draft' || cred.state === 'Revoked') continue;
    buckets.get(axisForCredential(cred, field.id))?.push(Number(cred.masteryScore) || 0);
  }
  return field.axes.map((axis, i) => {
    const scores = buckets.get(axis.name);
    const avg = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
    return { axis: axis.name, score: avg, count: scores.length, benchmark: field.benchmark[i], color: AXIS_COLORS[i] };
  });
}

export function publicTaxonomy() {
  return {
    defaultFieldId: DEFAULT_FIELD_ID,
    fields: FIELDS.map((f) => ({
      id: f.id,
      label: f.label,
      axes: f.axes.map((a) => ({ name: a.name, keywords: a.keywords })),
      benchmark: f.benchmark,
      legacyMap: LEGACY_AXIS_MAP[f.id]
    })),
    colors: AXIS_COLORS
  };
}
