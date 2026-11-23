// Offline ECDSA (NIST P-256 / secp256r1) verification for TrustTrace credentials.
// Pure JS with BigInt so it also works on plain-HTTP LAN origins where
// crypto.subtle is unavailable. Mirrors server/crypto/ecdsaEngine.js.

const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const A = P - 3n;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const G = {
  x: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
  y: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n
};

export const ISSUER_DID = 'did:trusttrace:university-registrar';

const mod = (a, m = P) => {
  const r = a % m;
  return r >= 0n ? r : r + m;
};

function inv(a, m = P) {
  let [r0, r1] = [mod(a, m), m];
  let [s0, s1] = [1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return mod(s0, m);
}

function add(p1, p2) {
  if (!p1) return p2;
  if (!p2) return p1;
  if (p1.x === p2.x && p1.y !== p2.y) return null;
  const lambda =
    p1.x === p2.x
      ? mod((3n * p1.x * p1.x + A) * inv(2n * p1.y))
      : mod((p2.y - p1.y) * inv(mod(p2.x - p1.x)));
  const x = mod(lambda * lambda - p1.x - p2.x);
  return { x, y: mod(lambda * (p1.x - x) - p1.y) };
}

function mul(k, point) {
  let result = null;
  let addend = point;
  let n = mod(k, N);
  while (n > 0n) {
    if (n & 1n) result = add(result, addend);
    addend = add(addend, addend);
    n >>= 1n;
  }
  return result;
}

// --- SHA-256 (synchronous, small) -------------------------------------------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

export function sha256Hex(message) {
  const bytes = new TextEncoder().encode(message);
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen >>> 0);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));

  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}

// Must match computeCredentialHash() on the server byte-for-byte.
export function canonicalCredentialJson({ issuer = ISSUER_DID, issuanceDate, credentialSubject: s }) {
  return JSON.stringify({
    issuer,
    issuanceDate,
    credentialSubject: {
      id: s.id,
      name: s.name,
      studentId: s.studentId || '',
      achievementTitle: s.achievementTitle,
      issuingOrganization: s.issuingOrganization,
      competencyDomain: s.competencyDomain,
      attainedLevel: s.attainedLevel,
      masteryScore: Number(s.masteryScore)
    }
  });
}

export function publicKeyFromDidDocument(didDocument) {
  const vm = didDocument?.verificationMethod?.[0];
  const coords = vm?.publicKeyCoordinates;
  if (coords?.Qx && coords?.Qy) return { x: BigInt(coords.Qx), y: BigInt(coords.Qy) };
  const hex = (vm?.publicKeyHex || '').replace(/^0x/, '');
  if (hex.length === 130 && hex.startsWith('04')) {
    return { x: BigInt('0x' + hex.slice(2, 66)), y: BigInt('0x' + hex.slice(66)) };
  }
  return null;
}

// Returns { valid, hash } for a claim + r/s signature against the issuer key.
export function verifyCredentialSignature(claim, rHex, sHex, publicKey) {
  const hash = sha256Hex(canonicalCredentialJson(claim));
  try {
    const r = BigInt('0x' + String(rHex).replace(/^0x/, ''));
    const s = BigInt('0x' + String(sHex).replace(/^0x/, ''));
    if (!publicKey || r <= 0n || r >= N || s <= 0n || s >= N) return { valid: false, hash };
    const w = inv(s, N);
    const z = mod(BigInt('0x' + hash), N);
    const X = add(mul(mod(z * w, N), G), mul(mod(r * w, N), publicKey));
    return { valid: Boolean(X) && mod(X.x, N) === r, hash: `0x${hash}` };
  } catch {
    return { valid: false, hash: `0x${hash}` };
  }
}
