import { publicKeyFromDidDocument, verifyCredentialSignature } from './p256.js';
import { decodePortfolioText, verifyPortfolioPayload } from './portfolioQr.js';
import { loadSnapshot, saveSnapshot } from './offlineStore.js';

const ISSUER_KEY = 'issuer-did-document';

export async function cacheIssuerDid(didDocument) {
  if (didDocument?.verificationMethod) await saveSnapshot(ISSUER_KEY, didDocument);
}

// Issuer public key: network first (and cache it), cached copy when offline.
export async function getIssuerKey() {
  try {
    const res = await fetch('/api/did/issuer', { cache: 'no-store' });
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

  let offline = null;
  if (payload) {
    if (!key) return { error: 'This device has never been online, so it has no issuer key to verify against. Connect once, then try again.' };
    offline = verifyPortfolioPayload(payload, key);
  }

  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateLookup: lookup })
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
    if (offline) {
      return { mode: 'offline', holder: offline.holder, credentials: offline.credentials.map((c) => ({ ...c, revoked: false })), keySource: source, generatedAt: offline.generatedAt };
    }
    if (err.status) return { error: err.message };
    return { error: "You're offline and this code doesn't contain signed credentials. Ask the candidate for their TrustTrace portfolio QR." };
  }
}

function extractLookup(text, payload) {
  if (payload?.h?.d) return payload.h.d;
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
