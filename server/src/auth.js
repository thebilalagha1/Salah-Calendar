import jwt from "jsonwebtoken";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
  const secure = process.env.COOKIE_SECURE === "true";
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    // "none" is required for the cookie to be sent on cross-site requests
    // (client on vercel.app, server on onrender.com are different sites).
    // Browsers only accept SameSite=None when Secure is also true, which is
    // why this is tied to COOKIE_SECURE rather than hardcoded.
    sameSite: secure ? "none" : "lax",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

// Reads the session cookie, verifies it, and attaches req.userId.
// Responds 401 if missing/invalid — routes behind this can assume req.userId is set.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: "not_authenticated" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "invalid_session" });
  }
}
