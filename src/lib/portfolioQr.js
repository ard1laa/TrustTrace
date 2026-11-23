// Self-contained portfolio QR payload ("TT1"). Carries the signed claims of the
// holder's most recent public credentials so a recruiter can verify signatures
// with no network. Same format is produced/consumed by the Flutter app
// (flutter_app/lib/core/portfolio_qr.dart).
//
// QR text: <origin>/verify?did=<did>#tt1=<base64url(json)>
// json: { v:1, h:{d,n,s,f,u}, c:[{i,t,o,dt,cd,l,m,g,n?,s?}], x }
//   g = base64url(r || s), each 32 bytes

import { verifyCredentialSignature, ISSUER_DID } from './p256.js';

export const MAX_QR_CREDENTIALS = 4;

function b64urlEncode(bytes) {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const hexToBytes = (hex) => Uint8Array.from(hex.replace(/^0x/, '').match(/.{2}/g).map((h) => parseInt(h, 16)));
const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function buildPortfolioPayload(holder, credentials) {
  const eligible = credentials
    .filter((c) => c.isPublic !== false && c.state === 'Locked' && c.verifiableCredential?.proof?.r)
    .sort((a, b) => String(b.issuanceDate).localeCompare(String(a.issuanceDate)))
    .slice(0, MAX_QR_CREDENTIALS);

  return {
    v: 1,
    h: {
      d: holder.did,
      n: holder.name,
      s: holder.studentId || '',
      f: holder.fieldOfStudy || '',
      u: holder.university || ''
    },
    c: eligible.map((cred) => {
      const vc = cred.verifiableCredential;
      const subj = vc.credentialSubject;
      const sig = new Uint8Array(64);
      sig.set(hexToBytes(vc.proof.r.padStart(66, '0').slice(-64)), 0);
      sig.set(hexToBytes(vc.proof.s.padStart(66, '0').slice(-64)), 32);
      const entry = {
        i: cred.id,
        t: subj.achievementTitle,
        o: subj.issuingOrganization,
        dt: vc.issuanceDate,
        cd: subj.competencyDomain,
        l: subj.attainedLevel,
        m: Number(subj.masteryScore),
        g: b64urlEncode(sig)
      };
      // Signed claims keep the name/ID used at issuance, which may differ from today's profile.
      if (subj.name !== holder.name) entry.n = subj.name;
      if ((subj.studentId || '') !== (holder.studentId || '')) entry.s = subj.studentId || '';
      return entry;
    }),
    x: new Date().toISOString()
  };
}

export function encodePortfolioUrl(payload, origin = window.location.origin) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  return `${origin}/verify?did=${encodeURIComponent(payload.h.d)}#tt1=${b64urlEncode(json)}`;
}

export function decodePortfolioText(text) {
  const match = String(text || '').match(/[#&?]tt1=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(match[1])));
    return payload?.v === 1 && payload.h?.d && Array.isArray(payload.c) ? payload : null;
  } catch {
    return null;
  }
}

// Rebuilds each signed claim from the payload and checks it against the issuer key.
export function verifyPortfolioPayload(payload, publicKey) {
  const holder = payload.h;
  const credentials = payload.c.map((c) => {
    const sig = b64urlDecode(c.g);
    const claim = {
      issuer: ISSUER_DID,
      issuanceDate: c.dt,
      credentialSubject: {
        id: holder.d,
        name: c.n ?? holder.n,
        studentId: c.s ?? holder.s,
        achievementTitle: c.t,
        issuingOrganization: c.o,
        competencyDomain: c.cd,
        attainedLevel: c.l,
        masteryScore: c.m
      }
    };
    const result = verifyCredentialSignature(claim, bytesToHex(sig.slice(0, 32)), bytesToHex(sig.slice(32)), publicKey);
    return {
      id: c.i,
      achievementTitle: c.t,
      issuingOrganization: c.o,
      issuanceDate: c.dt,
      competencyDomain: c.cd,
      attainedLevel: c.l,
      masteryScore: c.m,
      state: 'Locked',
      isPublic: true,
      credentialHash: result.hash,
      signatureValid: result.valid
    };
  });
  return {
    holder: { did: holder.d, name: holder.n, studentId: holder.s, fieldOfStudy: holder.f, university: holder.u },
    credentials,
    allValid: credentials.length > 0 && credentials.every((c) => c.signatureValid),
    generatedAt: payload.x
  };
}
