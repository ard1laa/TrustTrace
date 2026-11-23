// Gate 2 name matching: case-, accent- and order-insensitive comparison of an
// OCR'd recipient name against the account holder's registered name.

const HONORIFICS = new Set([
  'dr', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'mx', 'sir', 'dato', 'datuk', 'tan', 'sri',
  'ir', 'ts', 'hon', 'rev', 'phd', 'msc', 'bsc', 'ba', 'ma', 'mba', 'jr', 'sr', 'ii', 'iii'
]);

// Patronymic / nobiliary connectors that carry no identity on their own.
const CONNECTORS = new Set([
  'bin', 'binti', 'bte', 'bt', 'b', 'a/l', 'a/p', 'al', 'ap', 'van', 'von', 'de', 'der', 'den', 'da',
  'das', 'do', 'dos', 'du', 'del', 'della', 'di', 'la', 'le', 'y', 'ibn', 'bint', 'abu', 'ben'
]);

export function normalizeName(raw) {
  return String(raw || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z\s./-]/g, ' ')
    .replace(/[./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameTokens(raw) {
  return normalizeName(raw)
    .split(' ')
    .filter((t) => t && !HONORIFICS.has(t) && !CONNECTORS.has(t));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

function similarity(a, b) {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

// Two tokens match when they are near-identical (OCR noise, transliteration)
// or when one is an initial of the other ("J" vs "Jordan").
function tokensMatch(a, b) {
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) return a[0] === b[0];
  const threshold = Math.min(a.length, b.length) <= 4 ? 0.75 : 0.8;
  return similarity(a, b) >= threshold;
}

// Returns { matched, score, matchedTokens, reason }.
export function compareNames(candidate, registered) {
  const cand = nameTokens(candidate);
  const reg = nameTokens(registered);
  if (!cand.length || !reg.length) {
    return { matched: false, score: 0, matchedTokens: 0, reason: 'Empty name after normalization.' };
  }

  // Concatenated comparison handles OCR that drops spaces ("JORDANTAYLOR").
  const joinedSimilarity = similarity(cand.join(''), reg.join(''));
  if (joinedSimilarity >= 0.88) {
    return { matched: true, score: joinedSimilarity, matchedTokens: reg.length, reason: 'Full-name match.' };
  }

  const used = new Set();
  let matched = 0;
  let fullWordMatches = 0;
  for (const r of reg) {
    const idx = cand.findIndex((c, i) => !used.has(i) && tokensMatch(c, r));
    if (idx >= 0) {
      used.add(idx);
      matched++;
      if (cand[idx].length > 1 && r.length > 1) fullWordMatches++;
    }
  }

  const coverage = matched / Math.min(reg.length, cand.length);
  // At least one full word must agree so two initials alone never pass.
  const required = Math.min(2, reg.length, cand.length);
  const isMatch = matched >= required && coverage >= 0.6 && fullWordMatches >= 1;

  return {
    matched: isMatch,
    score: Number(coverage.toFixed(2)),
    matchedTokens: matched,
    reason: isMatch
      ? `Matched ${matched} of ${reg.length} name parts.`
      : `Only ${matched} of ${reg.length} name parts matched "${candidate}".`
  };
}

// Searches free OCR text (line by line, with sliding windows) for the registered name.
export function findNameInText(text, registered) {
  const reg = nameTokens(registered);
  if (!reg.length || !text) return { found: false, score: 0, line: '' };
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let best = { found: false, score: 0, line: '' };

  for (const line of lines) {
    const tokens = nameTokens(line);
    if (!tokens.length) continue;
    const windowSize = Math.min(tokens.length, reg.length + 2);
    for (let start = 0; start + 1 <= tokens.length; start++) {
      const slice = tokens.slice(start, start + windowSize).join(' ');
      const result = compareNames(slice, registered);
      if (result.matched && result.score >= best.score) {
        best = { found: true, score: result.score, line };
      }
    }
  }
  return best;
}
