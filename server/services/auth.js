import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'trusttrace-dev-secret-change-me';
// Short-lived access tokens, renewed silently with a rotating refresh token.
export const ACCESS_TOKEN_TTL_SECONDS = Math.max(60, Number(process.env.ACCESS_TOKEN_TTL_MINUTES || 120) * 60);
const REFRESH_IDLE_DAYS = Math.max(1, Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30));
const REFRESH_MAX_DAYS = 180;
const MAX_SESSIONS = 10;
// A rotated refresh token stays usable briefly so two tabs refreshing at once don't sign each other out.
const ROTATION_GRACE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[auth] JWT_SECRET is not set; using an insecure development secret.');
}

// ---------------------------------------------------------------------------
// Passwords: salted scrypt, stored as "scrypt$<salt>$<hash>". Legacy unsalted
// SHA-256 hashes still verify and are upgraded on the next successful login.
// ---------------------------------------------------------------------------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || password === undefined || password === null) return { ok: false };
  const value = String(password);
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    const candidate = crypto.scryptSync(value, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    const ok = expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
    return { ok, needsUpgrade: false };
  }
  const legacy = crypto.createHash('sha256').update(value).digest('hex');
  const ok = legacy.length === stored.length && crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored));
  return { ok, needsUpgrade: ok };
}

