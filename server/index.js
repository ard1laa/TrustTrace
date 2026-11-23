import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from './db/adapter.js';
import {
  ISSUER_DID,
  getIssuerDIDDocument,
  signVerifiableCredential,
  verifyVerifiableCredentialMath,
  generateStudentWalletIdentity
} from './crypto/ecdsaEngine.js';
import { analyzeCertificateUpload } from './services/aiScanner.js';
import { warmUpLayoutOcr } from './services/ocrLayout.js';
import { CATEGORIES } from './services/certificateParser.js';
import {
  ACCOUNT_STATUS,
  requiresVerification,
  checkStaffRegistration,
  buildProofRecord,
  validateProof,
  verificationSummary,
  isActive,
  isDeveloperEmail,
  developerKeyConfigured,
  checkDeveloperKey,
  issueDeveloperToken,
  hasDeveloperAccess
} from './services/access.js';
import { runLiveSystemBenchmark } from './services/benchmarkEngine.js';
import {
  hashPassword,
  verifyPassword,
  signJwt,
  createAuthMiddleware,
  publicProviderConfig,
  verifyGoogleIdToken,
  verifyAppleIdToken
} from './services/auth.js';
import { sseHandler, currentRevision } from './services/events.js';
import { resolveField, isKnownFieldId, publicTaxonomy } from '../shared/skillTaxonomy.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Demo accounts work without a developer key only on development servers.
const DEMO_LOGIN_ENABLED =
  process.env.ENABLE_DEMO_LOGIN === 'true' || (process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_LOGIN !== 'false');
const MAX_AVATAR_BYTES = 600 * 1024;

const { optionalAuth, requireAuth, requireRole, requireSelfOr } = createAuthMiddleware((id) => db.findUserById(id));

app.use('/api', async (_req, _res, next) => {
  try {
    await db.init();
    next();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------
const SECRET_FIELDS = [
  'passwordHash', 'privateKeyHex', 'seedPhrase', 'verificationCode', 'authProviders', 'pendingClaim',
  'verificationProof', 'verificationNote', 'verificationReviewedBy'
];

function publicUser(u) {
  if (!u) return null;
  const safe = { ...u };
  for (const key of SECRET_FIELDS) delete safe[key];
  return {
    ...safe,
    name: u.name || 'User',
    fullName: u.name || 'User',
    fieldOfStudy: u.fieldOfStudy || resolveField(u.program).id,
    accountStatus: u.accountStatus || ACCOUNT_STATUS.verified
  };
}

// The signed-in user's own record, including their wallet secrets.
function selfUser(u) {
  if (!u) return null;
  return {
    ...publicUser(u),
    privateKeyHex: u.privateKeyHex,
    seedPhrase: u.seedPhrase,
    hasPassword: Boolean(u.passwordHash),
    linkedProviders: (u.authProviders || []).map((p) => p.provider),
    verification: verificationSummary(u),
    isDeveloper: isDeveloperEmail(u.email)
  };
}

function authResponse(user, message) {
  const response = { token: signJwt({ id: user.id, role: user.role }), user: selfUser(user), message };
  if (isDeveloperEmail(user.email)) response.developerToken = issueDeveloperToken(user.email);
  return response;
}

const demoAllowed = (req) => DEMO_LOGIN_ENABLED || hasDeveloperAccess(req);

function logTx(entry) {
  const blockNumber = entry.blockNumber ?? db.state.meta.nextBlockNumber++;
  const tx = {
    id: `tx-${crypto.randomUUID().slice(0, 12)}`,
    txHash: entry.txHash || '0x' + crypto.createHash('sha256').update(`${entry.event}:${blockNumber}:${Date.now()}:${Math.random()}`).digest('hex'),
    blockNumber,
    gasUsed: 0,
    gasPriceGwei: 0,
    consensus: 'IBFT 2.0 PoA (0 Gas)',
    timestamp: new Date().toISOString(),
    ...entry
  };
  db.state.txLogs.unshift(tx);
  return tx;
}

function normalizeField(value, program) {
  return isKnownFieldId(value) ? value : resolveField(value || program).id;
}

function uniqueDidFor(email, assignedId) {
  let identity = generateStudentWalletIdentity(email, assignedId);
  let attempt = 1;
  while (db.state.users.some((u) => u.did === identity.did)) {
    identity = generateStudentWalletIdentity(email, `${assignedId}-${attempt++}`);
  }
  return identity;
}

function headlineFor(user) {
  if (user.role === 'student') return `${resolveField(user.fieldOfStudy).label} student${user.university ? ` @ ${user.university}` : ''}`;
  if (user.role === 'recruiter') return `${user.jobTitle || 'Talent Acquisition'} at ${user.companyName}`;
  return `${user.departmentRole || 'Office of the Registrar'}${user.university ? ` — ${user.university}` : ''}`;
}

// ---------------------------------------------------------------------------
// System, taxonomy, realtime
// ---------------------------------------------------------------------------
app.get('/api/status', (_req, res) => {
  let soliditySource = '';
  const solPath = path.resolve(process.cwd(), 'contracts', 'TrustTraceSBT.sol');
  if (fs.existsSync(solPath)) soliditySource = fs.readFileSync(solPath, 'utf-8');
  res.json({
    ok: true,
    revision: currentRevision(),
    status: db.getStatus(),
    issuerDidDocument: getIssuerDIDDocument(),
    logoRegistry: db.state.logoRegistry || [],
    soliditySource,
    txLogs: db.state.txLogs.slice(0, 40)
  });
});

app.get('/api/taxonomy', (_req, res) => res.json(publicTaxonomy()));

// Clients cache this so signatures can be checked with no network.
app.get('/api/did/issuer', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ didDocument: getIssuerDIDDocument(), fetchedAt: new Date().toISOString() });
});

