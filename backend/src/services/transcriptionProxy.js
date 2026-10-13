import { PassThrough } from "stream";
import axios from "axios";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

export function createTranscriptionProxy(sessionId, userId, clientWs) {
  const audioStream = new PassThrough();
  let buffer = Buffer.alloc(0);
  let isClosed = false;

  // Stream audio to ai-services chunked POST
  const req = axios({
    method: "POST",
    url: `${AI_SERVICE_URL}/transcribe/stream`,
    data: audioStream,
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Session-Id": sessionId || "unknown",
    },
    responseType: "stream",
    timeout: 0, // no timeout — this is a long-lived stream
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  req
    .then(({ data: responseStream }) => {
      let remainder = "";
      responseStream.on("data", (chunk) => {
        // ai-services sends newline-delimited JSON frames
        const str = remainder + chunk.toString();
        const lines = str.split("\n");
        remainder = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && clientWs.readyState === 1 /* OPEN */) {
            try {
              clientWs.send(trimmed);
            } catch (err) {
              console.warn("[transcriptionProxy] clientWs send error:", err.message);
            }
          }
        }
      });

      responseStream.on("end", () => {
        const trimmed = remainder.trim();
        if (trimmed && clientWs.readyState === 1) {
          try {
            clientWs.send(trimmed);
          } catch {}
        }
      });

      responseStream.on("error", (err) => {
        console.warn("[transcriptionProxy] responseStream error:", err.message);
      });
    })
    .catch((err) => {
      console.warn("[transcriptionProxy] ai-services stream connection failed:", err.message);
      if (clientWs.readyState === 1) {
        try {
          clientWs.send(JSON.stringify({ error: "transcription_unavailable" }));
        } catch {}
      }
    });

  return {
    push(chunk) {
      if (isClosed) return;
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      // Flush every ~1.5 s worth of audio (at 16 kbps = ~3 KB per 1.5 s)
      if (buffer.length >= 3000) {
        audioStream.write(buffer);
        buffer = Buffer.alloc(0);
      }
    },
    end() {
      if (isClosed) return;
      isClosed = true;
      if (buffer.length > 0) {
        audioStream.write(buffer);
        buffer = Buffer.alloc(0);
      }
      audioStream.end();
    },
  };
}