// ---------------------------------------------------------------------------
// HS256 JWT
// ---------------------------------------------------------------------------
export function signJwt(payload, ttlSeconds = ACCESS_TOKEN_TTL_SECONDS) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    // Tokens issued before this change stored exp in milliseconds.
    const expSeconds = payload.exp > 1e12 ? Math.floor(payload.exp / 1000) : payload.exp;
    if (!expSeconds || expSeconds < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sealed payloads: tamper-proof (HMAC) JSON a client carries and hands back,
// e.g. a scan result. Not encrypted — never put secrets in one.
// ---------------------------------------------------------------------------
export function sealPayload(payload, ttlSeconds) {
  const body = Buffer.from(JSON.stringify({ p: payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  const sig = crypto.createHmac('sha256', `${JWT_SECRET}:sealed`).update(body).digest('base64url');
  return `${body}.${sig}`;
}

// Returns { payload } or { error: 'invalid' | 'expired' }.
export function openPayload(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return { error: 'invalid' };
  const expected = crypto.createHmac('sha256', `${JWT_SECRET}:sealed`).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { error: 'invalid' };
  try {
    const { p, exp } = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (exp < Math.floor(Date.now() / 1000)) return { error: 'expired' };
    return { payload: p };
  } catch {
    return { error: 'invalid' };
  }
}

// ---------------------------------------------------------------------------
// Sessions. Each sign-in creates a session on the user record holding hashed
// refresh tokens. Refreshing rotates the token; signing out or changing the
// password removes sessions, which also invalidates their access tokens.
// Refresh token format: rt1.<base64url(userId)>.<sessionId>.<secret>
// ---------------------------------------------------------------------------
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function pruneSessions(user, now = Date.now()) {
  user.sessions = (user.sessions || [])
    .map((s) => ({ ...s, tokens: (s.tokens || []).filter((t) => t.expiresAt > now) }))
    .filter((s) => s.tokens.length && s.expiresAt > now && s.absoluteExpiresAt > now);
}

function addToken(session, now) {
  const secret = crypto.randomBytes(32).toString('base64url');
  session.tokens.push({ hash: sha256(secret), expiresAt: now + REFRESH_IDLE_DAYS * DAY_MS });
  session.tokens = session.tokens.slice(-4);
  session.expiresAt = now + REFRESH_IDLE_DAYS * DAY_MS;
  session.lastUsedAt = new Date(now).toISOString();
  return secret;
}

function issueTokens(user, session, secret) {
  return {
    token: signJwt({ id: user.id, role: user.role, sid: session.id }),
    refreshToken: `rt1.${Buffer.from(user.id).toString('base64url')}.${session.id}.${secret}`,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  };
}

export function createSession(user, { device = '' } = {}) {
  const now = Date.now();
  pruneSessions(user, now);
  const session = {
    id: crypto.randomBytes(9).toString('base64url'),
    device: String(device).slice(0, 120),
    createdAt: new Date(now).toISOString(),
    absoluteExpiresAt: now + REFRESH_MAX_DAYS * DAY_MS,
    tokens: []
  };
  const secret = addToken(session, now);
  user.sessions = [...user.sessions, session].slice(-MAX_SESSIONS);
  return issueTokens(user, session, secret);
}

export function parseRefreshToken(raw) {
  const parts = String(raw || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'rt1') return null;
  try {
    return { userId: Buffer.from(parts[1], 'base64url').toString('utf-8'), sessionId: parts[2], secret: parts[3] };
  } catch {
    return null;
  }
}

// Returns fresh tokens, or null when the refresh token is unknown, expired or revoked.
export function rotateSession(user, parsed) {
  const now = Date.now();
  pruneSessions(user, now);
  const session = user.sessions.find((s) => s.id === parsed.sessionId);
  const hash = sha256(parsed.secret);
  const presented = session?.tokens.find((t) => t.hash.length === hash.length && crypto.timingSafeEqual(Buffer.from(t.hash), Buffer.from(hash)));
  if (!presented) return null;
  presented.expiresAt = Math.min(presented.expiresAt, now + ROTATION_GRACE_MS);
  const secret = addToken(session, now);
  return issueTokens(user, session, secret);
}

export function revokeSession(user, sessionId) {
  user.sessions = (user.sessions || []).filter((s) => s.id !== sessionId);
}

export function revokeOtherSessions(user, keepSessionId) {
  user.sessions = (user.sessions || []).filter((s) => s.id === keepSessionId);
}

// Express middleware factory. `getUser(id)` resolves the live user record so
// deleted accounts and role changes take effect immediately.
export function createAuthMiddleware(getUser) {
  const resolve = (req) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.access_token;
    const payload = verifyJwt(token);
    if (!payload?.id) return null;
    const user = getUser(payload.id) || null;
    // Tokens tied to a session die with it (sign-out, password change).
    if (user && payload.sid && !(user.sessions || []).some((s) => s.id === payload.sid)) return null;
    if (user) req.sessionId = payload.sid || null;
    return user;
  };

  const optionalAuth = (req, _res, next) => {
    req.user = resolve(req);
    next();
  };

  // Clients look for code SESSION_EXPIRED to refresh silently or sign out.
  const requireAuth = (req, res, next) => {
    const user = resolve(req);
    if (!user) {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      return res.status(401).json({ error: 'Your session expired. Please sign in again.', code: 'SESSION_EXPIRED' });
    }
    req.user = user;
    next();
  };

  // Recruiter and staff accounts awaiting approval can sign in, but can't use
  // any role-gated feature until a registrar verifies them.
  const isActive = (user) => (user.accountStatus || 'verified') === 'verified';
  const pendingResponse = (res, user) =>
    res.status(403).json({
      error: user.accountStatus === 'rejected' ? 'Your account request was not approved.' : 'Your account is waiting for verification.',
      code: 'ACCOUNT_PENDING'
    });

  const requireRole = (...roles) => (req, res, next) =>
    requireAuth(req, res, () => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to do that.' });
      }
      if (!isActive(req.user)) return pendingResponse(res, req.user);
      next();
    });

  // Allows the account owner, or any of the listed (verified) roles.
  const requireSelfOr = (paramName, ...roles) => (req, res, next) =>
    requireAuth(req, res, () => {
      const isSelf = req.user.id === req.params[paramName];
      if (!isSelf && roles.includes(req.user.role) && !isActive(req.user)) return pendingResponse(res, req.user);
      if (!isSelf && !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'You can only change your own account.' });
      }
      next();
    });

  return { optionalAuth, requireAuth, requireRole, requireSelfOr };
}

