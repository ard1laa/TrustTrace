const TOKEN_KEY = 'trusttrace_token';
const USER_KEY = 'trusttrace_active_user';

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

export function getToken() {
  return memoryToken;
}

export function setSession(token, user) {
  memoryToken = token || null;
  safeSet(TOKEN_KEY, memoryToken);
  safeSet(USER_KEY, user ? JSON.stringify(user) : null);
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

// fetch() wrapper that attaches the session token and signals expiry.
export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (memoryToken) headers.set('Authorization', `Bearer ${memoryToken}`);
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401 && memoryToken && !path.startsWith('/api/auth/')) {
    window.dispatchEvent(new CustomEvent('trusttrace:session-expired'));
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
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