app.get('/api/events', sseHandler);

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
app.get('/api/auth/providers', (_req, res) => {
  // demoLogin tells the hidden developer panel whether it needs a key; the
  // panel itself is never shown until the developer gesture is used.
  res.json({ ...publicProviderConfig(), demoLogin: DEMO_LOGIN_ENABLED, developerKeyRequired: !DEMO_LOGIN_ENABLED && developerKeyConfigured() });
});

app.post('/api/auth/login', optionalAuth, (req, res) => {
  const user = db.findUserByEmail(req.body.email);
  if (!user) return res.status(401).json({ error: 'No account found with that email.' });
  if (user.isDemo && !demoAllowed(req)) return res.status(403).json({ error: 'Demo accounts are disabled on this server.' });
  if (!user.passwordHash) {
    return res.status(401).json({ error: 'This account uses Google or Apple sign-in. Use that button, or set a password from your profile.' });
  }
  const { ok, needsUpgrade } = verifyPassword(req.body.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect password.' });
  if (needsUpgrade) {
    user.passwordHash = hashPassword(req.body.password);
    db.save(['users']);
  }
  res.json(authResponse(user, `Welcome back, ${user.name}.`));
});

// ---------------------------------------------------------------------------
// Developer mode: unlocked by the hidden gesture plus a key, or by signing in
// with a developer email. Grants one-tap access to the demo accounts.
// ---------------------------------------------------------------------------
const unlockAttempts = new Map();

app.post('/api/auth/developer/unlock', optionalAuth, (req, res) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const recent = (unlockAttempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 6) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });

  const ok = DEMO_LOGIN_ENABLED || hasDeveloperAccess(req) || checkDeveloperKey(req.body.key);
  if (!ok) {
    unlockAttempts.set(ip, [...recent, now]);
    return res.status(401).json({ error: developerKeyConfigured() ? 'That developer key is not valid.' : 'Developer mode is not configured on this server.' });
  }
  unlockAttempts.delete(ip);
  res.json({ ok: true, developerToken: issueDeveloperToken(req.user?.email || 'developer-key'), demoAccounts: demoAccountCards() });
});

function demoAccountCards() {
  return db.state.users
    .filter((u) => u.isDemo)
    .map((u) => ({ id: u.id, role: u.role, name: u.name, email: u.email, organisation: u.companyName || u.university || '' }));
}

app.get('/api/auth/developer/demo-accounts', optionalAuth, (req, res) => {
  if (!demoAllowed(req)) return res.status(403).json({ error: 'Developer mode is locked.' });
  res.json({ demoAccounts: demoAccountCards() });
});

app.post('/api/auth/demo-login', optionalAuth, (req, res) => {
  if (!demoAllowed(req)) return res.status(403).json({ error: 'Demo login is disabled on this server.' });
  const user = req.body.userId
    ? db.state.users.find((u) => u.isDemo && u.id === req.body.userId)
    : db.state.users.find((u) => u.isDemo && u.role === (req.body.role === 'admin' ? 'admin' : 'recruiter'));
  if (!user) return res.status(404).json({ error: 'That demo account does not exist.' });
  res.json(authResponse(user, `Signed in as ${user.name} (demo ${user.role === 'admin' ? 'registrar' : user.role}).`));
});

function buildNewUser(body, { role, email, name }) {
  const assignedId =
    role === 'student'
      ? (body.studentId || '').trim() || `STU-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`
      : role === 'recruiter'
      ? (body.companyRegId || '').trim() || `CORP-${crypto.randomInt(1000, 9999)}`
      : `ADMIN-${crypto.randomInt(100, 999)}`;

  const user = {
    id: `user-${role}-${crypto.randomUUID().slice(0, 8)}`,
    name,
    email,
    role,
    authProviders: [],
    avatarUrl: '',
    studentId: assignedId,
    university: (body.university || '').trim(),
    fieldOfStudy: role === 'student' ? normalizeField(body.fieldOfStudy, body.program) : '',
    program: (body.program || '').trim(),
    companyName: (body.companyName || '').trim(),
    jobTitle: (body.jobTitle || '').trim(),
    companyWebsite: (body.companyWebsite || '').trim(),
    companyRegId: (body.companyRegId || '').trim(),
    departmentRole: (body.departmentRole || '').trim(),
    bio: '',
    location: '',
    visibleInTalentSearch: true,
    ...uniqueDidFor(email, assignedId),
    createdAt: new Date().toISOString()
  };
  if (requiresVerification(role)) {
    // Staff and recruiters start locked until a registrar approves them.
    user.accountStatus = ACCOUNT_STATUS.pending;
    user.verificationRequestedAt = user.createdAt;
    const proof = buildProofRecord(body.verificationProof);
    if (proof) user.verificationProof = proof;
  } else {
    user.accountStatus = ACCOUNT_STATUS.verified;
  }
  user.headline = headlineFor(user);
  return user;
}

function validateRoleFields(role, body, email) {
  if (!['student', 'recruiter', 'admin'].includes(role)) return 'Choose a valid account type.';
  if (role === 'recruiter' && !(body.companyName || '').trim()) return 'Company name is required for recruiter accounts.';
  if (role === 'admin' && !(body.university || '').trim()) return 'Institution name is required for university accounts.';
  return checkStaffRegistration(role, email, body.verificationProof);
}

function welcomeMessage(user) {
  return user.accountStatus === ACCOUNT_STATUS.pending
    ? 'Account created. A registrar will verify your role — you will get access as soon as it is approved.'
    : `Welcome to TrustTrace, ${user.name}.`;
}

