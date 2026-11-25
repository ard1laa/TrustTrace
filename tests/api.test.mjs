// End-to-end API tests against a real server process with a throwaway data
// folder. Run: npm test   (or npm run test:api)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { startServer, startJwks, idToken, mintAccessToken, decodeJwt, ROOT } from './helpers.mjs';

let srv;
let jwks;
let call;
let dev;
let adminToken;

const register = (body) =>
  call('/auth/register', { method: 'POST', body: { password: 'password123', university: 'UTM', fieldOfStudy: 'computer-science', role: 'student', ...body } });

before(async () => {
  jwks = await startJwks();
  srv = await startServer({ OAUTH_TEST_JWKS_URL: jwks.url });
  call = srv.call;
  const unlock = await call('/auth/developer/unlock', { method: 'POST', body: { key: 'test-key' } });
  dev = unlock.data.developerToken;
  adminToken = (await call('/auth/demo-login', { method: 'POST', body: { userId: 'demo-admin-registrar' }, dev })).data.token;
});

after(() => {
  srv?.stop();
  jwks?.close();
});

// ---------------------------------------------------------------------------
describe('sessions', () => {
  test('sign-in returns a 2-hour access token and a refresh token', async () => {
    const r = await register({ name: 'Sam Lee', email: 'sam@student.utm.my' });
    assert.equal(r.status, 200);
    const p = decodeJwt(r.data.token);
    assert.equal(p.exp - p.iat, 7200);
    assert.ok(p.sid);
    assert.match(r.data.refreshToken, /^rt1\./);
    assert.ok(!('sessions' in r.data.user), 'sessions must never be sent to the client');
  });

  test('refresh rotates the token; the old one survives a short grace window (two tabs)', async () => {
    const login = await call('/auth/login', { method: 'POST', body: { email: 'sam@student.utm.my', password: 'password123' } });
    const first = await call('/auth/refresh', { method: 'POST', body: { refreshToken: login.data.refreshToken } });
    assert.equal(first.status, 200);
    assert.notEqual(first.data.refreshToken, login.data.refreshToken);
    const second = await call('/auth/refresh', { method: 'POST', body: { refreshToken: login.data.refreshToken } });
    assert.equal(second.status, 200);
  });

  test('expired or forged tokens get 401 SESSION_EXPIRED (never a silent anonymous view)', async () => {
    const login = await call('/auth/login', { method: 'POST', body: { email: 'sam@student.utm.my', password: 'password123' } });
    const { id, sid } = decodeJwt(login.data.token);
    const expired = mintAccessToken({ id, role: 'student', sid, iat: 1000, exp: 2000 });
    for (const p of ['/auth/me', '/users']) {
      const r = await call(p, { token: expired });
      assert.equal(r.status, 401, p);
      assert.equal(r.data.code, 'SESSION_EXPIRED', p);
    }
    const forged = await call('/auth/refresh', { method: 'POST', body: { refreshToken: `rt1.${Buffer.from(id).toString('base64url')}.x.y` } });
    assert.equal(forged.status, 401);
    assert.equal((await call('/users')).data.me, null, 'no token is still a valid public view');
  });

  test('wrong password is a plain 401 (not SESSION_EXPIRED, so clients do not try to refresh)', async () => {
    const r = await call('/auth/login', { method: 'POST', body: { email: 'sam@student.utm.my', password: 'nope-nope' } });
    assert.equal(r.status, 401);
    assert.notEqual(r.data.code, 'SESSION_EXPIRED');
  });

  test('logout kills that session; password change signs out other devices only', async () => {
    const a = await call('/auth/login', { method: 'POST', body: { email: 'sam@student.utm.my', password: 'password123' } });
    const b = await call('/auth/login', { method: 'POST', body: { email: 'sam@student.utm.my', password: 'password123' } });
    await call('/auth/logout', { method: 'POST', token: a.data.token, body: { refreshToken: a.data.refreshToken } });
    assert.equal((await call('/auth/me', { token: a.data.token })).status, 401);
    assert.equal((await call('/auth/refresh', { method: 'POST', body: { refreshToken: a.data.refreshToken } })).status, 401);
    assert.equal((await call('/auth/me', { token: b.data.token })).status, 200);

    const c = await call('/auth/login', { method: 'POST', body: { email: 'sam@student.utm.my', password: 'password123' } });
    const pw = await call('/auth/password', { method: 'PUT', token: c.data.token, body: { currentPassword: 'password123', newPassword: 'newpass456' } });
    assert.equal(pw.status, 200);
    assert.equal((await call('/auth/me', { token: b.data.token })).status, 401);
    assert.equal((await call('/auth/me', { token: c.data.token })).status, 200);
  });
});

