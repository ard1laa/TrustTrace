// Field-of-study skill taxonomy shared by the API and the web app. The Flutter
// copy (flutter_app/lib/core/skill_taxonomy_data.dart) is generated from this
// file: run `npm run gen:taxonomy` after editing it.
//
// Programmes ("Accounting", "Mechanical Engineering", …) are what students pick.
// Each belongs to a family that defines the six radar axes and benchmark.
//
// A credential's signed `competencyDomain` never changes after minting, so the
// axis a credential lands on is resolved at render time: exact axis match first,
// then keyword scoring over the credential text, then a legacy-domain fallback.

const LEAD = ['lead', 'president', 'director', 'chair', 'head', 'captain', 'founder', 'exco', 'committee', 'secretary', 'treasurer'];
const TEAM = ['team', 'club', 'society', 'volunteer', 'community', 'committee', 'outreach', 'charity', 'collaboration'];

export const FIELDS = [
  {
    id: 'computer-science',
    label: 'Computing & IT',
    axes: [
      { name: 'Computational Thinking', keywords: ['computational', 'problem solving', 'hackathon', 'olympiad', 'puzzle', 'challenge', 'ctf'] },
      { name: 'Programming', keywords: ['programming', 'coding', 'code', 'python', 'java', 'javascript', 'react', 'flutter', 'developer', 'software', 'web', 'app', 'mobile'] },
      { name: 'Logic & Algorithms', keywords: ['algorithm', 'logic', 'data structure', 'competitive', 'icpc', 'math', 'discrete', 'optimization'] },
      { name: 'System Architecture', keywords: ['architecture', 'system', 'cloud', 'aws', 'azure', 'devops', 'database', 'network', 'distributed', 'blockchain', 'infrastructure', 'security', 'cyber'] },
      { name: 'Data & AI', keywords: ['data', 'machine learning', 'ai', 'artificial intelligence', 'neural', 'analytics', 'deep learning', 'nlp', 'vision'] },
      { name: 'Collaboration', keywords: ['team', 'club', 'society', 'volunteer', 'lead', 'president', 'committee', 'community', 'mentor'] }
    ],
    benchmark: [76, 78, 74, 70, 72, 75],
    legacyMap: {
      'Computational Thinking': 'Computational Thinking',
      'Technical Engineering': 'System Architecture',
      Leadership: 'Collaboration',
      Teamwork: 'Collaboration',
      Adaptability: 'Computational Thinking',
      'Conflict Resolution': 'Collaboration'
    }
  },
  {
    id: 'engineering',
    label: 'Engineering & Built Environment',
    axes: [
      { name: 'Design & Prototyping', keywords: ['design', 'prototype', 'cad', 'solidworks', 'autocad', 'revit', 'fabrication', '3d print', 'maker'] },
      { name: 'Technical Analysis', keywords: ['analysis', 'simulation', 'matlab', 'calculation', 'modelling', 'modeling', 'testing', 'ansys'] },
      { name: 'Systems Integration', keywords: ['robotics', 'iot', 'embedded', 'arduino', 'esp32', 'circuit', 'electronics', 'control', 'mechatronics', 'plc'] },
      { name: 'Project Management', keywords: ['project', 'management', 'planning', 'schedule', 'lead', 'coordinator', 'manager', 'construction'] },
      { name: 'Safety & Standards', keywords: ['safety', 'standard', 'iso', 'quality', 'compliance', 'osha', 'risk', 'ethics', 'sustainability'] },
      { name: 'Teamwork', keywords: ['team', 'club', 'society', 'volunteer', 'competition', 'community', 'committee'] }
    ],
    benchmark: [75, 74, 72, 70, 73, 77],
    legacyMap: {
      'Computational Thinking': 'Technical Analysis',
      'Technical Engineering': 'Systems Integration',
      Leadership: 'Project Management',
      Teamwork: 'Teamwork',
      Adaptability: 'Design & Prototyping',
      'Conflict Resolution': 'Teamwork'
    }
  },
  {
    id: 'science-math',
    label: 'Science & Mathematics',
    axes: [
      { name: 'Quantitative Reasoning', keywords: ['math', 'mathematics', 'olympiad', 'calculus', 'statistics', 'quantitative', 'actuarial', 'probability'] },
      { name: 'Experimental Methods', keywords: ['lab', 'laboratory', 'experiment', 'physics', 'chemistry', 'instrumentation', 'measurement'] },
      { name: 'Modelling & Computation', keywords: ['modelling', 'modeling', 'simulation', 'python', 'matlab', 'r programming', 'computational', 'data'] },
      { name: 'Scientific Research', keywords: ['research', 'thesis', 'publication', 'symposium', 'poster', 'conference', 'journal'] },
      { name: 'Science Communication', keywords: ['communication', 'presentation', 'outreach', 'teaching', 'tutor', 'writing', 'public'] },
      { name: 'Teamwork', keywords: TEAM }
    ],
    benchmark: [77, 73, 72, 71, 70, 74],
    legacyMap: {
      'Computational Thinking': 'Quantitative Reasoning',
      'Technical Engineering': 'Experimental Methods',
      Leadership: 'Teamwork',
      Teamwork: 'Teamwork',
      Adaptability: 'Modelling & Computation',
      'Conflict Resolution': 'Science Communication'
    }
  },
  {
    id: 'biology',
    label: 'Life Sciences',
    axes: [
      { name: 'Lab Research', keywords: ['lab', 'laboratory', 'research', 'pcr', 'microscopy', 'culture', 'assay', 'bench', 'wet lab'] },
      { name: 'Data Analysis', keywords: ['data', 'analysis', 'statistics', 'bioinformatics', 'r programming', 'spss', 'genomics', 'sequencing'] },
      { name: 'Scientific Method', keywords: ['scientific', 'experiment', 'hypothesis', 'methodology', 'thesis', 'symposium', 'publication', 'poster'] },
      { name: 'Bioethics', keywords: ['ethics', 'bioethics', 'integrity', 'compliance', 'consent', 'policy', 'welfare'] },
      { name: 'Field Work', keywords: ['field', 'ecology', 'conservation', 'expedition', 'marine', 'wildlife', 'sampling', 'environment', 'agriculture'] },
      { name: 'Science Communication', keywords: ['communication', 'presentation', 'outreach', 'writing', 'teaching', 'tutor', 'public', 'volunteer'] }
    ],
    benchmark: [76, 73, 75, 70, 68, 72],
    legacyMap: {
      'Computational Thinking': 'Data Analysis',
      'Technical Engineering': 'Lab Research',
      Leadership: 'Science Communication',
      Teamwork: 'Science Communication',
      Adaptability: 'Field Work',
      'Conflict Resolution': 'Bioethics'
    }
  },
  {
    id: 'health-sciences',
    label: 'Health & Medicine',
    axes: [
      { name: 'Clinical Skills', keywords: ['clinical', 'patient', 'hospital', 'ward', 'first aid', 'cpr', 'bls', 'acls', 'osce', 'surgery', 'medical camp', 'suturing'] },
      { name: 'Medical Knowledge', keywords: ['anatomy', 'physiology', 'pharmacology', 'pathology', 'medical', 'medicine', 'quiz', 'olympiad', 'biochemistry'] },
      { name: 'Research & Evidence', keywords: ['research', 'journal', 'publication', 'case report', 'evidence', 'poster', 'symposium', 'conference', 'thesis'] },
      { name: 'Patient Communication', keywords: ['communication', 'counselling', 'counseling', 'health education', 'awareness', 'campaign', 'talk', 'screening'] },
      { name: 'Ethics & Professionalism', keywords: ['ethics', 'professionalism', 'integrity', 'consent', 'law', 'policy', 'safety', 'infection control'] },
      { name: 'Teamwork & Leadership', keywords: [...LEAD, 'team', 'volunteer', 'club', 'society', 'mentor'] }
    ],
    benchmark: [78, 76, 72, 74, 75, 73],
    legacyMap: {
      'Computational Thinking': 'Research & Evidence',
      'Technical Engineering': 'Clinical Skills',
      Leadership: 'Teamwork & Leadership',
      Teamwork: 'Teamwork & Leadership',
      Adaptability: 'Clinical Skills',
      'Conflict Resolution': 'Patient Communication'
    }
  },
  {
    id: 'business',
    label: 'Business & Economics',
    axes: [
      { name: 'Strategy', keywords: ['strategy', 'case competition', 'consulting', 'business plan', 'operations', 'supply chain', 'logistics'] },
      { name: 'Finance & Analytics', keywords: ['finance', 'accounting', 'audit', 'tax', 'investment', 'analytics', 'excel', 'valuation', 'trading', 'economics', 'acca', 'cfa'] },
      { name: 'Marketing', keywords: ['marketing', 'brand', 'social media', 'campaign', 'sales', 'digital', 'advertising', 'tourism', 'hospitality'] },
      { name: 'Entrepreneurship', keywords: ['startup', 'entrepreneur', 'pitch', 'venture', 'innovation', 'incubator', 'founder'] },
      { name: 'Negotiation', keywords: ['negotiation', 'debate', 'mun', 'mediation', 'diplomacy', 'moot', 'human resource'] },
      { name: 'Leadership', keywords: [...LEAD, 'manager'] }
    ],
    benchmark: [74, 72, 73, 70, 69, 77],
    legacyMap: {
      'Computational Thinking': 'Finance & Analytics',
      'Technical Engineering': 'Strategy',
      Leadership: 'Leadership',
      Teamwork: 'Leadership',
      Adaptability: 'Entrepreneurship',
      'Conflict Resolution': 'Negotiation'
    }
  },
  {
    id: 'law-politics',
    label: 'Law & Politics',
    axes: [
      { name: 'Legal Research', keywords: ['research', 'case law', 'legal research', 'journal', 'thesis', 'analysis', 'policy'] },
      { name: 'Advocacy & Mooting', keywords: ['moot', 'mooting', 'advocacy', 'mock trial', 'debate', 'oratory', 'public speaking'] },
      { name: 'Legal Writing', keywords: ['writing', 'drafting', 'memorial', 'essay', 'article', 'publication', 'opinion'] },
      { name: 'Ethics & Justice', keywords: ['ethics', 'justice', 'human rights', 'pro bono', 'legal aid', 'integrity', 'criminology'] },
      { name: 'Negotiation & Mediation', keywords: ['negotiation', 'mediation', 'arbitration', 'dispute', 'diplomacy', 'mun', 'model united nations'] },
      { name: 'Leadership', keywords: LEAD }
    ],
    benchmark: [75, 74, 73, 72, 70, 74],
    legacyMap: {
      'Computational Thinking': 'Legal Research',
      'Technical Engineering': 'Legal Writing',
      Leadership: 'Leadership',
      Teamwork: 'Leadership',
      Adaptability: 'Advocacy & Mooting',
      'Conflict Resolution': 'Negotiation & Mediation'
    }
  },
  {
    id: 'creative',
    label: 'Design & Creative Arts',
    axes: [
      { name: 'Visual Design', keywords: ['design', 'graphic', 'typography', 'illustration', 'branding', 'poster', 'logo', 'visual', 'interior', 'fashion'] },
      { name: 'Creative Concept', keywords: ['creative', 'concept', 'idea', 'art direction', 'storytelling', 'ideation', 'architecture'] },
      { name: 'Digital Tools', keywords: ['photoshop', 'illustrator', 'figma', 'adobe', 'blender', '3d', 'animation', 'video', 'premiere', 'after effects', 'ui', 'ux'] },
      { name: 'Portfolio & Exhibition', keywords: ['exhibition', 'showcase', 'portfolio', 'gallery', 'festival', 'award', 'competition', 'film', 'music', 'performance'] },
      { name: 'Critique & Communication', keywords: ['critique', 'presentation', 'pitch', 'communication', 'writing', 'review'] },
      { name: 'Collaboration', keywords: TEAM }
    ],
    benchmark: [77, 75, 74, 72, 70, 73],
    legacyMap: {
      'Computational Thinking': 'Creative Concept',
      'Technical Engineering': 'Digital Tools',
      Leadership: 'Collaboration',
      Teamwork: 'Collaboration',
      Adaptability: 'Creative Concept',
      'Conflict Resolution': 'Critique & Communication'
    }
  },
  {
    id: 'humanities',
    label: 'Humanities, Education & Social Sciences',
    axes: [
      { name: 'Research & Analysis', keywords: ['research', 'analysis', 'thesis', 'survey', 'study', 'critical', 'psychology'] },
      { name: 'Writing & Communication', keywords: ['writing', 'journalism', 'communication', 'media', 'presentation', 'public speaking', 'debate', 'broadcast'] },
      { name: 'Cultural Awareness', keywords: ['culture', 'cultural', 'language', 'heritage', 'international', 'exchange', 'global', 'diversity'] },
      { name: 'Teaching & Mentoring', keywords: ['teaching', 'tutor', 'mentor', 'education', 'classroom', 'practicum', 'coaching', 'training'] },
      { name: 'Community Engagement', keywords: ['community', 'volunteer', 'outreach', 'charity', 'ngo', 'service', 'social'] },
      { name: 'Leadership', keywords: LEAD }
    ],
    benchmark: [73, 76, 72, 74, 75, 73],
    legacyMap: {
      'Computational Thinking': 'Research & Analysis',
      'Technical Engineering': 'Research & Analysis',
      Leadership: 'Leadership',
      Teamwork: 'Community Engagement',
      Adaptability: 'Cultural Awareness',
      'Conflict Resolution': 'Writing & Communication'
    }
  },
  {
    id: 'others',
    label: 'Other',
    axes: [
      { name: 'Leadership', keywords: LEAD },
      { name: 'Communication', keywords: ['communication', 'presentation', 'writing', 'public speaking', 'media', 'journalism', 'debate'] },
      { name: 'Problem Solving', keywords: ['problem', 'hackathon', 'challenge', 'competition', 'analysis', 'innovation', 'case'] },
      { name: 'Adaptability', keywords: ['exchange', 'mobility', 'global', 'international', 'agile', 'bootcamp', 'adapt'] },
      { name: 'Teamwork', keywords: TEAM },
      { name: 'Critical Thinking', keywords: ['research', 'ethics', 'policy', 'critical', 'evaluation', 'reasoning', 'thesis'] }
    ],
    benchmark: [76, 75, 74, 72, 78, 71],
    legacyMap: {
      'Computational Thinking': 'Problem Solving',
      'Technical Engineering': 'Problem Solving',
      Leadership: 'Leadership',
      Teamwork: 'Teamwork',
      Adaptability: 'Adaptability',
      'Conflict Resolution': 'Communication'
    }
  }
];

