import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import interviewRoutes from "./routes/interview.routes.js";

import http from "http";
import { attachWS } from "./ws.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/interview", interviewRoutes);

const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
attachWS(httpServer);

connectDB().then(() => {
  httpServer.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
});