// ---------------------------------------------------------------------------
// OAuth ID-token verification (Google & Apple). Uses the providers' published
// JWKS with node:crypto — no SDKs required.
// ---------------------------------------------------------------------------
function splitIds(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function oauthConfig() {
  return {
    google: {
      webClientId: splitIds(process.env.GOOGLE_CLIENT_ID)[0] || null,
      iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || null,
      audiences: [...splitIds(process.env.GOOGLE_CLIENT_ID), ...splitIds(process.env.GOOGLE_IOS_CLIENT_ID), ...splitIds(process.env.GOOGLE_ANDROID_CLIENT_ID)]
    },
    apple: {
      serviceId: process.env.APPLE_SERVICE_ID || null,
      redirectUri: process.env.APPLE_REDIRECT_URI || null,
      audiences: [...splitIds(process.env.APPLE_SERVICE_ID), ...splitIds(process.env.APPLE_BUNDLE_ID)]
    }
  };
}

export function publicProviderConfig() {
  const cfg = oauthConfig();
  return {
    google: cfg.google.audiences.length
      ? { enabled: true, webClientId: cfg.google.webClientId, iosClientId: cfg.google.iosClientId }
      : { enabled: false },
    apple: cfg.apple.audiences.length
      ? { enabled: true, serviceId: cfg.apple.serviceId, redirectUri: cfg.apple.redirectUri }
      : { enabled: false }
  };
}

const jwksCache = new Map();

async function getJwks(url) {
  const cached = jwksCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load signing keys (${res.status})`);
  const { keys } = await res.json();
  jwksCache.set(url, { keys, expiresAt: Date.now() + 60 * 60 * 1000 });
  return keys;
}

// Tests point verification at a local key set; ignored in production.
const TEST_JWKS_URL = process.env.NODE_ENV !== 'production' ? process.env.OAUTH_TEST_JWKS_URL || '' : '';

async function verifyRs256IdToken(idToken, { jwksUrl: providerJwks, issuers, audiences }) {
  const jwksUrl = TEST_JWKS_URL || providerJwks;
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Malformed identity token.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  if (header.alg !== 'RS256') throw new Error('Unsupported token algorithm.');

  const keys = await getJwks(jwksUrl);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown signing key.');

  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!valid) throw new Error('Invalid token signature.');

  if (!issuers.includes(payload.iss)) throw new Error('Unexpected token issuer.');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a) => audiences.includes(a))) throw new Error('Token was issued for a different app.');
  const nowS = Date.now() / 1000;
  if (!payload.exp || payload.exp < nowS - 60) throw new Error('Token has expired. Please try again.');
  if (payload.iat && payload.iat > nowS + 300) throw new Error('Token issue time is in the future.');
  if (!payload.sub) throw new Error('Token has no subject.');
  return payload;
}

export async function verifyGoogleIdToken(idToken) {
  const { google } = oauthConfig();
  if (!google.audiences.length) throw new Error('Google sign-in is not configured on this server.');
  const claims = await verifyRs256IdToken(idToken, {
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    audiences: google.audiences
  });
  return {
    provider: 'google',
    subject: claims.sub,
    email: claims.email || '',
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: claims.name || '',
    picture: claims.picture || ''
  };
}

export async function verifyAppleIdToken(idToken) {
  const { apple } = oauthConfig();
  if (!apple.audiences.length) throw new Error('Apple sign-in is not configured on this server.');
  const claims = await verifyRs256IdToken(idToken, {
    jwksUrl: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    audiences: apple.audiences
  });
  // Apple only shares verified addresses (including private relay ones).
  return {
    provider: 'apple',
    subject: claims.sub,
    email: claims.email || '',
    emailVerified: claims.email_verified === undefined || claims.email_verified === true || claims.email_verified === 'true',
    name: '',
    picture: ''
  };
}
