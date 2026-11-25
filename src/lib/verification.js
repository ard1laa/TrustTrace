import { publicKeyFromDidDocument, verifyCredentialSignature } from './p256.js';
import { decodePortfolioText, verifyPortfolioPayload, extractShareCode } from './portfolioQr.js';
import { loadSnapshot, saveSnapshot } from './offlineStore.js';

const ISSUER_KEY = 'issuer-did-document';
const timeout = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

export async function cacheIssuerDid(didDocument) {
  if (didDocument?.verificationMethod) await saveSnapshot(ISSUER_KEY, didDocument);
}

// Issuer public key: network first (and cache it), cached copy when offline.
export async function getIssuerKey() {
  try {
    const res = await fetch('/api/did/issuer', { cache: 'no-store', signal: timeout(8000) });
    if (res.ok) {
      const { didDocument } = await res.json();
      await cacheIssuerDid(didDocument);
      return { key: publicKeyFromDidDocument(didDocument), source: 'network' };
    }
  } catch {
    // offline
  }
  const cached = await loadSnapshot(ISSUER_KEY);
  return cached ? { key: publicKeyFromDidDocument(cached.value), source: 'cache', cachedAt: cached.savedAt } : { key: null, source: 'none' };
}

export function verifyStoredCredential(cred, key) {
  const vc = cred?.verifiableCredential;
  if (!vc?.proof?.r || !key) return false;
  return verifyCredentialSignature(vc, vc.proof.r, vc.proof.s, key).valid;
}

// Accepts anything a QR or pasted link may contain. Returns a result in one shape:
// { mode: 'online'|'offline', holder, credentials[{...,signatureValid, revoked}], error? }
export async function verifyScannedText(text) {
  const payload = decodePortfolioText(text);
  const lookup = extractLookup(text, payload);
  const { key, source } = await getIssuerKey();

  // Without the registrar's public key no signature can be checked — say so
  // rather than marking every credential as invalid.
  if (!key) {
    return {
      error: navigator.onLine === false
        ? 'This device has never been online, so it has no issuer key to verify against. Connect once, then try again.'
        : "Couldn't load the registrar's public key to check signatures. Check the connection and try again."
    };
  }
  const offline = payload ? verifyPortfolioPayload(payload, key) : null;

  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateLookup: lookup }),
      signal: timeout(25000)
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Not found'), { status: res.status });

    const holder = data.candidate || offline?.holder;
    const credentials = (data.candidateCredentials || []).map((c) => ({
      ...c,
      signatureValid: verifyStoredCredential(c, key),
      revoked: c.state === 'Revoked'
    }));
    return { mode: 'online', holder, credentials, latencyMs: data.verification?.latencyMs };
  } catch (err) {
    // The server answered (e.g. 404: account deleted or link withdrawn) — that wins over cached claims.
    if (err.status) return { error: err.message };
    if (offline) {
      return { mode: 'offline', holder: offline.holder, credentials: offline.credentials.map((c) => ({ ...c, revoked: false })), keySource: source, generatedAt: offline.generatedAt };
    }
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { error: 'The server took too long to respond (slow connection, or it is starting up). Try again in a moment.' };
    }
    return {
      error: extractShareCode(text)
        ? "You're offline. Short QR links need a connection to fetch the signed credentials — reconnect, or ask the candidate to show their Offline QR."
        : "You're offline and this code doesn't contain signed credentials. Ask the candidate for their TrustTrace Offline QR."
    };
  }
}

function extractLookup(text, payload) {
  if (payload?.h?.d) return payload.h.d;
  const code = extractShareCode(text);
  if (code) return code;
  const raw = String(text || '').trim();
  try {
    const parsed = JSON.parse(raw);
    return parsed.credentialId || parsed.studentDid || parsed.tokenId || raw;
  } catch {
    // not JSON
  }
  try {
    const url = new URL(raw);
    return url.searchParams.get('did') || url.searchParams.get('student') || url.searchParams.get('verify') || raw;
  } catch {
    return raw;
  }
}
