# Live Real-Time Transcription Design
## Multimodal-AI-Interviewer — Scalable Architecture Proposal

> **Scope:** Replace the current Web Speech API + polling-Whisper hybrid with a
> production-grade, browser-agnostic, real-time streaming transcription pipeline.
> Grounded in the existing stack: React 18 + Vite · Node.js/Express · Python FastAPI
> (`ai-services`) · MongoDB · Docker Compose.

---

## 1. What's Wrong With the Current Approach

| Current mechanism | Problem |
|---|---|
| `SpeechRecognition` (Web Speech API) | Chrome-only. Routes audio to Google's STT servers — blocked by VPN/firewalls, rate-limited, zero offline support. |
| 6-second polling (`/transcribe-partial`) | Sends the entire growing Blob every 6 s. At 60 s of audio that's ~3–5 MB per poll. Whisper re-transcribes the full clip every time — wasted compute. Latency = 6 s + Whisper inference time. |
| `faster-whisper base` on CPU | Batching is impossible when each poll is a different partial clip. CPU inference on a growing clip drifts to 10–15 s behind real-time at the 1-minute mark. |
| No WebSocket / streaming channel | Every partial transcript is a fresh HTTP round-trip with multipart upload overhead. |
| Single FastAPI worker (`uvicorn main:app`) | One concurrent Whisper job saturates the worker. Two simultaneous users = second user waits for first to finish. |

**Target:** < 1.5 s word latency, works in Firefox + Chrome + Safari, ≥ 10 concurrent interview sessions, no dependency on Google STT.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (React)                     │
│                                                         │
│  MediaRecorder (250 ms timeslice)                       │
│       │  raw audio chunks (WebM/Opus)                   │
│       ▼                                                 │
│  WebSocket Client  ──────────────────────────────────►  │
│                          WS /ws/transcribe/:sessionId   │
│  ◄──────────────────────────────────────────────────    │
│  { partial: "...", final: "...", isFinal: bool }        │
│       │                                                 │
│  Transcript Panel (live appending)                      │
└─────────────────────────────────────────────────────────┘
            │ WS proxy                   │ REST
            ▼                           ▼
┌─────────────────────┐     ┌──────────────────────────┐
│  Node.js / Express  │     │  Node.js / Express       │
│  WS Gateway         │────►│  (existing interview API) │
│  ws or socket.io    │     └──────────────────────────┘
└─────────────────────┘
            │ internal HTTP stream / WS
            ▼
┌──────────────────────────────────────────────────────────┐
│              Python FastAPI  (ai-services)               │
│                                                         │
│  POST /transcribe/stream  (chunked streaming endpoint)  │
│       │                                                 │
│  ChunkBuffer  ──► VAD (silero-vad / webrtcvad)          │
│                        │ speech segment detected        │
│                        ▼                               │
│              faster-whisper (tiny · int8)               │
│                   (streaming decode)                    │
│                        │                               │
│       ◄── SSE / chunked JSON frames ────────────────    │
└──────────────────────────────────────────────────────────┘
```

### Data Flow in Plain Language

1. The browser captures mic audio via `MediaRecorder` in 250 ms chunks.
2. Each chunk is sent over a WebSocket connection to the Node.js gateway.
3. The gateway buffers chunks into ~1.5 s segments and streams them to the FastAPI `ai-services` layer via an internal HTTP chunked POST.
4. `ai-services` runs a lightweight Voice Activity Detector (VAD) to identify speech segments, then passes them to `faster-whisper` for transcription.
5. Partial transcript tokens are streamed back as Server-Sent Events / chunked JSON. Final segment transcripts are flagged with `isFinal: true`.
6. The Node.js gateway forwards these back to the browser over the original WebSocket.
7. The React frontend appends partial words in real time and commits final segments to the session transcript store.

---

## 3. Detailed Component Design

### 3.1 Frontend — `InterviewSession.jsx`

#### Audio Capture

```js
// Prefer Opus/WebM for low overhead; fall back to whatever the browser supports
const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
  ? 'audio/webm;codecs=opus'
  : 'audio/webm';