app.post('/api/auth/register', (req, res) => {
  const role = req.body.role || 'student';
  const name = (req.body.name || req.body.fullName || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const roleError = validateRoleFields(role, req.body, email);
  if (roleError) return res.status(400).json({ error: roleError });

  const existing = db.findUserByEmail(email);
  if (existing && !existing.pendingClaim) {
    return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
  }

  // A registrar may have issued credentials to this email before the student signed up.
  if (existing?.pendingClaim) {
    Object.assign(existing, {
      name,
      passwordHash: hashPassword(password),
      university: (req.body.university || existing.university || '').trim(),
      fieldOfStudy: normalizeField(req.body.fieldOfStudy, req.body.program),
      program: (req.body.program || '').trim()
    });
    delete existing.pendingClaim;
    existing.headline = headlineFor(existing);
    db.save(['users']);
    return res.json(authResponse(existing, 'Account created — credentials issued to this email are already in your wallet.'));
  }

  const user = buildNewUser(req.body, { role, email, name });
  user.passwordHash = hashPassword(password);
  db.state.users.unshift(user);
  db.save(['users']);
  res.json(authResponse(user, welcomeMessage(user)));
});

async function handleOAuth(req, res, verify) {
  try {
    const identity = await verify(req.body.idToken);
    const providerMatch = (u) => (u.authProviders || []).some((p) => p.provider === identity.provider && p.subject === identity.subject);
    let user = db.state.users.find(providerMatch) || db.findUserByEmail(identity.email);

    if (user) {
      if (!providerMatch(user)) {
        user.authProviders = [...(user.authProviders || []), { provider: identity.provider, subject: identity.subject, linkedAt: new Date().toISOString() }];
      }
      if (user.pendingClaim) delete user.pendingClaim;
      if (!user.avatarUrl && identity.picture) user.avatarUrl = identity.picture;
      db.save(['users']);
      return res.json(authResponse(user, `Signed in with ${identity.provider === 'google' ? 'Google' : 'Apple'}.`));
    }

    // New account: the client supplies role and onboarding fields alongside the token.
    const role = req.body.role || 'student';
    if (!identity.email) return res.status(400).json({ error: 'Your Apple ID did not share an email address. Please allow email sharing and try again.' });
    const roleError = validateRoleFields(role, req.body, identity.email);
    if (roleError) return res.status(400).json({ error: roleError, needsOnboarding: true });

    const name = (req.body.name || identity.name || identity.email.split('@')[0]).trim();
    user = buildNewUser(req.body, { role, email: identity.email.toLowerCase(), name });
    user.authProviders = [{ provider: identity.provider, subject: identity.subject, linkedAt: new Date().toISOString() }];
    user.avatarUrl = identity.picture || '';
    db.state.users.unshift(user);
    db.save(['users']);
    res.json(authResponse(user, welcomeMessage(user)));
  } catch (err) {
    res.status(401).json({ error: err.message || 'Sign-in failed.' });
  }
}

app.post('/api/auth/oauth/google', (req, res) => handleOAuth(req, res, verifyGoogleIdToken));
app.post('/api/auth/oauth/apple', (req, res) => handleOAuth(req, res, verifyAppleIdToken));

// Apple's web flow can POST the token to a redirect URI; hand it back to the SPA.
app.post('/api/auth/oauth/apple/callback', (req, res) => {
  const token = encodeURIComponent(req.body.id_token || '');
  res.redirect(303, `/?appleIdToken=${token}`);
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: selfUser(req.user) }));

// Pending (or declined) staff can add or replace their proof document.
app.post('/api/auth/verification-proof', requireAuth, (req, res) => {
  const user = req.user;
  if (!requiresVerification(user.role)) return res.status(400).json({ error: 'Only recruiter and university accounts need verification.' });
  if (isActive(user)) return res.status(400).json({ error: 'Your account is already verified.' });
  const error = validateProof(req.body.verificationProof) || (!req.body.verificationProof?.dataUrl && 'Attach your staff or corporate ID.');
  if (error) return res.status(400).json({ error });
  user.verificationProof = buildProofRecord(req.body.verificationProof);
  user.accountStatus = ACCOUNT_STATUS.pending;
  user.verificationRequestedAt = new Date().toISOString();
  user.verificationNote = '';
  db.save(['users']);
  res.json({ user: selfUser(user), message: 'Document submitted. A registrar will review it shortly.' });
});

const PROFILE_FIELDS = ['name', 'university', 'program', 'headline', 'bio', 'location', 'companyName', 'jobTitle', 'companyWebsite', 'departmentRole', 'visibleInTalentSearch'];

