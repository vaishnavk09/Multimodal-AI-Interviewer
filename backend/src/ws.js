import { WebSocketServer } from "ws";
import { verifyToken } from "./middleware/auth.middleware.js";
import { createTranscriptionProxy } from "./services/transcriptionProxy.js";

export function attachWS(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/ws/transcribe")) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      socket.destroy();
    }
  });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const sessionId = parts.pop();
    const token = url.searchParams.get("token");

    try {
      const user = verifyToken(token);
      const proxy = createTranscriptionProxy(sessionId, user.userId, ws);

      ws.on("message", (chunk) => {
        proxy.push(chunk);
      });

      ws.on("close", () => {
        proxy.end();
      });

      ws.on("error", (err) => {
        console.warn("[ws] socket error:", err.message);
        proxy.end();
      });
    } catch (err) {
      console.warn("[ws] auth failed on connection:", err.message);
      ws.close(4001, "Unauthorized");
    }
  });

  return wss;
}