// [id, label, familyId, aliases]. The first five ids are the original field ids
// and must keep resolving for existing accounts.
const PROGRAM_ROWS = [
  ['computer-science', 'Computer Science', 'computer-science', ['computing', 'bcs', 'comp sci']],
  ['information-technology', 'Information Technology', 'computer-science', ['it', 'info tech', 'ict']],
  ['software-engineering', 'Software Engineering', 'computer-science', ['software']],
  ['data-science', 'Data Science & Analytics', 'computer-science', ['data science', 'analytics', 'big data']],
  ['artificial-intelligence', 'Artificial Intelligence', 'computer-science', ['ai', 'machine learning']],
  ['cybersecurity', 'Cybersecurity', 'computer-science', ['cyber security', 'information security', 'network security']],
  ['information-systems', 'Information Systems', 'computer-science', ['business information systems', 'mis']],
  ['computer-engineering', 'Computer Engineering', 'computer-science', []],
  ['networking-cloud', 'Networking & Cloud Computing', 'computer-science', ['networking', 'cloud computing']],
  ['game-development', 'Multimedia & Game Development', 'computer-science', ['game design', 'game development', 'multimedia computing']],

  ['engineering', 'Engineering (General)', 'engineering', []],
  ['mechanical-engineering', 'Mechanical Engineering', 'engineering', ['mechanical']],
  ['electrical-engineering', 'Electrical & Electronic Engineering', 'engineering', ['electrical', 'electronic', 'eee']],
  ['civil-engineering', 'Civil Engineering', 'engineering', ['civil', 'structural']],
  ['chemical-engineering', 'Chemical Engineering', 'engineering', ['chemical eng', 'process engineering']],
  ['mechatronics-engineering', 'Mechatronics Engineering', 'engineering', ['mechatronic', 'robotics']],
  ['aerospace-engineering', 'Aerospace Engineering', 'engineering', ['aeronautical', 'aerospace']],
  ['biomedical-engineering', 'Biomedical Engineering', 'engineering', ['biomedical eng']],
  ['petroleum-engineering', 'Petroleum Engineering', 'engineering', ['petroleum', 'oil and gas']],
  ['industrial-engineering', 'Industrial & Manufacturing Engineering', 'engineering', ['industrial', 'manufacturing']],
  ['environmental-engineering', 'Environmental Engineering', 'engineering', []],
  ['materials-engineering', 'Materials Engineering', 'engineering', ['materials science']],
  ['quantity-surveying', 'Quantity Surveying', 'engineering', ['quantity surveying', 'construction management']],

  ['mathematics', 'Mathematics', 'science-math', ['math', 'applied math']],
  ['statistics', 'Statistics', 'science-math', []],
  ['actuarial-science', 'Actuarial Science', 'science-math', ['actuarial']],
  ['physics', 'Physics', 'science-math', ['applied physics']],
  ['chemistry', 'Chemistry', 'science-math', ['industrial chemistry']],
  ['geology', 'Geology & Earth Science', 'science-math', ['geology', 'earth science', 'geoscience']],

  ['biology', 'Biology', 'biology', ['life science', 'bioscience']],
  ['biotechnology', 'Biotechnology', 'biology', ['biotech']],
  ['biochemistry', 'Biochemistry', 'biology', ['biochem']],
  ['microbiology', 'Microbiology', 'biology', ['microbio']],
  ['genetics', 'Genetics & Molecular Biology', 'biology', ['molecular biology', 'genetics']],
  ['environmental-science', 'Environmental Science', 'biology', ['environmental']],
  ['marine-science', 'Marine Science', 'biology', ['marine', 'oceanography']],
  ['food-science', 'Food Science & Technology', 'biology', ['food science', 'food technology']],
  ['agriculture', 'Agriculture & Plantation', 'biology', ['agriculture', 'agronomy', 'plantation']],

  ['medicine', 'Medicine (MBBS / MD)', 'health-sciences', ['mbbs', 'md', 'medical', 'medicine']],
  ['dentistry', 'Dentistry', 'health-sciences', ['dental', 'bds']],
  ['pharmacy', 'Pharmacy', 'health-sciences', ['pharmaceutical', 'bpharm']],
  ['nursing', 'Nursing', 'health-sciences', ['nurse']],
  ['physiotherapy', 'Physiotherapy', 'health-sciences', ['physical therapy']],
  ['public-health', 'Public Health', 'health-sciences', ['epidemiology', 'community health']],
  ['nutrition', 'Nutrition & Dietetics', 'health-sciences', ['dietetics', 'nutrition']],
  ['medical-lab-science', 'Biomedical & Medical Lab Science', 'health-sciences', ['medical laboratory', 'biomedical science']],
  ['optometry', 'Optometry', 'health-sciences', []],
  ['veterinary', 'Veterinary Medicine', 'health-sciences', ['veterinary', 'dvm']],

  ['business', 'Business Administration', 'business', ['bba', 'business', 'management', 'commerce', 'mba']],
  ['accounting', 'Accounting', 'business', ['accountancy', 'acca', 'audit']],
  ['finance', 'Finance & Banking', 'business', ['banking', 'finance']],
  ['islamic-finance', 'Islamic Finance', 'business', ['islamic banking']],
  ['economics', 'Economics', 'business', ['econs']],
  ['marketing', 'Marketing', 'business', ['digital marketing']],
  ['human-resource', 'Human Resource Management', 'business', ['hr', 'human resource']],
  ['international-business', 'International Business', 'business', []],
  ['supply-chain', 'Logistics & Supply Chain', 'business', ['logistics', 'supply chain']],
  ['entrepreneurship', 'Entrepreneurship', 'business', []],
  ['hospitality', 'Hospitality & Tourism', 'business', ['hotel', 'tourism', 'culinary', 'event management']],

  ['law', 'Law (LLB)', 'law-politics', ['llb', 'law', 'legal']],
  ['political-science', 'Political Science', 'law-politics', ['politics', 'public administration']],
  ['international-relations', 'International Relations', 'law-politics', ['diplomacy']],
  ['criminology', 'Criminology', 'law-politics', ['criminal justice', 'forensic science']],

  ['graphic-design', 'Graphic Design', 'creative', ['graphic', 'visual communication']],
  ['ui-ux-design', 'UI/UX & Interaction Design', 'creative', ['ui ux', 'user experience', 'interaction design']],
  ['architecture', 'Architecture', 'creative', ['architectural']],
  ['interior-design', 'Interior Design', 'creative', ['interior']],
  ['fashion-design', 'Fashion Design', 'creative', ['fashion']],
  ['animation', 'Animation & VFX', 'creative', ['vfx', 'visual effects']],
  ['film-media', 'Film & Media Production', 'creative', ['film', 'broadcasting', 'cinematography']],
  ['fine-arts', 'Fine Arts', 'creative', ['art', 'painting']],
  ['music', 'Music', 'creative', ['music performance']],
  ['performing-arts', 'Performing Arts', 'creative', ['theatre', 'drama', 'dance']],

  ['education', 'Education (Teaching)', 'humanities', ['teaching', 'b.ed', 'bed']],
  ['tesl', 'TESL / English Education', 'humanities', ['tesl', 'tesol']],
  ['psychology', 'Psychology', 'humanities', ['counselling', 'counseling']],
  ['mass-communication', 'Mass Communication', 'humanities', ['communication', 'media studies', 'public relations']],
  ['journalism', 'Journalism', 'humanities', []],
  ['english', 'English Language & Literature', 'humanities', ['literature', 'english']],
  ['languages', 'Languages & Linguistics', 'humanities', ['linguistics', 'translation']],
  ['history', 'History', 'humanities', []],
  ['sociology', 'Sociology & Anthropology', 'humanities', ['anthropology', 'social science']],
  ['social-work', 'Social Work', 'humanities', []],
  ['islamic-studies', 'Islamic Studies', 'humanities', ['usuluddin', 'syariah', 'shariah']],

  ['general-studies', 'Foundation / General Studies', 'others', ['foundation', 'diploma', 'matriculation', 'a-level', 'pre-university']],
  ['others', 'Other', 'others', []]
];

