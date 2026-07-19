// Shared localStorage-backed auth token — used instead of a cookie so the
// session survives cross-site API calls in every browser (the client on
// vercel.app calling the server on onrender.com is a cross-site request;
// cookies aren't reliable there, but an explicit header always is).
const KEY = "qamu_auth_token";

export function getToken() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // storage unavailable (private browsing, quota, etc.) — user will just
    // need to sign in again next visit rather than staying persisted
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}

// Spread this into a fetch() call's headers wherever an authenticated
// request is made.
export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