const recorder = new MediaRecorder(stream, {
  mimeType,
  audioBitsPerSecond: 16000,   // 16 kbps is plenty for speech
});

recorder.ondataavailable = (e) => {
  if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(e.data);   // send raw binary chunk
  }
};

recorder.start(250);  // 250 ms timeslice — ~4 events/second
```

#### WebSocket Connection

```js
const wsRef = useRef(null);

function connectTranscriptionWS(sessionId, token) {
  const ws = new WebSocket(
    `${WS_BASE_URL}/ws/transcribe/${sessionId}?token=${token}`
  );
  ws.binaryType = 'arraybuffer';

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.isFinal) {
      setTranscript(prev => prev + msg.final + ' ');
    } else {
      setPartialWord(msg.partial);   // render in a muted span next to cursor
    }
  };

  ws.onerror = () => setTranscriptFallback(true);   // degrade to textarea
  ws.onclose = handleWSClose;
  wsRef.current = ws;
}
```

#### Transcript Panel UI

```
┌──────────────────────────────────────────────┐
│  Your answer                      🎙 Live    │
│                                              │
│  "I built the ZEN mental health app using   │
│   the MERN stack and integrated an LLM      │
│   for personalised..."                       │
│   ▌ journaling prompts_              ← live  │
│                                              │
│  [Type here if mic unavailable]              │
└──────────────────────────────────────────────┘
```

- Committed (final) text renders in full ink.
- The current partial word renders in `color: muted` with a blinking cursor.
- If the WebSocket drops, the textarea becomes editable and accepts typed input — same fallback path as before.

#### Reconnection Logic

```js
function handleWSClose(event) {
  if (event.code !== 1000 && retryCount.current < 3) {
    retryCount.current += 1;
    setTimeout(() => connectTranscriptionWS(sessionId, token), 1500);
  } else {
    setTranscriptFallback(true);
  }
}
```

---

### 3.2 Node.js Gateway — WebSocket Server

Add to `backend/src/server.js` (or a dedicated `ws.js` module):

```js
import { WebSocketServer } from 'ws';
import { verifyToken } from './middleware/auth.js';
import { createTranscriptionProxy } from './services/transcriptionProxy.js';

export function attachWS(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/transcribe' });

  wss.on('connection', async (ws, req) => {
    // Extract sessionId from path: /ws/transcribe/:sessionId?token=...
    const url = new URL(req.url, 'ws://localhost');
    const sessionId = url.pathname.split('/').pop();
    const token = url.searchParams.get('token');

    try {
      const user = verifyToken(token);
      const proxy = createTranscriptionProxy(sessionId, user.id, ws);
      ws.on('message', (chunk) => proxy.push(chunk));
      ws.on('close', () => proxy.end());
    } catch {
      ws.close(4001, 'Unauthorized');
    }
  });
}
```

#### `transcriptionProxy.js` — Internal Streaming to ai-services

```js
import { PassThrough } from 'stream';
import axios from 'axios';

export function createTranscriptionProxy(sessionId, userId, clientWs) {
  const audioStream = new PassThrough();
  let buffer = Buffer.alloc(0);

  // Stream audio to ai-services chunked POST
  const req = axios({
    method: 'POST',
    url: `${AI_SERVICE_URL}/transcribe/stream`,
    data: audioStream,
    headers: { 'Content-Type': 'application/octet-stream', 'X-Session-Id': sessionId },
    responseType: 'stream',
    timeout: 0,           // no timeout — this is a long-lived stream
  });

  req.then(({ data: responseStream }) => {
    responseStream.on('data', (chunk) => {
      // ai-services sends newline-delimited JSON frames
      const frames = chunk.toString().split('\n').filter(Boolean);
      frames.forEach(f => {
        try { clientWs.send(f); } catch {}
      });
    });
  }).catch(() => {
    clientWs.send(JSON.stringify({ error: 'transcription_unavailable' }));
  });

  return {
    push(chunk) {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      // Flush every ~1.5 s worth of audio (at 16 kbps = ~3 KB per 1.5 s)
      if (buffer.length >= 3000) {
        audioStream.write(buffer);
        buffer = Buffer.alloc(0);
      }
    },
    end() {
      if (buffer.length) audioStream.write(buffer);
      audioStream.end();
    }
  };
}
```

---

### 3.3 Python FastAPI — `ai-services/routers/transcribe_stream.py`

```python
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel
import webrtcvad
import asyncio, json

