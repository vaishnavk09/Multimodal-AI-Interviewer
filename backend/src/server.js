import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import interviewRoutes from "./routes/interview.routes.js";

import http from "http";
import { attachWS } from "./ws.js";

dotenv.config();

// ── Fail fast on insecure configuration ──────────────────────────────────────
const isProd = process.env.NODE_ENV === "production";
if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev_secret_change_me")) {
  console.error("[server] FATAL: JWT_SECRET must be set to a strong value in production.");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.warn("[server] WARNING: JWT_SECRET not set — using an insecure dev default. Do not use in production.");
}

const app = express();

// Security headers.
app.use(helmet());

// CORS locked to the configured frontend origin(s). Comma-separate for multiple.
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / non-browser clients (no Origin header).
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

// Basic abuse protection on the API surface.
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests, please try again later." },
  })
);

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/interview", interviewRoutes);

const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
attachWS(httpServer);

connectDB().then(() => {
  httpServer.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
});