// ---------------------------------------------------------------------------
describe('roles and approval', () => {
  test('recruiter with a personal email needs an ID and starts pending', async () => {
    const none = await register({ role: 'recruiter', name: 'Rina Tan', email: 'rina@gmail.com', companyName: 'Acme' });
    assert.equal(none.status, 400);
    const png = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'public/icon-192.png')).toString('base64')}`;
    const ok = await register({ role: 'recruiter', name: 'Rina Tan', email: 'rina@gmail.com', companyName: 'Acme', verificationProof: { dataUrl: png, fileName: 'id.png' } });
    assert.equal(ok.data.user.accountStatus, 'pending_verification');
    const blocked = await call(`/recruiter/${ok.data.user.id}/shortlist`, { token: ok.data.token });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.code, 'ACCOUNT_PENDING');
  });

  test('demo accounts are locked without developer mode', async () => {
    const r = await call('/auth/demo-login', { method: 'POST', body: { role: 'admin' } });
    assert.equal(r.status, 403);
  });
});

// ---------------------------------------------------------------------------
describe('profile & settings', () => {
  const me = async (token) => (await call('/auth/me', { token })).data.user;
  const onDisk = (id) => JSON.parse(fs.readFileSync(path.join(srv.dataDir, 'trusttrace_db.json'), 'utf8')).users.find((u) => u.id === id);

  test('a student saves their profile; it is returned, persisted to disk, and copied onto credentials', async () => {
    const r = await register({ name: 'Profile Student', email: 'profile.student@student.utm.my' });
    const { token, user } = r.data;
    const save = await call(`/auth/profile/${user.id}`, {
      method: 'PUT',
      token,
      body: { name: '  Profile Student Two ', headline: 'CS @ UTM', bio: 'Hello', location: 'Johor', university: 'UTM', program: 'BSc CS', fieldOfStudy: 'computer-science', companyName: '', jobTitle: '' }
    });
    assert.equal(save.status, 200, JSON.stringify(save.data));
    assert.equal(save.data.user.name, 'Profile Student Two');
    assert.equal((await me(token)).location, 'Johor');
    assert.equal(onDisk(user.id).bio, 'Hello');
  });

  test('fields that belong to another role are ignored; bad values are refused without changing anything', async () => {
    const { token, user } = (await register({ name: 'Strict Student', email: 'strict@student.utm.my' })).data;
    await call(`/auth/profile/${user.id}`, { method: 'PUT', token, body: { companyName: 'Evil Corp', jobTitle: 'CEO', departmentRole: 'Registrar', role: 'admin', accountStatus: 'verified' } });
    const after1 = await me(token);
    assert.notEqual(after1.companyName, 'Evil Corp');
    assert.notEqual(after1.jobTitle, 'CEO');
    assert.notEqual(after1.departmentRole, 'Registrar');
    assert.equal(after1.role, 'student');

    const empty = await call(`/auth/profile/${user.id}`, { method: 'PUT', token, body: { name: '   ', headline: 'should not stick' } });
    assert.equal(empty.status, 400);
    const notText = await call(`/auth/profile/${user.id}`, { method: 'PUT', token, body: { bio: { $gt: '' } } });
    assert.equal(notText.status, 400);
    const tooLong = await call(`/auth/profile/${user.id}`, { method: 'PUT', token, body: { bio: 'x'.repeat(601) } });
    assert.equal(tooLong.status, 400);
    const after2 = await me(token);
    assert.equal(after2.name, 'Strict Student');
    assert.notEqual(after2.headline, 'should not stick');
  });

  test('a recruiter edits company details; nobody but the owner or a registrar can edit a profile', async () => {
    const rec = (await call('/auth/demo-login', { method: 'POST', body: { userId: 'demo-recruiter-global' }, dev })).data;
    const save = await call(`/auth/profile/${rec.user.id}`, { method: 'PUT', token: rec.token, body: { companyName: 'Acme Hiring', jobTitle: 'Talent Lead', university: 'should be ignored' } });
    assert.equal(save.status, 200, JSON.stringify(save.data));
    assert.equal(save.data.user.companyName, 'Acme Hiring');
    assert.equal(save.data.user.university, rec.user.university);

    const victim = (await register({ name: 'Victim Student', email: 'victim@student.utm.my' })).data.user;
    const denied = await call(`/auth/profile/${victim.id}`, { method: 'PUT', token: rec.token, body: { name: 'Hacked' } });
    assert.equal(denied.status, 403);
    const anon = await call(`/auth/profile/${victim.id}`, { method: 'PUT', body: { name: 'Hacked' } });
    assert.equal(anon.status, 401);

    const byAdmin = await call(`/auth/profile/${victim.id}`, { method: 'PUT', token: adminToken, body: { name: 'Victim Corrected' } });
    assert.equal(byAdmin.status, 200);
    assert.equal(byAdmin.data.user.seedPhrase, undefined, 'a registrar must not receive the student\'s wallet secrets');
  });

  test('a registrar edits their own institution details', async () => {
    const admin = await me(adminToken);
    const save = await call(`/auth/profile/${admin.id}`, { method: 'PUT', token: adminToken, body: { departmentRole: 'Academic Registry', university: 'UTM', companyName: 'ignored' } });
    assert.equal(save.status, 200, JSON.stringify(save.data));
    assert.equal(save.data.user.departmentRole, 'Academic Registry');
    assert.notEqual(save.data.user.companyName, 'ignored');
  });
});

// ---------------------------------------------------------------------------
describe('Google & Apple sign-in', () => {
  test('providers endpoint reports configuration (and setup hints outside production)', async () => {
    const r = await call('/auth/providers');
    assert.equal(r.data.google.enabled, true);
    assert.equal(r.data.apple.enabled, true);
    assert.equal(r.data.setupHints, true);
  });

  test('a new Google user is asked to onboard first — no account, no role guessed', async () => {
    const t = idToken({ sub: 'g-100', email: 'newbie@gmail.com', name: 'New Bie' });
    const r = await call('/auth/oauth/google', { method: 'POST', body: { idToken: t } });
    assert.equal(r.status, 200);
    assert.equal(r.data.needsOnboarding, true);
    assert.equal(r.data.token, undefined);
    assert.equal(r.data.profile.email, 'newbie@gmail.com');
  });

  test('sign-up with Google as a student creates a verified student; next time it just signs in', async () => {
    const t = idToken({ sub: 'g-100', email: 'newbie@gmail.com', name: 'New Bie' });
    const r = await call('/auth/oauth/google', { method: 'POST', body: { idToken: t, signup: true, role: 'student', university: 'UTM', fieldOfStudy: 'computer-science' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.role, 'student');
    assert.equal(r.data.user.accountStatus, 'verified');
    assert.deepEqual(r.data.user.linkedProviders, ['google']);
    assert.ok(r.data.refreshToken);
    const again = await call('/auth/oauth/google', { method: 'POST', body: { idToken: idToken({ sub: 'g-100', email: 'newbie@gmail.com' }) } });
    assert.equal(again.data.user.id, r.data.user.id);
  });

  test('choosing registrar/admin via Google still requires approval', async () => {
    const t = idToken({ sub: 'g-200', email: 'staff@gmail.com', name: 'Staff Person' });
    const noProof = await call('/auth/oauth/google', { method: 'POST', body: { idToken: t, signup: true, role: 'admin', university: 'UTM' } });
    assert.equal(noProof.status, 400, 'personal email + no ID is refused, as with email sign-up');
    const uni = await call('/auth/oauth/google', {
      method: 'POST',
      body: { idToken: idToken({ sub: 'g-201', email: 'lee@utm.edu.my', name: 'Dr Lee' }), signup: true, role: 'admin', university: 'UTM' }
    });
    assert.equal(uni.data.user.accountStatus, 'pending_verification');
    assert.equal((await call('/admin/access-requests', { token: uni.data.token })).status, 403);
  });

  test('Google cannot take over an existing email/password account (LINK_REQUIRED)', async () => {
    await register({ name: 'Victim Person', email: 'victim@gmail.com' });
    const r = await call('/auth/oauth/google', { method: 'POST', body: { idToken: idToken({ sub: 'g-evil', email: 'victim@gmail.com' }) } });
    assert.equal(r.status, 409);
    assert.equal(r.data.code, 'LINK_REQUIRED');
  });

  test('the owner can link Google from inside the account, then sign in with it', async () => {
    const login = await call('/auth/login', { method: 'POST', body: { email: 'victim@gmail.com', password: 'password123' } });
    const link = await call('/auth/link/google', { method: 'POST', token: login.data.token, body: { idToken: idToken({ sub: 'g-victim', email: 'victim@gmail.com' }) } });
    assert.equal(link.status, 200);
    assert.deepEqual(link.data.user.linkedProviders, ['google']);
    const signin = await call('/auth/oauth/google', { method: 'POST', body: { idToken: idToken({ sub: 'g-victim', email: 'victim@gmail.com' }) } });
    assert.equal(signin.data.user.id, login.data.user.id);
    const steal = await call('/auth/link/google', {
      method: 'POST',
      token: (await call('/auth/login', { method: 'POST', body: { email: 'sam@student.utm.my', password: 'newpass456' } })).data.token,
      body: { idToken: idToken({ sub: 'g-victim', email: 'victim@gmail.com' }) }
    });
    assert.equal(steal.status, 409, 'a Google account can only be linked to one TrustTrace account');
  });

  test('tokens with the wrong audience, expired, or unverified email are refused', async () => {
    const wrongAud = await call('/auth/oauth/google', { method: 'POST', body: { idToken: idToken({ sub: 'g-x', email: 'x@gmail.com', aud: 'someone-elses-app' }) } });
    assert.equal(wrongAud.status, 401);
    const expired = await call('/auth/oauth/google', { method: 'POST', body: { idToken: idToken({ sub: 'g-x', email: 'x@gmail.com', expIn: -600 }) } });
    assert.equal(expired.status, 401);
    const unverified = await call('/auth/oauth/google', { method: 'POST', body: { idToken: idToken({ sub: 'g-x', email: 'x@gmail.com', emailVerified: false }) } });
    assert.equal(unverified.status, 400);
    const tampered = idToken({ sub: 'g-x', email: 'x@gmail.com' }).replace(/\.[^.]+$/, '.AAAA');
    assert.equal((await call('/auth/oauth/google', { method: 'POST', body: { idToken: tampered } })).status, 401);
  });

  test('Apple sign-up works the same way', async () => {
    const t = idToken({ provider: 'apple', sub: 'a-1', email: 'abc123@privaterelay.appleid.com' });
    const r = await call('/auth/oauth/apple', { method: 'POST', body: { idToken: t, signup: true, role: 'student', name: 'Apple User', university: 'UM', fieldOfStudy: 'law' } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.user.linkedProviders, ['apple']);
  });
});

// ---------------------------------------------------------------------------
// Scanner tests need text positions (macOS Vision helper or Cloud Vision).
const ocrAvailable = (process.platform === 'darwin' && fs.existsSync(path.join(ROOT, 'server/ocr/vision_layout'))) || Boolean(process.env.GOOGLE_VISION_API_KEY);

describe('certificates and QR links', { skip: !ocrAvailable && 'no layout OCR on this machine' }, () => {
  let samples;
  let student;
  let other;
  const upload = (token, file, extra = {}) =>
    call('/certificates/verify-upload', {
      method: 'POST',
      token,
      body: {
        fileBase64: `data:image/jpeg;base64,${fs.readFileSync(path.join(samples, file)).toString('base64')}`,
        fileName: file,
        mimeType: file.endsWith('.png') ? 'image/png' : 'image/jpeg',
        ...extra
      }
    });

  before(async () => {
    const { generateDataset } = await import('../scripts/scanner-eval/generate.mjs');
    samples = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-samples-'));
    await generateDataset(samples);
    student = (await register({ name: 'Nur Aisyah Binti Rahman', email: 'aisyah@student.utm.my' })).data;
    other = (await register({ name: 'Priya Devi Ramasamy', email: 'priya@student.utm.my' })).data;
  });
  after(() => fs.rmSync(samples, { recursive: true, force: true }));

  let credential;
  test('genuine certificate → verified → minted, with fields auto-filled', async () => {
    const scan = await upload(student.token, 'hackathon_genuine.jpg');
    assert.equal(scan.status, 200);
    assert.equal(scan.data.forensics.outcome, 'verified', scan.data.forensics.verdict);
    assert.equal(scan.data.extracted.achievementTitle, 'UTM Digital Innovation Hackathon 2025');
    assert.equal(scan.data.extracted.issuanceDate, '2025-03-14');
    assert.equal(scan.data.extracted.achievementResult, '1st Place');
    assert.ok(scan.data.scanToken);
    const issued = await call('/credentials/issue', { method: 'POST', token: student.token, body: { ...scan.data.extracted, scanToken: scan.data.scanToken } });
    assert.equal(issued.status, 200, issued.data.error);
    assert.equal(issued.data.credential.state, 'Locked');
    credential = issued.data.credential;
  });

  test('the same file cannot be added twice or by another student', async () => {
    const again = await upload(student.token, 'hackathon_genuine.jpg');
    const dup = await call('/credentials/issue', { method: 'POST', token: student.token, body: { ...again.data.extracted, scanToken: again.data.scanToken } });
    assert.equal(dup.status, 409);
    const theirs = await upload(other.token, 'hackathon_genuine.jpg');
    assert.equal(theirs.data.forensics.outcome, 'rejected');
  });

  test('changing the auto-detected title after the scan sends it to the registrar', async () => {
    // The PNG export of the student's own certificate (a different file from the minted JPEG).
    const own = await upload(student.token, 'hackathon_genuine.png');
    assert.equal(own.data.forensics.outcome, 'verified', own.data.forensics.verdict);
    const body = { ...own.data.extracted, achievementTitle: 'National Robotics Championship 2025', scanToken: own.data.scanToken };
    const r = await call('/credentials/issue', { method: 'POST', token: student.token, body });
    assert.equal(r.status, 200, r.data.error);
    assert.equal(r.data.credential.state, 'Draft');
    assert.match(r.data.message, /registrar/);
    assert.ok(r.data.credential.aiForensics.editedAfterScan.length);
  });

  test('a forged name is rejected and cannot be issued', async () => {
    // In the synthetic set the forger pastes their own name (Lim Wei Jie) onto someone else's certificate.
    const forger = (await register({ name: 'Lim Wei Jie', email: 'weijie@student.utm.my' })).data;
    const scan = await upload(forger.token, 'ribbons_forged_name_resaved.jpg');
    assert.equal(scan.data.forensics.outcome, 'rejected', scan.data.forensics.verdict);
    const r = await call('/credentials/issue', { method: 'POST', token: forger.token, body: { ...scan.data.extracted, scanToken: scan.data.scanToken } });
    assert.equal(r.status, 422);
  });

  test('an unreadable upload is "unable to verify" and goes to the registrar, not minted', async () => {
    const scan = await upload(student.token, 'hackathon_blurry.jpg');
    assert.equal(scan.data.forensics.outcome, 'inconclusive');
    const r = await call('/credentials/issue', {
      method: 'POST',
      token: student.token,
      body: { achievementTitle: 'UTM Digital Innovation Hackathon 2025', competencyDomain: scan.data.extracted.competencyDomain, issuanceDate: '2025-03-14', scanToken: scan.data.scanToken }
    });
    assert.equal(r.data.credential.state, 'Draft');
  });

  test('scan tokens are tamper-proof and survive server-side restarts (no memory cache)', async () => {
    const scan = await upload(student.token, 'swoosh_genuine.jpg');
    const [body, sig] = scan.data.scanToken.split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    payload.p.forensics.outcome = 'verified';
    payload.p.forensics.passed = true;
    const forged = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`;
    const r = await call('/credentials/issue', { method: 'POST', token: student.token, body: { ...scan.data.extracted, scanToken: forged } });
    assert.equal(r.status, 410);
    assert.equal(r.data.code, 'SCAN_EXPIRED');
  });

  test('missing file gives a clear 400', async () => {
    const r = await call('/certificates/verify-upload', { method: 'POST', token: student.token, body: {} });
    assert.equal(r.status, 400);
  });

  test('short QR links resolve (any case, dashes ok); private and unknown links do not', async () => {
    const users = await call('/users');
    const me = users.data.students.find((u) => u.id === student.user.id);
    assert.match(me.shareCode, /^[0-9a-z]{8}$/);
    const ok = await call('/verify', { method: 'POST', body: { candidateLookup: `https://trusttrace.example/v/${me.shareCode}` } });
    assert.equal(ok.data.candidate.id, student.user.id);
    assert.ok(ok.data.candidateCredentials[0].verifiableCredential.proof.r, 'signed data is returned for local signature checks');
    const code = credential.shareCode.toUpperCase();
    const dashed = await call('/verify', { method: 'POST', body: { candidateLookup: `${code.slice(0, 4)}-${code.slice(4)}` } });
    assert.equal(dashed.data.credential.id, credential.id);
    assert.equal((await call('/verify', { method: 'POST', body: { candidateLookup: 'https://x/v/zzzzzzzz' } })).status, 404);

    await call(`/credentials/${credential.id}/privacy`, { method: 'PATCH', token: student.token, body: { isPublic: false } });
    assert.equal((await call('/verify', { method: 'POST', body: { candidateLookup: `https://x/v/${credential.shareCode}` } })).status, 404);
    assert.equal((await call('/verify', { method: 'POST', body: { credentialId: credential.id } })).status, 404, 'private credentials are hidden from ID lookups too');
    assert.equal((await call('/verify', { method: 'POST', token: student.token, body: { credentialId: credential.id } })).status, 200, 'the owner can still look it up');
    await call(`/credentials/${credential.id}/privacy`, { method: 'PATCH', token: student.token, body: { isPublic: true } });
  });

  test('revoked credentials are still shown — marked revoked — via their link', async () => {
    await call(`/credentials/${credential.id}/revoke`, { method: 'POST', token: adminToken, body: { reason: 'test' } });
    const r = await call('/verify', { method: 'POST', body: { candidateLookup: credential.shareCode } });
    assert.equal(r.status, 200);
    assert.equal(r.data.credential.state, 'Revoked');
  });
});