router = APIRouter()

# Load once at startup — tiny is ~75 MB, runs 4–6× real-time on CPU
whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
vad = webrtcvad.Vad(2)   # aggressiveness 0–3; 2 = balanced

SAMPLE_RATE = 16000
FRAME_MS = 30            # VAD frame size: 10, 20, or 30 ms only
FRAME_BYTES = int(SAMPLE_RATE * FRAME_MS / 1000) * 2   # 16-bit PCM


@router.post("/transcribe/stream")
async def transcribe_stream(request: Request):
    session_id = request.headers.get("X-Session-Id", "unknown")

    async def generate():
        speech_frames = []
        silence_count = 0
        SILENCE_THRESHOLD = 10   # 10 × 30 ms = 300 ms of silence → flush segment

        async for raw_chunk in request.stream():
            # Decode WebM/Opus → raw PCM via ffmpeg subprocess (see note below)
            pcm_frames = await decode_to_pcm(raw_chunk)

            for frame in split_into_vad_frames(pcm_frames, FRAME_BYTES):
                is_speech = vad.is_speech(frame, SAMPLE_RATE)

                if is_speech:
                    speech_frames.append(frame)
                    silence_count = 0
                else:
                    silence_count += 1
                    if speech_frames:
                        speech_frames.append(frame)   # include trailing silence

                if silence_count >= SILENCE_THRESHOLD and speech_frames:
                    # We have a complete speech segment — transcribe it
                    pcm_audio = b''.join(speech_frames)
                    segments, _ = whisper_model.transcribe(
                        pcm_audio,
                        language="en",
                        beam_size=1,           # greedy — fastest
                        vad_filter=False,      # we already did VAD above
                        word_timestamps=False,
                    )
                    text = " ".join(s.text.strip() for s in segments)
                    if text:
                        frame_json = json.dumps({"isFinal": True, "final": text})
                        yield frame_json + "\n"

                    speech_frames = []
                    silence_count = 0

    return StreamingResponse(generate(), media_type="text/plain")


