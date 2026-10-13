import jwt from "jsonwebtoken";

export function verifyToken(token) {
  if (!token) throw new Error("No token provided");
  return jwt.verify(token, process.env.JWT_SECRET || "dev_secret_change_me");
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