app.put('/api/auth/profile/:userId', requireSelfOr('userId', 'admin'), (req, res) => {
  const user = db.findUserById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const body = req.body || {};

  for (const key of PROFILE_FIELDS) {
    if (body[key] !== undefined) user[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
  }
  if (body.name !== undefined && !String(body.name).trim()) return res.status(400).json({ error: 'Name cannot be empty.' });

  if (body.fieldOfStudy !== undefined && user.role === 'student') {
    user.fieldOfStudy = normalizeField(body.fieldOfStudy, user.program);
  }

  if (body.avatarUrl !== undefined) {
    const url = String(body.avatarUrl || '');
    if (url && !/^data:image\/(png|jpe?g|webp);base64,/.test(url) && !/^https:\/\//.test(url)) {
      return res.status(400).json({ error: 'Profile photo must be a PNG, JPEG or WebP image.' });
    }
    if (url.startsWith('data:') && Buffer.byteLength(url) > MAX_AVATAR_BYTES) {
      return res.status(413).json({ error: 'Profile photo is too large (max 600 KB).' });
    }
    user.avatarUrl = url;
  }

  if (body.email !== undefined && String(body.email).trim().toLowerCase() !== user.email) {
    const email = String(body.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (db.findUserByEmail(email)) return res.status(409).json({ error: 'That email is already used by another account.' });
    if (user.passwordHash && req.user.id === user.id && !verifyPassword(body.currentPassword, user.passwordHash).ok) {
      return res.status(401).json({ error: 'Enter your current password to change your email.' });
    }
    user.email = email;
  }

  if (body.headline === undefined && (body.fieldOfStudy !== undefined || body.university !== undefined || body.jobTitle !== undefined)) {
    user.headline = headlineFor(user);
  }

  if (body.name) {
    for (const c of db.state.credentials) if (c.studentUserId === user.id) c.studentName = user.name;
  }

  db.save(['users']);
  res.json({ user: req.user.id === user.id ? selfUser(user) : publicUser(user), message: 'Profile saved.' });
});

app.put('/api/auth/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const hadPassword = Boolean(req.user.passwordHash);
  if (hadPassword && !verifyPassword(currentPassword, req.user.passwordHash).ok) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  req.user.passwordHash = hashPassword(newPassword);
  db.save(['users']);
  res.json({ ok: true, message: hadPassword ? 'Password updated.' : 'Password set. You can now also sign in with your email.' });
});

app.delete('/api/auth/account/:userId', requireSelfOr('userId', 'admin'), (req, res) => {
  const idx = db.state.users.findIndex((u) => u.id === req.params.userId);
  if (idx === -1) return res.status(404).json({ error: 'Account not found.' });
  const deleted = db.state.users[idx];
  const owned = db.state.credentials.filter((c) => c.studentUserId === deleted.id);

  db.state.credentials = db.state.credentials.filter((c) => c.studentUserId !== deleted.id);
  db.state.users.splice(idx, 1);
  for (const list of Object.values(db.state.recruiterShortlists)) {
    const i = list.findIndex((e) => e.studentUserId === deleted.id);
    if (i >= 0) list.splice(i, 1);
  }
  delete db.state.recruiterShortlists[deleted.id];

  logTx({
    event: 'CredentialBurnedPDPA (Account Erasure)',
    method: 'burnAndReleaseHash(uint256[])',
    tokenId: 0,
    holderSoul: deleted.walletAddress,
    ipfsCid: 'UNPINNED_PDPA_ERASURE',
    credentialHash: `RELEASED_${owned.length}_HASHES`
  });
  db.save(['users', 'credentials']);
  res.json({ ok: true, wipedCredentialsCount: owned.length, message: `Account deleted along with ${owned.length} credential(s).` });
});

// Restores a session from wallet secrets. Public identifiers (DID, address) are not accepted.
app.post('/api/wallet/recover', (req, res) => {
  const input = String(req.body.recoveryInput || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!input) return res.status(400).json({ error: 'Enter your 12-word recovery phrase or private key.' });
  const user = db.state.users.find(
    (u) => (u.seedPhrase && u.seedPhrase.toLowerCase() === input) || (u.privateKeyHex && u.privateKeyHex.toLowerCase() === input)
  );
  if (!user) return res.status(404).json({ error: 'No wallet matches that recovery phrase or key.' });
  res.json({ recovered: true, ...authResponse(user, `Wallet recovered for ${user.name}.`) });
});

// ---------------------------------------------------------------------------
// Users, talent search, shortlists
// ---------------------------------------------------------------------------
app.get('/api/users', optionalAuth, (req, res) => {
  // Accounts awaiting verification browse like a signed-out visitor.
  const viewer = req.user && isActive(req.user) ? req.user : null;
  const isAdmin = viewer?.role === 'admin';
  const showDemo = Boolean(viewer?.isDemo) || demoAllowed(req);
  const listed = (u) => !u.pendingClaim && (showDemo || !u.isDemo) && (isAdmin || isActive(u));
  // Private and draft credentials are only visible to their owner and admins.
  const credentials = db.state.credentials.filter(
    (c) => isAdmin || c.studentUserId === viewer?.id || (c.isPublic !== false && c.state !== 'Draft')
  );
  const shortlists = isAdmin
    ? db.state.recruiterShortlists
    : viewer?.role === 'recruiter'
    ? { [viewer.id]: db.state.recruiterShortlists[viewer.id] || [] }
    : {};

  res.json({
    revision: currentRevision(),
    students: db.state.users.filter((u) => u.role === 'student' && listed(u)).map(publicUser),
    allUsers: db.state.users.filter(listed).map(publicUser),
    me: req.user ? selfUser(req.user) : null,
    accessRequests: isAdmin ? accessRequests() : [],
    logoRegistry: db.state.logoRegistry,
    recruiterShortlists: shortlists,
    credentials,
    txLogs: isAdmin ? db.state.txLogs.slice(0, 50) : []
  });
});

app.patch('/api/users/:userId/talent-visibility', requireSelfOr('userId', 'admin'), (req, res) => {
  const user = db.findUserById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Student account not found.' });
  user.visibleInTalentSearch = Boolean(req.body.visibleInTalentSearch);
  db.save(['users']);
  res.json({
    ok: true,
    user: publicUser(user),
    message: user.visibleInTalentSearch ? 'Your profile is visible in recruiter search.' : 'Your profile is hidden from recruiter search. Shared links and QR codes still work.'
  });
});

const recruiterOnly = [requireRole('recruiter', 'admin'), (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.recruiterId) return res.status(403).json({ error: 'That shortlist belongs to another recruiter.' });
  next();
}];

app.get('/api/recruiter/:recruiterId/shortlist', ...recruiterOnly, (req, res) => {
  res.json({ ok: true, shortlist: db.state.recruiterShortlists[req.params.recruiterId] || [] });
});

app.post('/api/recruiter/:recruiterId/shortlist', ...recruiterOnly, (req, res) => {
  const { studentUserId, status = 'Shortlisted', notes = '' } = req.body;
  if (!studentUserId) return res.status(400).json({ error: 'studentUserId is required.' });
  const list = (db.state.recruiterShortlists[req.params.recruiterId] ||= []);
  const now = new Date().toISOString();
  const existing = list.find((i) => i.studentUserId === studentUserId);
  if (existing) Object.assign(existing, { status, ...(notes ? { notes } : {}), updatedAt: now });
  else list.unshift({ studentUserId, status, notes, savedAt: now, updatedAt: now });
  db.save(['shortlists']);
  res.json({ ok: true, shortlist: list, message: `Candidate saved (${status}).` });
});

