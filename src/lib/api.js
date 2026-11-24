const TOKEN_KEY = 'trusttrace_token';
const REFRESH_KEY = 'trusttrace_refresh_token';
const USER_KEY = 'trusttrace_active_user';
const DEV_KEY = 'trusttrace_developer_token';

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode); session continues in memory
  }
}

let memoryToken = safeGet(TOKEN_KEY);
let refreshToken = safeGet(REFRESH_KEY);

export function getToken() {
  return memoryToken;
}

// Signing out (token = null) also drops the refresh token.
export function setSession(token, user) {
  memoryToken = token || null;
  safeSet(TOKEN_KEY, memoryToken);
  safeSet(USER_KEY, user ? JSON.stringify(user) : null);
  if (!memoryToken) {
    refreshToken = null;
    safeSet(REFRESH_KEY, null);
  }
}

function adoptTokens(token, nextRefresh) {
  memoryToken = token;
  safeSet(TOKEN_KEY, token);
  if (nextRefresh) {
    refreshToken = nextRefresh;
    safeSet(REFRESH_KEY, nextRefresh);
  }
}

export function getSavedUser() {
  try {
    return memoryToken ? JSON.parse(safeGet(USER_KEY) || 'null') : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  setSession(null, null);
}

// Sign out here and end the session on the server (its tokens stop working).
export function endSession() {
  const pending = refreshToken;
  const auth = memoryToken;
  clearSession();
  if (!pending && !auth) return;
  fetch('/api/auth/logout', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify({ refreshToken: pending })
  }).catch(() => {});
}

// Developer mode survives sign-out so a presenter can switch demo accounts.
let developerToken = safeGet(DEV_KEY);

export function getDeveloperToken() {
  return developerToken;
}

export function setDeveloperToken(token) {
  developerToken = token || null;
  safeSet(DEV_KEY, developerToken);
  window.dispatchEvent(new CustomEvent('trusttrace:developer-mode', { detail: Boolean(developerToken) }));
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Session refresh. Access tokens last ~2 hours. Before one expires, and after
// any 401 marked SESSION_EXPIRED, the refresh token is exchanged for a new pair
// and the request retried once. If that fails the session is cleared and the
// app shows the sign-in screen with a "Session expired" notice.
// ---------------------------------------------------------------------------
const REFRESH_MARGIN_S = 90;

function tokenExpiry(token) {
  try {
    const body = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(body)).exp || 0;
  } catch {
    return 0;
  }
}

const expiresSoon = (token) => tokenExpiry(token) - REFRESH_MARGIN_S < Date.now() / 1000;

function expireSession(message) {
  if (!memoryToken && !refreshToken) return;
  clearSession();
  window.dispatchEvent(new CustomEvent('trusttrace:session-expired', { detail: { message } }));
}

let refreshing = null;

// true: new tokens in place. false: the session is over. null: server unreachable.
export function refreshSession() {
  refreshing ||= (async () => {
    // Another tab may already have rotated the tokens.
    const stored = safeGet(TOKEN_KEY);
    if (stored && stored !== memoryToken && !expiresSoon(stored)) {
      memoryToken = stored;
      refreshToken = safeGet(REFRESH_KEY);
      return true;
    }
    refreshToken = safeGet(REFRESH_KEY) || refreshToken;
    if (!refreshToken) return false;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(developerToken ? { 'x-developer-token': developerToken } : {}) },
        body: JSON.stringify({ refreshToken })
      });
      if (res.status === 401 || res.status === 403) return false;
      if (!res.ok) return null;
      const data = await res.json();
      adoptTokens(data.token, data.refreshToken);
      if (data.user) safeSet(USER_KEY, JSON.stringify(data.user));
      return true;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// Keep tabs in step: a refresh or sign-out in one tab applies to all of them.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === TOKEN_KEY) {
      const hadSession = Boolean(memoryToken);
      memoryToken = e.newValue;
      if (hadSession && !e.newValue) {
        refreshToken = null;
        window.dispatchEvent(new CustomEvent('trusttrace:session-expired', { detail: { message: 'You signed out in another tab.' } }));
      }
    } else if (e.key === REFRESH_KEY) {
      refreshToken = e.newValue;
    }
  });
}

function send(path, options) {
  const headers = new Headers(options.headers || {});
  if (memoryToken) headers.set('Authorization', `Bearer ${memoryToken}`);
  else headers.delete('Authorization');
  if (developerToken) headers.set('x-developer-token', developerToken);
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(path, { ...options, headers });
}

async function isSessionExpiry(res) {
  if (res.status !== 401) return false;
  try {
    return (await res.clone().json()).code === 'SESSION_EXPIRED';
  } catch {
    return false;
  }
}

// fetch() wrapper: attaches the session, refreshes it when needed, retries once.
export async function apiFetch(path, options = {}) {
  if (memoryToken && refreshToken && expiresSoon(memoryToken) && path !== '/api/auth/refresh') {
    const ok = await refreshSession();
    if (ok === false) expireSession();
  }
  let res = await send(path, options);
  if (memoryToken && (await isSessionExpiry(res))) {
    const ok = await refreshSession();
    if (ok) res = await send(path, options);
    if (ok === false || (ok && (await isSessionExpiry(res)))) expireSession();
  }
  return res;
}

// JSON helper: returns parsed body or throws with the server's message.
export async function apiJson(path, { method = 'GET', body, ...rest } = {}) {
  const res = await apiFetch(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    ...rest
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // empty body
  }
  // Every sign-in route (login, register, Google/Apple, demo, wallet recovery)
  // returns a token pair; keep the refresh token without each screen handling it.
  if (res.ok && data.token && data.refreshToken) adoptTokens(data.token, data.refreshToken);
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
