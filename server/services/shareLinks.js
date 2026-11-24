// Short share links for QR codes.
//
// A QR used to carry the full signed portfolio (~1 KB), which made it dense and
// hard to scan from a distance. It now carries only a short URL:
//   https://<host>/v/<code>        e.g. https://trusttrace.app/v/7kq2m9xd
// The scanner sends the code to /api/verify, receives the signed credentials,
// and checks each ECDSA signature locally against the issuer's DID key.
//
// Codes are derived from the record id, so every server instance (and every
// restart) produces the same code with no migration or extra storage.
import crypto from 'crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32, no i/l/o/u
const CODE_LENGTH = 8; // 40 bits

export function shareCodeFor(id) {
  const digest = crypto.createHash('sha256').update(`trusttrace-share:${id}`).digest();
  let bits = 0n;
  for (let i = 0; i < 5; i++) bits = (bits << 8n) | BigInt(digest[i]);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code = ALPHABET[Number(bits & 31n)] + code;
    bits >>= 5n;
  }
  return code;
}

// Accepts a bare code, "/v/<code>" URL, or "trusttrace:v:<code>"; tolerant of
// case and of the characters people confuse when typing (o→0, i/l→1).
export function parseShareCode(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/(?:\/v\/|^trusttrace:v:)([0-9a-z-]{8,12})(?:[/?#]|$)/i) || text.match(/^([0-9a-z]{4}-?[0-9a-z]{4})$/i);
  if (!match) return null;
  const code = match[1]
    .toLowerCase()
    .replace(/-/g, '')
    .replace(/o/g, '0')
    .replace(/[il]/g, '1');
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

// Finds the student or credential a code points to.
export function resolveShareCode(state, code) {
  if (!code) return null;
  const user = state.users.find((u) => (u.shareCode || shareCodeFor(u.id)) === code);
  if (user) return { kind: 'portfolio', user };
  const credential = state.credentials.find((c) => (c.shareCode || shareCodeFor(c.id)) === code);
  return credential ? { kind: 'credential', credential } : null;
}