app.patch('/api/recruiter/:recruiterId/shortlist/:studentUserId', ...recruiterOnly, (req, res) => {
  const item = (db.state.recruiterShortlists[req.params.recruiterId] || []).find((i) => i.studentUserId === req.params.studentUserId);
  if (!item) return res.status(404).json({ error: 'Candidate is not on your shortlist.' });
  if (req.body.status) item.status = req.body.status;
  if (req.body.notes !== undefined) item.notes = req.body.notes;
  item.updatedAt = new Date().toISOString();
  db.save(['shortlists']);
  res.json({ ok: true, shortlist: db.state.recruiterShortlists[req.params.recruiterId], message: `Status updated to ${item.status}.` });
});

app.delete('/api/recruiter/:recruiterId/shortlist/:studentUserId', ...recruiterOnly, (req, res) => {
  const list = db.state.recruiterShortlists[req.params.recruiterId] || [];
  db.state.recruiterShortlists[req.params.recruiterId] = list.filter((i) => i.studentUserId !== req.params.studentUserId);
  db.save(['shortlists']);
  res.json({ ok: true, shortlist: db.state.recruiterShortlists[req.params.recruiterId], message: 'Candidate removed from your shortlist.' });
});

// ---------------------------------------------------------------------------
// Account verification queue (admin)
// ---------------------------------------------------------------------------
function accessRequests() {
  return db.state.users
    .filter((u) => requiresVerification(u.role) && (u.accountStatus === ACCOUNT_STATUS.pending || u.accountStatus === ACCOUNT_STATUS.rejected))
    .map((u) => ({ ...publicUser(u), verification: verificationSummary(u) }))
    .sort((a, b) => String(b.verification.submittedAt).localeCompare(String(a.verification.submittedAt)));
}

app.get('/api/admin/access-requests', requireRole('admin'), (_req, res) => res.json({ requests: accessRequests() }));

app.get('/api/admin/access-requests/:userId/proof', requireRole('admin'), (req, res) => {
  const user = db.findUserById(req.params.userId);
  if (!user?.verificationProof) return res.status(404).json({ error: 'No document was uploaded for this account.' });
  res.json({ proof: user.verificationProof });
});

app.post('/api/admin/access-requests/:userId/decision', requireRole('admin'), (req, res) => {
  const user = db.findUserById(req.params.userId);
  if (!user || !requiresVerification(user.role)) return res.status(404).json({ error: 'Account request not found.' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'You cannot review your own account.' });
  const approve = req.body.decision === 'approve';
  user.accountStatus = approve ? ACCOUNT_STATUS.verified : ACCOUNT_STATUS.rejected;
  user.verificationReviewedAt = new Date().toISOString();
  user.verificationReviewedBy = req.user.id;
  user.verificationNote = String(req.body.note || '').trim().slice(0, 300);
  // The document is only needed for the review.
  if (approve) delete user.verificationProof;
  db.save(['users']);
  res.json({ ok: true, requests: accessRequests(), message: approve ? `${user.name} is now verified.` : `${user.name}'s request was declined.` });
});

// ---------------------------------------------------------------------------
// Institutional registry (admin)
// ---------------------------------------------------------------------------
app.post('/api/admin/logo-registry', requireRole('admin'), (req, res) => {
  const { name, issuerEntity, ruleType, minConfidenceThreshold = 80 } = req.body;
  if (!name) return res.status(400).json({ error: 'Rule name is required.' });
  db.state.logoRegistry.push({
    id: `reg-${crypto.randomUUID().slice(0, 6)}`,
    name: name.trim(),
    issuerEntity: (issuerEntity || 'University Registrar Office').trim(),
    ruleType: (ruleType || 'Official Stamp & Signature Match').trim(),
    minConfidenceThreshold: Number(minConfidenceThreshold) || 80,
    active: true,
    updatedAt: new Date().toISOString()
  });
  db.save(['registry']);
  res.json({ ok: true, logoRegistry: db.state.logoRegistry, message: 'Registry rule added.' });
});

app.patch('/api/admin/logo-registry/:id', requireRole('admin'), (req, res) => {
  const rule = db.state.logoRegistry.find((r) => r.id === req.params.id);
  if (!rule) return res.status(404).json({ error: 'Rule not found.' });
  if (req.body.active !== undefined) rule.active = Boolean(req.body.active);
  rule.updatedAt = new Date().toISOString();
  db.save(['registry']);
  res.json({ ok: true, logoRegistry: db.state.logoRegistry });
});

// ---------------------------------------------------------------------------
// Certificate scanning. Results are held server-side for 30 minutes and
// referenced by scanId at issuance, so a client can't submit its own verdict.
// ---------------------------------------------------------------------------
const SCAN_TTL_MS = 30 * 60 * 1000;
const recentScans = new Map();

function rememberScan(userId, result) {
  const now = Date.now();
  for (const [id, scan] of recentScans) if (scan.expiresAt < now) recentScans.delete(id);
  const scanId = crypto.randomUUID();
  recentScans.set(scanId, { userId, ...result, expiresAt: now + SCAN_TTL_MS });
  return scanId;
}

