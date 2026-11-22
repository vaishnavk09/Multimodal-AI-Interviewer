import jwt from "jsonwebtoken";

// In production a real secret is required (enforced at boot in server.js).
// Outside production we allow a clearly-labelled dev default for convenience.
export const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production" ? null : "dev_secret_change_me");

export function verifyToken(token) {
  if (!token) throw new Error("No token provided");
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return jwt.verify(token, JWT_SECRET);
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