async def decode_to_pcm(webm_chunk: bytes) -> bytes:
    """
    Decode a WebM/Opus chunk to 16 kHz 16-bit mono PCM using ffmpeg.
    ffmpeg is already available in most Python environments; add it to
    ai-services/requirements.txt via the `ffmpeg-python` package.
    """
    import asyncio, subprocess
    proc = await asyncio.create_subprocess_exec(
        'ffmpeg', '-f', 'webm', '-i', 'pipe:0',
        '-ar', '16000', '-ac', '1', '-f', 's16le', 'pipe:1',
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate(webm_chunk)
    return stdout


def split_into_vad_frames(pcm: bytes, frame_bytes: int):
    for i in range(0, len(pcm) - frame_bytes + 1, frame_bytes):
        yield pcm[i:i + frame_bytes]
```

Register the router in `ai-services/main.py`:

```python
from routers.transcribe_stream import router as transcribe_stream_router
app.include_router(transcribe_stream_router)
```

---

### 3.4 Scaling — Multiple Concurrent Sessions

The single bottleneck is Whisper on CPU. The approach here:

#### Option A — Multiple Workers (immediate, no infra change)

Run `uvicorn` with `--workers N` where N = number of CPU cores:

```yaml
# docker-compose.yml
ai-services:
  command: uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

Each worker loads its own Whisper `tiny` model (~75 MB × 4 = 300 MB RAM). With `tiny` + int8 on a 4-core machine, you get ~4 parallel transcription streams, each running 4–6× real-time — easily handles 10+ concurrent sessions because Whisper is only called at segment boundaries (every ~2–3 s of speech), not continuously.

#### Option B — GPU (if available)

```python
whisper_model = WhisperModel("small", device="cuda", compute_type="float16")
```

Switch model to `small` for higher accuracy; GPU inference is 20–40× real-time — one GPU instance handles 30+ concurrent sessions.

#### Option C — Horizontal Scaling with Redis Queue (production)

For large scale (100+ concurrent users):

```
Browser WS → Node Gateway → Redis Queue (BullMQ)
                                   │
                    ┌──────────────┴──────────────┐
                    ▼              ▼              ▼
              ai-worker-1    ai-worker-2    ai-worker-3
              (Whisper tiny) (Whisper tiny) (Whisper tiny)
```

Each worker pulls audio segments from the queue, transcribes, and pushes results back via Redis pub/sub. The Node gateway subscribes per `sessionId` and forwards to the correct WebSocket client.

**For the current project scope (final year project / portfolio), Option A is sufficient. Implement Option C only if pitching to real users or for the Tata InnoVent demo.**

---

## 4. File Change Map

```
backend/
├── src/
│   ├── server.js                      MODIFY  — call attachWS(httpServer)
│   ├── services/
│   │   └── transcriptionProxy.js      NEW     — streams audio to ai-services
│   └── routes/
│       └── interview.routes.js        MODIFY  — remove /transcribe-partial route

ai-services/
├── main.py                            MODIFY  — include transcribe_stream router
├── routers/
│   └── transcribe_stream.py           NEW     — VAD + Whisper streaming endpoint
└── requirements.txt                   MODIFY  — add webrtcvad, ffmpeg-python

frontend/src/
├── pages/Interview.jsx (or
│   InterviewSession.jsx)              MODIFY  — replace MediaRecorder+polling with
│                                               WS connection + binary send
└── components/
    └── TranscriptPanel.jsx            NEW     — live transcript display component

docker-compose.yml                     MODIFY  — add --workers flag to ai-services
```

---

## 5. Step-by-Step Implementation Order

### Step 1 — Add WebRTC VAD and ffmpeg to ai-services

```bash
# ai-services/requirements.txt — add:
webrtcvad==2.0.10
ffmpeg-python==0.2.0
```

```bash
# Dockerfile for ai-services — ensure ffmpeg binary is installed:
RUN apt-get update && apt-get install -y ffmpeg
```

Verify: `python -c "import webrtcvad; print('ok')"` inside the container.

---

### Step 2 — Build the streaming transcription endpoint

Create `ai-services/routers/transcribe_stream.py` as shown in Section 3.3.

Test it in isolation with a sample WebM file:

```bash
curl -X POST http://localhost:8000/transcribe/stream \
  -H "Content-Type: application/octet-stream" \
  -H "X-Session-Id: test123" \
  --data-binary @sample.webm
```

You should see newline-delimited JSON frames streaming out as the audio is processed.

---

### Step 3 — Add WebSocket server to Node.js backend

1. Install the `ws` package:

```bash
cd backend && npm install ws
```

2. In `backend/src/server.js`, after `const httpServer = app.listen(PORT)`:

```js
import { attachWS } from './ws.js';
attachWS(httpServer);
```

3. Create `backend/src/ws.js` and `backend/src/services/transcriptionProxy.js` as shown in Section 3.2.

Test: connect a WebSocket client (`wscat -c "ws://localhost:5000/ws/transcribe/test?token=..."`) and send binary data — verify JSON frames come back.

---

### Step 4 — Update the React frontend

In `Interview.jsx` (or split into `InterviewSession.jsx` + `TranscriptPanel.jsx`):

1. Remove: the existing `startSpeechRecognition()` function, the `transcribePollRef` interval, and the `/transcribe-partial` axios call.
2. Add: `connectTranscriptionWS()` called immediately after `startRecording()`.
3. Change `MediaRecorder.start(500)` → `MediaRecorder.start(250)` for lower latency.
4. Update `recorder.ondataavailable` to send binary chunks over the WebSocket instead of buffering into `chunksRef`.

Keep `chunksRef` alive for the final `/submit` call (the final Whisper transcription for scoring still needs the full audio blob). The WS transcript is for display only; the authoritative transcript sent for NLP scoring remains the full-clip Whisper output at session end.

---

### Step 5 — Update docker-compose for concurrency

```yaml
ai-services:
  build: ./ai-services
  ports:
    - "8000:8000"
  command: uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
  deploy:
    resources:
      limits:
        memory: 2G    # 4 workers × ~500 MB each with model loaded
```

---

### Step 6 — End-to-End Test Matrix

| Scenario | Expected |
|---|---|
| Chrome, good network | WS connects, transcript appears < 1.5 s after speech starts |
| Firefox, good network | WS connects (no Web Speech API needed), transcript appears |
| Safari on iOS | WS connects, MediaRecorder uses AAC; ffmpeg decodes correctly |
| VPN / firewall active | WS connects to your own server (not Google), transcript appears |
| WS drops mid-session | Auto-reconnect × 3, fallback to textarea on 3rd failure |
| 2 simultaneous users | Both get independent transcripts; no cross-session leakage |
| Silence for 10 s | No transcript frames sent; session stays open |
| Answer > 2 min | Transcript continues accumulating; no timeout |

---

## 6. Latency Budget

```
Browser mic capture chunk (250 ms timeslice)          250 ms
Buffer to ~1.5 s segment in proxy                    1250 ms
WebM → PCM decode (ffmpeg, async)                     ~50 ms
VAD framing                                           ~10 ms
Whisper tiny inference on 1.5 s segment (CPU)        ~200 ms
JSON serialise + WS send                               ~5 ms
────────────────────────────────────────────────────────────
Total latency from speech → text on screen          ~1765 ms
```

With GPU: Whisper inference drops to ~20 ms → total < 600 ms.

This is acceptable for a mock interview context where a ~1.5 s lag matches the natural pace of reviewing your own spoken words.

---

## 7. What Stays the Same

- The final authoritative transcription for NLP scoring (`/transcribe` in ai-services, `submitResponse` in the backend controller) is **unchanged**. It still sends the full audio blob through `faster-whisper base` for the highest accuracy before scoring.
- JWT auth, session management, MongoDB schema, Gemini question generation, MediaPipe facial analysis, Librosa prosody analysis — none of these are touched.
- The fallback textarea path for users without mic access is preserved; the WS failure handler degrades to it cleanly.

---

## 8. Dependencies Added

| Package | Where | Purpose |
|---|---|---|
| `ws` | `backend/` (npm) | WebSocket server |
| `webrtcvad` | `ai-services/` (pip) | Voice Activity Detection |
| `ffmpeg-python` | `ai-services/` (pip) | WebM → PCM decode |
| `ffmpeg` binary | `ai-services` Docker image | Actual codec |

No new cloud services. No API keys. No external STT dependency.

---

## 9. Cleanup — Remove After This Is Working

Once the WS pipeline is confirmed stable, remove:

- `frontend/src/pages/Interview.jsx` — `startSpeechRecognition()` and all `SpeechRecognition` references
- `transcribePollRef`, `transcribingRef`, and the `setInterval` polling block
- `backend/src/routes/interview.routes.js` — `POST /transcribe-partial` route
- `backend/src/controllers/interview.controller.js` — `transcribePartial` handler

The `FIX_TRANSCRIPT_AND_FLOW.md` in the repo documents the partial polling approach as a workaround; this design replaces it entirely. Keep the `FIX_TRANSCRIPT_AND_FLOW.md` Part 2 (structured interview flow / stage plan) — that is independent of transcription and still valid.

---

*Document version: 1.0 · Stack target: Node.js 18 · Python 3.11 · faster-whisper 1.x · React 18*
