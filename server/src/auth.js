import jwt from "jsonwebtoken";

const TOKEN_MAX_AGE = "30d";

// Bearer-token auth instead of cookies. The client stores this token itself
// (localStorage) and sends it explicitly via the Authorization header on
// every request. This avoids relying on the browser to carry a session
// cookie across a cross-site request (client on vercel.app, server on
// onrender.com) — browsers routinely refuse to send cross-site cookies
// (Safari always blocks third-party cookies by default; other browsers can
// too depending on SameSite/Secure config), which was causing signed-in
// users on a second device to silently look "signed in" but never actually
// be able to read/write their data.
export function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: TOKEN_MAX_AGE });
}

// Reads the "Authorization: Bearer <token>" header, verifies it, and
// attaches req.userId. Responds 401 if missing/invalid — routes behind this
// can assume req.userId is set.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return res.status(401).json({ error: "not_authenticated" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "invalid_session" });
  }
}