export const PROGRAMS = PROGRAM_ROWS.map(([id, label, family, aliases]) => ({ id, label, family, aliases }));

export const DEFAULT_FIELD_ID = 'others';

// Original six domains used by credentials minted before field-aware axes.
export const LEGACY_DOMAINS = ['Computational Thinking', 'Leadership', 'Technical Engineering', 'Adaptability', 'Conflict Resolution', 'Teamwork'];

export const AXIS_COLORS = ['#0A66C2', '#0F766E', '#7C3AED', '#B45309', '#BE185D', '#15803D'];

const FAMILY_BY_ID = new Map(FIELDS.map((f) => [f.id, f]));
const PROGRAM_BY_ID = new Map(PROGRAMS.map((p) => [p.id, p]));

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function programView(program) {
  const family = FAMILY_BY_ID.get(program.family);
  return { ...family, id: program.id, label: program.label, familyId: family.id, familyLabel: family.label };
}

export function isKnownFieldId(id) {
  return PROGRAM_BY_ID.has(id) || FAMILY_BY_ID.has(id);
}

// Accepts a programme id, a family id, a label, or free text ("BSc Accounting").
export function resolveField(fieldOrProgram) {
  const q = normalize(fieldOrProgram);
  if (!q) return programView(PROGRAM_BY_ID.get(DEFAULT_FIELD_ID));
  if (PROGRAM_BY_ID.has(q)) return programView(PROGRAM_BY_ID.get(q));
  const byLabel = PROGRAMS.find((p) => normalize(p.label) === q);
  if (byLabel) return programView(byLabel);
  const family = FIELDS.find((f) => f.id === q || normalize(f.label) === q);
  if (family) return { ...family, familyId: family.id, familyLabel: family.label };

  // Free text: the longest matching programme label or alias wins.
  let best = null;
  for (const p of PROGRAMS) {
    if (p.id === DEFAULT_FIELD_ID) continue;
    for (const phrase of [p.label.replace(/\s*\(.*\)$/, ''), ...p.aliases]) {
      const needle = normalize(phrase);
      if (needle.length >= 2 && new RegExp(`(^|[^a-z])${escapeRe(needle)}([^a-z]|$)`).test(q) && (!best || needle.length > best.len)) {
        best = { program: p, len: needle.length };
      }
    }
  }
  return programView(best?.program || PROGRAM_BY_ID.get(DEFAULT_FIELD_ID));
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

  const legacy = field.legacyMap?.[domain];
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

// Programmes grouped under their family, for grouped pickers.
export function programGroups() {
  return FIELDS.map((f) => ({ id: f.id, label: f.label, programs: PROGRAMS.filter((p) => p.family === f.id) }));
}

export function publicTaxonomy() {
  return {
    defaultFieldId: DEFAULT_FIELD_ID,
    fields: FIELDS.map((f) => ({ id: f.id, label: f.label, axes: f.axes.map((a) => ({ name: a.name, keywords: a.keywords })), benchmark: f.benchmark, legacyMap: f.legacyMap })),
    programs: PROGRAMS,
    colors: AXIS_COLORS
  };
}
