// Test harness: starts the real API on a random port with a throwaway data
// folder (your server/data is never touched), plus a local JWKS server so
// Google/Apple identity tokens can be signed and verified end to end.
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const JWT_SECRET = 'test-secret';
export const GOOGLE_CLIENT_ID = 'test-web-client.apps.googleusercontent.com';
export const APPLE_SERVICE_ID = 'com.example.trusttrace.web';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

export async function startJwks() {
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}/jwks`, close: () => server.close() };
}

// A provider identity token, signed like Google's/Apple's.
export function idToken({ provider = 'google', sub, email, name = '', aud, expIn = 3600, emailVerified = true, kid = KID }) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      iss: provider === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com',
      aud: aud || (provider === 'google' ? GOOGLE_CLIENT_ID : APPLE_SERVICE_ID),
      sub,
      email,
      email_verified: emailVerified,
      name,
      iat: now,
      exp: now + expIn
    })
  ).toString('base64url');
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url');
  return `${header}.${body}.${sig}`;
}

// HS256 access token minted with the test secret (for expiry tests).
export function mintAccessToken(payload) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${h}.${b}.${crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url')}`;
}

export const decodeJwt = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());

export async function startServer(extraEnv = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trusttrace-test-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      TRUSTTRACE_DATA_DIR: dataDir,
      MONGODB_URI: '',
      JWT_SECRET,
      DEVELOPER_ACCESS_KEY: 'test-key',
      DEVELOPER_EMAILS: 'dev@example.com',
      ENABLE_DEMO_LOGIN: 'false',
      EVENT_CROSSCHECK: 'off',
      GOOGLE_CLIENT_ID,
      GOOGLE_IOS_CLIENT_ID: '',
      APPLE_SERVICE_ID,
      APPLE_BUNDLE_ID: '',
      GEMINI_API_KEY: '',
      GOOGLE_VISION_API_KEY: '',
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/status`)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
    if (i === 99) throw new Error(`Server did not start:\n${log}`);
  }

  async function call(p, { method = 'GET', body, token, dev, headers = {} } = {}) {
    const res = await fetch(base + p, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(dev ? { 'x-developer-token': dev } : {}),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }

  return {
    base,
    call,
    dataDir,
    log: () => log,
    stop: () => {
      child.kill();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}