async function handleVerifyUpload(req, res) {
  try {
    const { fileBase64, fileName, mimeType, clientPixelMetrics, clientOcrText, studentUserId } = req.body;
    // Admins may scan on behalf of a student; everyone else is checked against their own name.
    const subject = req.user.role === 'admin' && studentUserId ? db.findUserById(studentUserId) || req.user : req.user;
    const result = await analyzeCertificateUpload({
      fileBase64,
      fileName,
      mimeType,
      studentName: subject.name,
      studentId: subject.studentId,
      studentUniversity: subject.university,
      studentField: subject.fieldOfStudy || subject.program,
      clientPixelMetrics,
      clientOcrText
    });
    const scanId = rememberScan(subject.id, result);
    res.json({ ok: true, scanId, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not analyze this file.' });
  }
}

app.post('/api/certificates/verify-upload', requireRole('student', 'admin'), handleVerifyUpload);
app.post('/api/ai/scan-certificate', requireRole('student', 'admin'), handleVerifyUpload);

// ---------------------------------------------------------------------------
// Issuance: students self-upload (requires a passing scan); admins issue directly.
// ---------------------------------------------------------------------------
function resolveIssuanceStudent(req) {
  const { studentUserId, studentLookup, studentNameOverride, issuingOrganization } = req.body;
  if (req.user.role === 'student') return req.user;

  let student = studentUserId ? db.findUserById(studentUserId) : null;
  if (!student && studentLookup) {
    const q = studentLookup.trim().toLowerCase();
    student = db.state.users.find(
      (u) => u.role === 'student' && (u.email === q || u.did?.toLowerCase() === q || u.studentId?.toLowerCase() === q)
    );
    // Registrar issued to an email that hasn't signed up yet: create a claimable placeholder.
    if (!student && q.includes('@')) {
      const assignedId = `STU-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;
      const university = (issuingOrganization || req.user.university || '').trim();
      student = {
        id: `user-student-${crypto.randomUUID().slice(0, 8)}`,
        name: studentNameOverride?.trim() || q.split('@')[0],
        email: q,
        role: 'student',
        pendingClaim: true,
        authProviders: [],
        avatarUrl: '',
        studentId: assignedId,
        university,
        fieldOfStudy: 'others',
        program: '',
        bio: '',
        location: '',
        visibleInTalentSearch: true,
        ...uniqueDidFor(q, assignedId),
        createdAt: new Date().toISOString()
      };
      student.headline = headlineFor(student);
      db.state.users.unshift(student);
    }
  }
  return student;
}

app.post('/api/credentials/issue', requireRole('student', 'admin'), (req, res) => {
  const { achievementTitle, issuingOrganization, issuanceDate, competencyDomain, description = '', scanId } = req.body;
  const isAdmin = req.user.role === 'admin';
  const achievementType = CATEGORIES.includes(req.body.achievementType) ? req.body.achievementType : 'Other';
  const requiresScoring = Boolean(req.body.requiresScoring);
  const achievementResult = requiresScoring ? String(req.body.achievementResult || '').trim().slice(0, 60) : '';
  if (requiresScoring && !achievementResult) return res.status(400).json({ error: 'Enter the result or placement, or turn off scoring.' });

  let scan = null;
  if (scanId) {
    scan = recentScans.get(scanId);
    if (!scan || scan.expiresAt < Date.now()) return res.status(410).json({ error: 'This scan has expired. Please upload the certificate again.' });
  } else if (!isAdmin) {
    return res.status(400).json({ error: 'Upload and verify your certificate before adding it to your wallet.' });
  }
  if (scan && !scan.forensics.passed) {
    return res.status(422).json({ error: 'This certificate failed verification and cannot be added.', rejectionReasons: scan.forensics.rejectionReasons });
  }

  const student = resolveIssuanceStudent(req);
  if (!student) return res.status(404).json({ error: 'No student account matches that email, DID or student ID.' });
  if (scan && scan.userId !== student.id) return res.status(403).json({ error: 'That scan belongs to a different student.' });
  if (!achievementTitle?.trim() || !competencyDomain) return res.status(400).json({ error: 'Certificate title and skill area are required.' });

  const fileHash = scan?.forensics.fileHash || '';
  if (fileHash) {
    const owner = db.state.credentials.find((c) => c.fileHash === fileHash);
    if (owner) {
      return res.status(409).json({
        error: owner.studentUserId === student.id
          ? 'This certificate is already in your wallet.'
          : 'This certificate file is already registered to another account.'
      });
    }
  }

  const credId = `vc-${crypto.randomUUID().slice(0, 8)}`;
  const isoDate = issuanceDate ? new Date(issuanceDate).toISOString() : new Date().toISOString();
  // Self-uploads that passed every gate score 100; registrar issuance may set a score.
  const masteryScore = scan ? 100 : Math.min(100, Math.max(1, Number(req.body.masteryScore) || 90));
  const attainedLevel = scan ? 'Expert / Mastery' : req.body.attainedLevel || 'Advanced';

  const signed = signVerifiableCredential({
    id: `urn:trusttrace:vc:${credId}`,
    issuer: ISSUER_DID,
    issuanceDate: isoDate,
    credentialSubject: {
      id: student.did,
      name: student.name,
      studentId: student.studentId,
      achievementTitle: achievementTitle.trim(),
      issuingOrganization: (issuingOrganization || student.university || 'University Registrar Office').trim(),
      competencyDomain,
      attainedLevel,
      masteryScore,
      description
    }
  });

  // Possible edits found by the scanner always go to a registrar.
  const forcedReview = scan?.forensics.outcome === 'review';
  const queue = req.body.validationMode === 'queue' || forcedReview;
  const tokenId = queue ? null : db.state.meta.nextTokenId++;
  const tx = queue
    ? logTx({ txHash: 'PENDING_ADMIN_APPROVAL', blockNumber: db.state.meta.nextBlockNumber, event: 'CredentialQueuedForAdmin (Draft)', method: 'submitCandidateDraft(string,bytes32)', tokenId: 0, holderSoul: student.walletAddress, ipfsCid: signed.ipfsCid, credentialHash: signed.credentialHash, consensus: 'IBFT 2.0 PoA Queue' })
    : logTx({ event: 'CredentialAnchoredAndLocked', method: 'mintSoulboundCredential(address,string,bytes32,string)', tokenId, holderSoul: student.walletAddress, ipfsCid: signed.ipfsCid, credentialHash: signed.credentialHash });

  const credential = {
    id: credId,
    tokenId,
    studentUserId: student.id,
    studentDid: student.did,
    studentName: student.name,
    studentId: student.studentId,
    studentUniversity: student.university || signed.verifiableCredential.credentialSubject.issuingOrganization,
    holderAddress: student.walletAddress,
    achievementTitle: signed.verifiableCredential.credentialSubject.achievementTitle,
    issuingOrganization: signed.verifiableCredential.credentialSubject.issuingOrganization,
    issuanceDate: isoDate,
    competencyDomain,
    achievementType,
    requiresScoring,
    achievementResult,
    attainedLevel,
    masteryScore,
    description,
    state: queue ? 'Draft' : 'Locked',
    isLocked: !queue,
    isPublic: true,
    credentialHash: signed.credentialHash,
    fileHash: fileHash || signed.credentialHash,
    ipfsCid: signed.ipfsCid,
    txHash: queue ? null : tx.txHash,
    blockNumber: queue ? null : tx.blockNumber,
    verifiableCredential: signed.verifiableCredential,
    aiForensics: scan?.forensics || { issuedBy: req.user.id, passed: true, overallConfidence: 100, verdict: 'Issued directly by the registrar' },
    revocationReason: null,
    createdAt: new Date().toISOString()
  };

  db.state.credentials.unshift(credential);
  if (scanId) recentScans.delete(scanId);
  db.save(['credentials']);
  res.json({
    ok: true,
    credential,
    message: forcedReview
      ? 'Sent to the registrar — the scan found possible edits that need a human check.'
      : queue
      ? 'Sent to the registrar for approval.'
      : `Verified and minted as Soulbound Token #${tokenId}.`
  });
});

app.post('/api/credentials/:id/approve-mint', requireRole('admin'), (req, res) => {
  const cred = db.state.credentials.find((c) => c.id === req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found.' });

  const signed = signVerifiableCredential({
    id: cred.verifiableCredential?.id || `urn:trusttrace:vc:${cred.id}`,
    issuer: ISSUER_DID,
    issuanceDate: cred.issuanceDate,
    credentialSubject: {
      id: cred.studentDid,
      name: cred.verifiableCredential?.credentialSubject?.name || cred.studentName,
      studentId: cred.studentId,
      achievementTitle: cred.achievementTitle,
      issuingOrganization: cred.issuingOrganization,
      competencyDomain: cred.competencyDomain,
      attainedLevel: cred.attainedLevel,
      masteryScore: cred.masteryScore,
      description: cred.description
    }
  });
  const tokenId = cred.tokenId || db.state.meta.nextTokenId++;
  const tx = logTx({ event: 'CredentialAnchoredAndLocked', method: 'mintSoulboundCredential(address,string,bytes32,string)', tokenId, holderSoul: cred.holderAddress, ipfsCid: signed.ipfsCid, credentialHash: signed.credentialHash });

  Object.assign(cred, {
    tokenId,
    state: 'Locked',
    isLocked: true,
    credentialHash: signed.credentialHash,
    ipfsCid: signed.ipfsCid,
    txHash: tx.txHash,
    blockNumber: tx.blockNumber,
    verifiableCredential: signed.verifiableCredential,
    revocationReason: null
  });
  db.save(['credentials']);
  res.json({ ok: true, credential: cred, message: `Approved and minted Soulbound Token #${tokenId}.` });
});

app.patch('/api/credentials/:id/state', requireRole('admin'), (req, res) => {
  const cred = db.state.credentials.find((c) => c.id === req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found.' });
  const { state, revocationReason } = req.body;
  if (!['Draft', 'Signed', 'Anchored', 'Locked', 'Revoked'].includes(state)) return res.status(400).json({ error: 'Invalid state.' });

  cred.state = state;
  if (state === 'Locked' || state === 'Anchored') {
    cred.tokenId ||= db.state.meta.nextTokenId++;
    cred.isLocked = state === 'Locked';
    cred.revocationReason = null;
  } else if (state === 'Revoked') {
    cred.revocationReason = revocationReason || 'Revoked by the registrar.';
  }
  const tx = logTx({ event: `StateTransition -> ${state}`, method: `setCredentialState(${cred.tokenId || 0}, "${state}")`, tokenId: cred.tokenId || 0, holderSoul: cred.holderAddress, ipfsCid: cred.ipfsCid, credentialHash: cred.credentialHash });
  cred.blockNumber ||= tx.blockNumber;
  cred.txHash ||= tx.txHash;
  db.save(['credentials']);
  res.json({ ok: true, credential: cred, message: `State updated to ${state}.` });
});

app.patch('/api/credentials/:id/privacy', requireAuth, (req, res) => {
  const cred = db.state.credentials.find((c) => c.id === req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found.' });
  if (cred.studentUserId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'You can only change your own credentials.' });
  cred.isPublic = Boolean(req.body.isPublic);
  db.save(['credentials']);
  res.json({ ok: true, credential: cred, message: cred.isPublic ? 'Credential is now public.' : 'Credential is now private.' });
});

app.post('/api/credentials/:id/revoke', requireRole('admin'), (req, res) => {
  const cred = db.state.credentials.find((c) => c.id === req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found.' });
  cred.state = 'Revoked';
  cred.revocationReason = req.body.reason || 'Revoked by the registrar.';
  logTx({ event: 'CredentialRevoked', method: 'revokeCredential(uint256,string)', tokenId: cred.tokenId || 0, holderSoul: cred.holderAddress, ipfsCid: cred.ipfsCid, credentialHash: cred.credentialHash });
  db.save(['credentials']);
  res.json({ ok: true, credential: cred, message: `Soulbound Token #${cred.tokenId || cred.id} revoked.` });
});

app.delete('/api/credentials/:id', requireAuth, (req, res) => {
  const idx = db.state.credentials.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Credential not found.' });
  const removed = db.state.credentials[idx];
  if (removed.studentUserId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'You can only delete your own credentials.' });
  db.state.credentials.splice(idx, 1);
  logTx({ event: 'CredentialBurnedPDPA (Hash Released)', method: 'burnAndReleaseHash(uint256)', tokenId: removed.tokenId || 0, holderSoul: removed.holderAddress, ipfsCid: removed.ipfsCid, credentialHash: removed.credentialHash });
  db.save(['credentials']);
  res.json({ ok: true, removedId: removed.id, message: `"${removed.achievementTitle}" deleted.` });
});

// Demonstrates ERC-5192: transfers of a locked token always revert.
app.post('/api/credentials/:id/try-transfer', requireAuth, (req, res) => {
  const cred = db.state.credentials.find((c) => c.id === req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found.' });
  const targetAddress = req.body.targetAddress || '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
  const tokenId = cred.tokenId || 0;
  const tx = logTx({
    blockNumber: db.state.meta.nextBlockNumber,
    event: 'REVERT: ErrSoulboundTokenLocked (ERC-5192)',
    method: `transferFrom(${cred.holderAddress.slice(0, 8)}…, ${targetAddress.slice(0, 8)}…, ${tokenId})`,
    tokenId,
    holderSoul: cred.holderAddress,
    ipfsCid: cred.ipfsCid,
    credentialHash: cred.credentialHash,
    consensus: 'IBFT 2.0 PoA — VM REVERT'
  });
  db.save(['txLogs']);
  res.status(400).json({
    reverted: true,
    standard: 'ERC-5192 Minimal Soulbound Token (EIP-5192)',
    contractAddress: db.state.meta.contractAddress,
    tokenId,
    holderSoul: cred.holderAddress,
    attemptedRecipient: targetAddress,
    lockedStatus: true,
    txHash: tx.txHash,
    evmError: `VM Exception while processing transaction: revert ErrSoulboundTokenLocked(${tokenId}) — soulbound credentials cannot be transferred.`
  });
});

// ---------------------------------------------------------------------------
// Public verification (QR / link / DID / raw VC)
// ---------------------------------------------------------------------------
function normalizeLookup(raw) {
  let q = String(raw || '').trim();
  if (/^https?:\/\//.test(q)) {
    try {
      const url = new URL(q);
      q = url.searchParams.get('cred') || url.searchParams.get('verify') || url.searchParams.get('student') || url.searchParams.get('did') || url.pathname.split('/').filter(Boolean).pop() || q;
    } catch {
      // keep as-is
    }
  }
  return q;
}

app.post('/api/verify', (req, res) => {
  const { credentialId, tokenId, rawVcJson, candidateLookup, simulateTamper = false } = req.body;
  const query = normalizeLookup(credentialId || candidateLookup);
  const qLower = query.toLowerCase();
  const visible = (c) => c.isPublic !== false && c.state !== 'Draft';

  let cred = null;
  let candidate = null;
  if (query) {
    cred = db.state.credentials.find(
      (c) => c.id.toLowerCase() === qLower || String(c.tokenId) === query || c.ipfsCid?.toLowerCase() === qLower || c.credentialHash?.toLowerCase() === qLower
    );
    if (!cred) {
      candidate = db.state.users.find(
        (u) => u.role === 'student' && !u.pendingClaim && (u.id.toLowerCase() === qLower || u.did?.toLowerCase() === qLower || u.studentId?.toLowerCase() === qLower || u.walletAddress?.toLowerCase() === qLower)
      );
      if (candidate) {
        const owned = db.state.credentials.filter((c) => c.studentUserId === candidate.id && visible(c));
        cred = owned.find((c) => c.state === 'Locked') || owned[0] || null;
      }
    }
  } else if (tokenId) {
    cred = db.state.credentials.find((c) => Number(c.tokenId) === Number(tokenId));
  }

  let vc = rawVcJson || (cred ? structuredClone(cred.verifiableCredential) : null);
  if (!cred && vc) {
    cred = db.state.credentials.find((c) => c.verifiableCredential?.id === vc.id || c.credentialHash?.toLowerCase() === vc?.proof?.hashZ?.toLowerCase()) || null;
  }
  if (cred && !candidate) candidate = db.findUserById(cred.studentUserId);

  const candidateCredentials = candidate ? db.state.credentials.filter((c) => c.studentUserId === candidate.id && visible(c)) : cred ? [cred] : [];

  if (!vc && candidate) {
    return res.json({
      ok: true,
      credential: null,
      candidate: publicUser(candidate),
      candidateCredentials,
      presentedVc: null,
      verification: { overallValid: true, reason: `${candidate.name}'s identity is registered. No public credentials yet.` }
    });
  }
  if (!vc) return res.status(404).json({ error: 'No matching credential, portfolio link, DID or student ID was found.' });

  if (simulateTamper) {
    vc = structuredClone(vc);
    vc.credentialSubject.masteryScore = 100;
    vc.credentialSubject.achievementTitle += ' [FORGED]';
  }

  const verification = verifyVerifiableCredentialMath(vc, cred?.credentialHash || vc?.proof?.hashZ, cred ? cred.state : 'Locked');
  res.json({ ok: true, credential: cred, candidate: publicUser(candidate), candidateCredentials, presentedVc: vc, simulatedTamper: simulateTamper, verification });
});

// ---------------------------------------------------------------------------
// Admin maintenance
// ---------------------------------------------------------------------------
app.post('/api/demo/wipe-certificates', requireRole('admin'), (req, res) => {
  const before = db.state.credentials.length;
  db.state.credentials = req.body.studentUserId ? db.state.credentials.filter((c) => c.studentUserId !== req.body.studentUserId) : [];
  db.save(['credentials']);
  const removedCount = before - db.state.credentials.length;
  res.json({ ok: true, removedCount, message: `Removed ${removedCount} credential(s).` });
});

app.post('/api/benchmark/run', requireRole('admin'), (req, res) => {
  res.json({ ok: true, benchmark: runLiveSystemBenchmark(Number(req.body?.maxCredentials) || 50000) });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

// ---------------------------------------------------------------------------
// Production frontend
// ---------------------------------------------------------------------------
const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      }
    })
  );
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const PORT = process.env.PORT || 3001;
if (!process.env.VERCEL) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TrustTrace] API listening on http://0.0.0.0:${PORT}`);
    warmUpLayoutOcr();
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.log(`[TrustTrace] Port ${PORT} is already in use; another instance is serving the API.`);
  });
}

export default app;
