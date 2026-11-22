import { WebSocket } from "ws";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";
const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL || "nova-3";

/**
 * Bridges a browser WebSocket to a real-time transcription engine. The browser
 * streams WebM/Opus audio; the proxy relays JSON transcript frames back using a
 * single schema: {isFinal:true, final} for committed text and
 * {isFinal:false, partial} for interim text.
 *
 * Engine selection:
 *   • Deepgram (cloud, primary) when DEEPGRAM_API_KEY is set — higher accuracy,
 *     native interim results, ingests WebM/Opus directly (no ffmpeg).
 *   • Local Whisper service (fallback) otherwise — free / offline.
 *
 * Each browser connection creates its own upstream socket. On a browser
 * reconnect the client replays the WebM header chunk so the fresh upstream
 * decoder can parse the mid-stream audio.
 */
export function createTranscriptionProxy(sessionId, userId, clientWs) {
  return DEEPGRAM_API_KEY
    ? createDeepgramProxy(sessionId, clientWs)
    : createWhisperProxy(sessionId, clientWs);
}

function relayToClient(clientWs, obj) {
  if (clientWs.readyState === 1 /* OPEN */) {
    try {
      clientWs.send(JSON.stringify(obj));
    } catch (err) {
      console.warn("[transcriptionProxy] clientWs send error:", err.message);
    }
  }
}

// ── Deepgram streaming (primary) ─────────────────────────────────────────────
function createDeepgramProxy(sessionId, clientWs) {
  const params = new URLSearchParams({
    model: DEEPGRAM_MODEL,
    language: "en",
    smart_format: "true",
    punctuate: "true",
    interim_results: "true",
  });
  const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

  let dgWs = null;
  let isClosed = false;
  let keepAlive = null;
  const pending = [];

  dgWs = new WebSocket(url, { headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` } });

  dgWs.on("open", () => {
    while (pending.length > 0) {
      try {
        dgWs.send(pending.shift());
      } catch (err) {
        console.warn("[transcriptionProxy:deepgram] flush error:", err.message);
      }
    }
    // Deepgram closes idle sockets (~10s). Keep it alive through long pauses.
    keepAlive = setInterval(() => {
      if (dgWs?.readyState === WebSocket.OPEN) {
        try {
          dgWs.send(JSON.stringify({ type: "KeepAlive" }));
        } catch {}
      }
    }, 8000);
  });

  dgWs.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const text = data?.channel?.alternatives?.[0]?.transcript;
    if (!text) return; // empty interim / metadata frames
    relayToClient(
      clientWs,
      data.is_final ? { isFinal: true, final: text } : { isFinal: false, partial: text }
    );
  });

  dgWs.on("error", (err) => {
    console.warn("[transcriptionProxy:deepgram] ws error:", err.message);
    relayToClient(clientWs, { error: "transcription_unavailable" });
  });

  dgWs.on("close", () => {
    if (keepAlive) {
      clearInterval(keepAlive);
      keepAlive = null;
    }
  });

  return {
    push(chunk) {
      if (isClosed) return;
      const buf = Buffer.from(chunk);
      if (dgWs && dgWs.readyState === WebSocket.OPEN) {
        try {
          dgWs.send(buf);
        } catch (err) {
          console.warn("[transcriptionProxy:deepgram] push error:", err.message);
        }
      } else if (pending.length < 512) {
        pending.push(buf);
      }
    },
    end() {
      if (isClosed) return;
      isClosed = true;
      if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
      }
      try {
        if (dgWs?.readyState === WebSocket.OPEN) {
          dgWs.send(JSON.stringify({ type: "CloseStream" }));
        }
      } catch {}
      try {
        dgWs?.close();
      } catch {}
    },
  };
}

// ── Local Whisper service (fallback) ─────────────────────────────────────────
function createWhisperProxy(sessionId, clientWs) {
  const wsUrl =
    AI_SERVICE_URL.replace(/^http/i, "ws").replace(/\/+$/, "") + "/ws/transcribe";

  let aiWs = null;
  let isClosed = false;
  const pending = [];

  aiWs = new WebSocket(wsUrl, { headers: { "X-Session-Id": sessionId || "unknown" } });

  aiWs.on("open", () => {
    while (pending.length > 0) {
      try {
        aiWs.send(pending.shift());
      } catch (err) {
        console.warn("[transcriptionProxy:whisper] flush error:", err.message);
      }
    }
  });

  aiWs.on("message", (data) => {
    // AI service already sends one JSON frame per message — relay verbatim.
    if (clientWs.readyState === 1) {
      try {
        clientWs.send(data.toString());
      } catch (err) {
        console.warn("[transcriptionProxy:whisper] clientWs send error:", err.message);
      }
    }
  });

  aiWs.on("error", (err) => {
    console.warn("[transcriptionProxy:whisper] ws error:", err.message);
    relayToClient(clientWs, { error: "transcription_unavailable" });
  });

  aiWs.on("close", () => {});

  return {
    push(chunk) {
      if (isClosed) return;
      const buf = Buffer.from(chunk);
      if (aiWs && aiWs.readyState === WebSocket.OPEN) {
        try {
          aiWs.send(buf);
        } catch (err) {
          console.warn("[transcriptionProxy:whisper] push error:", err.message);
        }
      } else if (pending.length < 512) {
        pending.push(buf);
      }
    },
    end() {
      if (isClosed) return;
      isClosed = true;
      try {
        if (aiWs && aiWs.readyState === WebSocket.OPEN) {
          aiWs.send(JSON.stringify({ type: "end" }));
        }
      } catch {}
      try {
        aiWs?.close();
      } catch {}
    },
  };
}
