// Cross-checks a certificate's event and issuer against public sources.
//
//   • Web search (Brave Search API or Google Programmable Search) when a key
//     is configured: looks for the event name together with the issuer.
//   • Wikipedia (no key needed): confirms the issuing institution exists.
//   • DNS: any website or email domain printed on the certificate must resolve.
//
// Only the event and organisation names are sent — never the student's name.
// A missing web footprint is reported but never rejects on its own: small club
// events often have none.
import dns from 'dns/promises';

const TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();
const USER_AGENT = 'TrustTrace-CredentialVerifier/2.1 (certificate event cross-check)';

const STOPWORDS = new Set([
  'the', 'of', 'and', 'in', 'on', 'for', 'at', 'to', 'a', 'an', 'by', 'with', 'certificate', 'award', 'program',
  'programme', 'event', 'session', 'day', 'official', 'annual', 'edition', 'season'
]);

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^(19|20)\d{2}$/.test(t));
}

// Share of the needle's meaningful words that appear in the haystack.
function coverage(needle, haystack) {
  const want = [...new Set(tokens(needle))];
  if (!want.length) return 0;
  const have = new Set(tokens(haystack));
  return want.filter((t) => have.has(t)).length / want.length;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function webSearch(query) {
  const brave = (process.env.BRAVE_SEARCH_API_KEY || '').trim();
  if (brave) {
    const data = await getJson(`https://api.search.brave.com/res/v1/web/search?count=8&q=${encodeURIComponent(query)}`, { 'X-Subscription-Token': brave });
    return { provider: 'Brave Search', results: (data.web?.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.description || '' })) };
  }
  const gKey = (process.env.GOOGLE_SEARCH_API_KEY || '').trim();
  const gCx = (process.env.GOOGLE_SEARCH_CX || '').trim();
  if (gKey && gCx) {
    const data = await getJson(`https://www.googleapis.com/customsearch/v1?num=8&key=${encodeURIComponent(gKey)}&cx=${encodeURIComponent(gCx)}&q=${encodeURIComponent(query)}`);
    return { provider: 'Google Search', results: (data.items || []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet || '' })) };
  }
  return null;
}

async function wikipediaLookup(name) {
  const data = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(name)}`);
  return (data.query?.search || []).map((r) => ({
    title: r.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    snippet: String(r.snippet || '').replace(/<[^>]+>/g, '')
  }));
}

function domainsIn(text) {
  const found = new Set();
  const re = /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+(?:com|org|net|edu|gov|my|sg|io|ai|dev|app|co|uk|au|in|id|ph|th|vn|cn|jp|kr|info|tech))\b/gi;
  let m;
  while ((m = re.exec(String(text || '')))) found.add(m[1].toLowerCase());
  const emails = String(text || '').match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi) || [];
  for (const e of emails) found.add(e.split('@')[1].toLowerCase());
  return [...found].slice(0, 4);
}

async function domainResolves(domain) {
  try {
    const records = await Promise.any([dns.resolve4(domain), dns.resolveMx(domain), dns.resolve6(domain)]);
    return records.length > 0;
  } catch {
    return false;
  }
}

function settle(promise) {
  return promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));
}

export async function crossCheckEvent({ eventName = '', issuer = '', text = '' }) {
  if (process.env.EVENT_CROSSCHECK === 'off') {
    return { status: 'skipped', detail: 'Online cross-check is turned off on this server.', evidence: [] };
  }
  const event = String(eventName).trim();
  const org = String(issuer).trim();
  if (!event && !org) return { status: 'skipped', detail: 'No event or issuer name was readable.', evidence: [] };

  const key = `${event}|${org}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const query = [event && `"${event}"`, org].filter(Boolean).join(' ');
  const domains = domainsIn(text);
  const [search, wiki, dnsChecks] = await Promise.all([
    settle(query ? webSearch(query) : Promise.resolve(null)),
    settle(org ? wikipediaLookup(org) : Promise.resolve([])),
    Promise.all(domains.map(async (d) => ({ domain: d, resolves: await domainResolves(d) })))
  ]);

  const evidence = [];
  let eventFound = false;
  let issuerFound = false;
  let provider = 'Wikipedia';
  const networkFailed = !search.ok && !wiki.ok;

  if (search.ok && search.value) {
    provider = `${search.value.provider} + Wikipedia`;
    for (const r of search.value.results) {
      const blob = `${r.title} ${r.snippet} ${r.url}`;
      const eventScore = event ? coverage(event, blob) : 0;
      const orgScore = org ? coverage(org, blob) : 0;
      if (eventScore >= 0.75) {
        eventFound = true;
        evidence.push({ kind: 'event', title: r.title, url: r.url });
      } else if (orgScore >= 0.75) {
        issuerFound = true;
        if (evidence.length < 4) evidence.push({ kind: 'issuer', title: r.title, url: r.url });
      }
    }
  }
  if (wiki.ok) {
    for (const r of wiki.value) {
      if (org && coverage(org, `${r.title} ${r.snippet}`) >= 0.75) {
        issuerFound = true;
        evidence.push({ kind: 'issuer', title: r.title, url: r.url });
        break;
      }
    }
  }
  const deadDomains = dnsChecks.filter((d) => !d.resolves).map((d) => d.domain);
  const liveDomains = dnsChecks.filter((d) => d.resolves).map((d) => d.domain);
  if (liveDomains.length) issuerFound = true;

  let status;
  let detail;
  if (networkFailed && !dnsChecks.length) {
    status = 'unavailable';
    detail = 'Could not reach online sources; the check was skipped.';
  } else if (eventFound) {
    status = 'confirmed';
    detail = `"${event}" was found online${issuerFound ? ` alongside ${org}` : ''}.`;
  } else if (issuerFound) {
    status = 'issuer-confirmed';
    detail = `${org || liveDomains[0]} is a real organisation${event ? '; the event itself has no public listing' : ''}.`;
  } else {
    status = 'not-found';
    detail = `No public record of ${event ? `"${event}"` : 'this event'}${org ? ` or ${org}` : ''} was found.`;
  }
  if (deadDomains.length) detail += ` Website ${deadDomains.join(', ')} printed on the certificate does not exist.`;

  const value = { status, detail, provider, evidence: evidence.slice(0, 4), domains: dnsChecks, deadDomains, searchConfigured: Boolean(search.ok && search.value) };
  if (status !== 'unavailable') cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}
