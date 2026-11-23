import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'trusttrace-dev-secret-change-me';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
export function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: now, exp: now + Math.floor(TOKEN_TTL_MS / 1000) })
  ).toString('base64url');
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

// Express middleware factory. `getUser(id)` resolves the live user record so
// deleted accounts and role changes take effect immediately.
export function createAuthMiddleware(getUser) {
  const resolve = (req) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.access_token;
    const payload = verifyJwt(token);
    if (!payload?.id) return null;
    return getUser(payload.id) || null;
  };

  const optionalAuth = (req, _res, next) => {
    req.user = resolve(req);
    next();
  };

  const requireAuth = (req, res, next) => {
    const user = resolve(req);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    req.user = user;
    next();
  };

  const requireRole = (...roles) => (req, res, next) =>
    requireAuth(req, res, () => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to do that.' });
      }
      next();
    });

  // Allows the account owner, or any of the listed roles.
  const requireSelfOr = (paramName, ...roles) => (req, res, next) =>
    requireAuth(req, res, () => {
      if (req.user.id !== req.params[paramName] && !roles.includes(req.user.role)) {
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

async function verifyRs256IdToken(idToken, { jwksUrl, issuers, audiences }) {
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
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('Token has expired.');
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
  if (claims.email && claims.email_verified === false) throw new Error('Google account email is not verified.');
  return { provider: 'google', subject: claims.sub, email: claims.email || '', name: claims.name || '', picture: claims.picture || '' };
}

export async function verifyAppleIdToken(idToken) {
  const { apple } = oauthConfig();
  if (!apple.audiences.length) throw new Error('Apple sign-in is not configured on this server.');
  const claims = await verifyRs256IdToken(idToken, {
    jwksUrl: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    audiences: apple.audiences
  });
  return { provider: 'apple', subject: claims.sub, email: claims.email || '', name: '', picture: '' };
}
