// Account verification for recruiters and university staff, and the hidden
// developer mode used to present demo accounts.
import crypto from 'crypto';
import { signJwt, verifyJwt } from './auth.js';
import { classifyEmail as classifyShared } from '../../shared/emailDomains.js';

export const ACCOUNT_STATUS = {
  verified: 'verified',
  pending: 'pending_verification',
  rejected: 'rejected'
};

const PROOF_TYPES = /^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,/;
export const MAX_PROOF_BYTES = 4 * 1024 * 1024;

export function requiresVerification(role) {
  return role === 'recruiter' || role === 'admin';
}

// Describes how an email domain counts towards staff/recruiter verification.
export function classifyEmail(email, role) {
  const extra = (process.env.INSTITUTION_EMAIL_DOMAINS || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  return classifyShared(email, role, extra);
}

export function validateProof(proof) {
  if (!proof?.dataUrl) return null;
  if (!PROOF_TYPES.test(proof.dataUrl)) return 'Proof must be a PNG, JPEG, WebP image or a PDF.';
  if (Buffer.byteLength(proof.dataUrl) > MAX_PROOF_BYTES * 1.37) return 'Proof document is too large (max 4 MB).';
  return null;
}

// Returns an error message, or null when the registration may proceed.
export function checkStaffRegistration(role, email, proof) {
  if (!requiresVerification(role)) return null;
  const info = classifyEmail(email, role);
  if (info.kind === 'disposable') return 'Disposable email addresses are not accepted.';
  const proofError = validateProof(proof);
  if (proofError) return proofError;
  if (!info.institutional && !proof?.dataUrl) {
    return role === 'admin'
      ? 'Use your university email address, or upload your staff ID to verify your role.'
      : 'Use your company email address, or upload your corporate ID to verify your role.';
  }
  return null;
}

export function buildProofRecord(proof) {
  if (!proof?.dataUrl) return null;
  return {
    fileName: String(proof.fileName || 'proof').slice(0, 120),
    mimeType: proof.dataUrl.slice(5, proof.dataUrl.indexOf(';')),
    dataUrl: proof.dataUrl,
    sizeKB: Math.round((Buffer.byteLength(proof.dataUrl) * 0.75) / 1024),
    uploadedAt: new Date().toISOString()
  };
}

export function verificationSummary(user) {
  if (!requiresVerification(user.role)) return null;
  const info = classifyEmail(user.email, user.role);
  return {
    status: user.accountStatus || ACCOUNT_STATUS.verified,
    emailDomain: info.domain,
    emailKind: info.kind,
    institutionalEmail: info.institutional,
    proof: user.verificationProof
      ? { fileName: user.verificationProof.fileName, mimeType: user.verificationProof.mimeType, sizeKB: user.verificationProof.sizeKB, uploadedAt: user.verificationProof.uploadedAt }
      : null,
    submittedAt: user.verificationRequestedAt || user.createdAt,
    reviewedAt: user.verificationReviewedAt || null,
    reviewedBy: user.verificationReviewedBy || null,
    note: user.verificationNote || ''
  };
}

export function isActive(user) {
  return (user?.accountStatus || ACCOUNT_STATUS.verified) === ACCOUNT_STATUS.verified;
}

// ---------------------------------------------------------------------------
// Developer mode
// ---------------------------------------------------------------------------
const DEV_TOKEN_HOURS = 12;

function developerEmails() {
  return (process.env.DEVELOPER_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isDeveloperEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  return Boolean(clean) && developerEmails().includes(clean);
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function developerKeyConfigured() {
  return Boolean((process.env.DEVELOPER_ACCESS_KEY || '').trim());
}

export function checkDeveloperKey(key) {
  const expected = (process.env.DEVELOPER_ACCESS_KEY || '').trim();
  return Boolean(expected) && safeEqual(String(key || '').trim(), expected);
}

export function issueDeveloperToken(subject) {
  return signJwt({ scope: 'developer', sub: subject }, DEV_TOKEN_HOURS * 3600);
}

// A request is in developer mode when it carries a valid developer token, or
// it's signed in as a developer email.
export function hasDeveloperAccess(req) {
  const token = req.headers['x-developer-token'];
  if (token) {
    const payload = verifyJwt(token);
    if (payload?.scope === 'developer') return true;
  }
  return isDeveloperEmail(req.user?.email);
}
