# Fix: Live Transcript Not Filling + Structured Interview Flow

**Verified against commit:** `776c6d0` ("enhacnements")

Two independent fixes. Do Part 1 first — it's the broken core interaction. Part 2
is a prompt/schema change, lower risk, do it after Part 1 is confirmed working.

---

## Part 1 — Live Transcript Not Filling As Candidate Speaks

### 1.0 Diagnose before patching blindly

Don't apply every fix below speculatively — spend 5 minutes narrowing it down
first, otherwise you won't know which fix actually mattered.

1. Open the deployed app in **Chrome** (not Firefox — Firefox has no
   `SpeechRecognition` support at all; the UI already detects this and shows
   "Auto-transcription unavailable — type below." If you're testing in Firefox,
   that's not a bug, it's correctly degrading — test in Chrome to isolate the
   real issue).
2. Open DevTools Console, start an interview, speak for 5+ seconds.
3. Look for `[speech]` log lines:
   - `"recognition error: network"` → Chrome's cloud speech backend is
     unreachable (firewall, VPN, or Google's STT endpoint blocked/rate-limited).
     This is the most common cause — **Web Speech API sends your audio to
     Google's servers**, it is not a local/offline recognizer.
   - `"recognition error: not-allowed"` → mic permission issue, unrelated to
     everything else below.
   - No `[speech]` logs at all, `speechActive` never becomes visually active →
     `recognition.start()` may be throwing silently, or never being called —
     check the Network tab isn't relevant here (it's not a fetch call), check
     React DevTools / add a temporary `console.log` at the top of
     `startSpeechRecognition()` to confirm it's even invoked.
4. Note which case you hit — it determines whether Part 1.1–1.3 (patches) alone
   fix it, or whether you need Part 1.4 (the real fix).

### 1.1 Fix the AudioContext leak

**File:** `frontend/src/pages/Interview.jsx`, `startMicLevelMeter()`

The `AudioContext` created here is never closed — it stays connected to the mic
for the entire interview, alongside `MediaRecorder` and `SpeechRecognition`'s
own independent mic capture. Not guaranteed to be the root cause, but it's a
real resource leak and cheap to fix — do it regardless of what 1.0 found.

```js
const audioCtxRef = useRef(null); // add this near the other refs

function startMicLevelMeter(stream) {
  try {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx; // store it so it can be closed later
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
    // ...rest unchanged
  } catch {}
}
```

Close it wherever the device-check phase ends and wherever media fully stops:

```js
function proceedToInterview() {
  if (micAnimFrameRef.current) cancelAnimationFrame(micAnimFrameRef.current);
  if (audioCtxRef.current) {
    audioCtxRef.current.close();
    audioCtxRef.current = null;
  }
  setDeviceCheckDone(true);
  // ...rest unchanged
}

function stopAllMedia() {
  streamRef.current?.getTracks().forEach((t) => t.stop());
  streamRef.current = null;
  stopSpeechRecognition();
  if (micAnimFrameRef.current) cancelAnimationFrame(micAnimFrameRef.current);
  if (audioCtxRef.current) {
    audioCtxRef.current.close();
    audioCtxRef.current = null;
  }
}
```

### 1.2 Make STT failures visible instead of silent

**File:** `frontend/src/pages/Interview.jsx`, `recognition.onerror`

Right now a failure is invisible to the candidate — they just see "Listening…"
forever. Surface it:

```js
const [speechError, setSpeechError] = useState("");

recognition.onerror = (e) => {
  console.warn("[speech] recognition error:", e.error);
  if (e.error === "not-allowed" || e.error === "service-not-allowed") {
    isRecordingRef.current = false;
    setSpeechError("Microphone permission was denied — please type your answer.");
  } else if (e.error === "network") {
    setSpeechError("Live transcription needs an internet connection and isn't reachable right now — please type your answer, or check your connection.");
  } else if (e.error === "no-speech") {
    // benign, happens during silence — don't surface as an error
  } else {
    setSpeechError("Live transcription hit an issue — you can keep typing your answer.");
  }
};
```

Render `speechError` near the answer textarea (same style as the existing
`captureError` banner) so the candidate isn't left guessing why nothing's
appearing.

### 1.3 Add a stuck-detector

If recognition reports itself "active" but produces zero results for an
extended stretch while the mic level visualizer shows the candidate is
clearly speaking, that's a strong signal something's silently broken. Add a
timer: if `speechActive` has been true for >10s with no `onresult` call,
surface the same "you can keep typing" message from 1.2. This catches cases
where `onerror` never fires but recognition is still effectively dead.

### 1.4 The real fix: don't depend on the browser as the only transcription path

Web Speech API is Chrome-only, needs network access to Google, and has no
guaranteed reliability — it's fine as a nice-to-have instant-feedback layer,
but it **should not be the only way transcription happens**. This matches
what the original architecture called the "fast path" — add a server-side
chunked-transcription fallback that works in every browser, independent of
Web Speech API entirely.

**Approach:** periodically send the audio recorded so far to the existing
Whisper endpoint (`/transcribe` in `ai-services`) while the candidate is still
answering, and merge the result into the textarea. This gives near-real-time
transcription (every ~6s) that works regardless of browser or network
restrictions on Google's STT service.

**Steps:**

1. **`frontend/src/pages/Interview.jsx`**: add a polling interval inside
   `startRecording()`:
   ```js
   const transcribePollRef = useRef(null);
   const transcribingRef = useRef(false);

   function startRecording() {
     // ...existing setup...
     recorder.start(500);
     mediaRecorderRef.current = recorder;
     isRecordingRef.current = true;
     setIsRecording(true);
     startSpeechRecognition();

     // Poll every 6s: send accumulated audio so far for a server-side transcript
     transcribePollRef.current = setInterval(async () => {
       if (transcribingRef.current || chunksRef.current.length === 0) return;
       transcribingRef.current = true;
       try {
         const blobSoFar = new Blob(chunksRef.current, { type: "video/webm" });
         const formData = new FormData();
         formData.append("file", blobSoFar, "partial.webm");
         const { data } = await api.post(`/interview/transcribe-partial`, formData);
         if (data.transcript && data.transcript.trim()) {
           // Only use this if Web Speech API hasn't already produced text —
           // avoid fighting with it if the browser path is working fine.
           setTranscript((prev) => (prev.trim() ? prev : data.transcript.trim()));
         }
       } catch (err) {
         console.warn("[partial-transcribe] failed:", err.message);
       } finally {
         transcribingRef.current = false;
       }
     }, 6000);
   }
   ```
   Clear the interval in `stopCurrentRecording()` and `stopAllMedia()`
   (`clearInterval(transcribePollRef.current)`).

2. **`backend/src/routes/interview.routes.js`**: add a lightweight proxy route:
   ```js
   router.post(
     "/transcribe-partial",
     requireAuth,
     upload.single("file"),
     transcribePartial
   );
   ```

3. **`backend/src/controllers/interview.controller.js`**: add the handler —
   it's just a thin passthrough to the existing `ai-services` `/transcribe`
   endpoint (reuse the same logic already in `submitResponse`'s media-handling
   block, factor it into a shared helper function to avoid duplicating it):
   ```js
   export async function transcribePartial(req, res) {
     if (!req.file) return res.status(400).json({ transcript: "" });
     try {
       const buffer = fs.readFileSync(req.file.path);
       const formData = new FormData();
       formData.append("file", new Blob([buffer]), req.file.originalname);
       const { data } = await axios.post(`${AI_SERVICE_URL}/transcribe`, formData, {
         headers: { "Content-Type": "multipart/form-data" },
         timeout: 20000, // shorter timeout than final submit — this is a background poll, fail fast
       });
       res.json({ transcript: data.transcript || "" });
     } catch (err) {
       res.json({ transcript: "" }); // silent fail is fine here, it's just a convenience poll
     } finally {
       if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
     }
   }
   ```

4. **Note on `ai-services`' `/transcribe`**: it currently loads Whisper `base`
   on CPU with int8 — re-transcribing a growing ~6s-to-60s clip every 6 seconds
   will add real CPU load during the interview. If this becomes noticeably
   slow, switch the model to `tiny` for this specific partial-polling use case
   (keep `base` for the final, authoritative transcription in `submitResponse`
   if you want higher accuracy there) — don't optimize this prematurely, just
   watch for it.

**Verify:** test in Firefox (where Web Speech API doesn't exist at all) and
confirm the textarea still fills in, just a few seconds behind real-time
instead of instantly. Then test in Chrome and confirm Web Speech API's instant
text still takes priority when it's working (the `prev.trim() ? prev : ...`
check in step 1 ensures the poll doesn't overwrite good live text).

---

## Part 2 — Structured Interview Flow (Intro → Experience → Technical → Behavioral → Close)

### 2.0 The problem

`generateQuestion()` currently has no concept of interview stage — only
"opening question" vs. "follow-up or new topic," decided freely by the LLM
each turn. Nothing enforces a sensible arc.

### 2.1 Define the stage plan

**File:** `backend/src/services/llmService.js` (or a new
`backend/src/services/interviewPlan.js` if you'd rather keep it separate —
recommended, keeps `llmService.js` focused on the Gemini call itself)

```js
// interviewPlan.js
export const STAGE_DESCRIPTIONS = {
  intro: "A warm opening question — e.g. asking the candidate to introduce themselves or walk through their background at a high level. Not technical yet.",
  experience: "Dig into the candidate's actual listed projects, internships, or work experience — ask them to explain a specific one in depth: their role, decisions made, challenges faced.",
  technical: "Role-specific technical questions appropriate for the target role and experience level — concepts, problem-solving, system design (scale depth to experience level).",
  behavioral: "Situational/behavioral questions — teamwork, conflict, failure, prioritization, leadership.",
  closing: "A closing question — e.g. asking if the candidate has questions, or why they want this role.",
};

export function buildStagePlan(maxQuestions) {
  if (maxQuestions <= 5) return ["intro", "experience", "technical", "technical", "behavioral"];
  if (maxQuestions === 6) return ["intro", "experience", "technical", "technical", "behavioral", "closing"];
  if (maxQuestions === 7) return ["intro", "experience", "experience", "technical", "technical", "behavioral", "closing"];
  return ["intro", "experience", "experience", "technical", "technical", "technical", "behavioral", "closing"]; // 8
}
```

### 2.2 Schema changes

**File:** `backend/src/models/Session.js`

Add two fields:
```js
stagePlan: { type: [String], default: [] },
stageIndex: { type: Number, default: 0 }, // advances only on new_topic, not on follow_up
```

### 2.3 Wire it into session start

**File:** `backend/src/controllers/interview.controller.js`, `startSession`

```js
import { buildStagePlan, STAGE_DESCRIPTIONS } from "../services/interviewPlan.js";

// ...inside startSession, after maxQuestions is computed:
const stagePlan = buildStagePlan(maxQuestions);

const session = await Session.create({
  // ...existing fields...
  stagePlan,
  stageIndex: 0,
});

// ...when calling generateQuestion for the first question, pass the stage:
const currentStage = stagePlan[0]; // "intro"
const result = await generateQuestion(session.domain, session.responses, 0, candidateContext, currentStage);
```

### 2.4 Wire it into each subsequent turn

**File:** `backend/src/controllers/interview.controller.js`, `submitResponse`

```js
const currentFollowUp = session.followUpCount || 0;
const currentStage = session.stagePlan[session.stageIndex] || "technical";

const { question: nextQuestion, type: questionType } = await generateQuestion(
  session.domain,
  session.responses,
  currentFollowUp,
  candidateContext,
  currentStage
);

if (questionType === "follow_up") {
  session.followUpCount = currentFollowUp + 1;
  // stageIndex does NOT advance — still probing the same stage/topic
} else {
  session.followUpCount = 0;
  session.stageIndex = Math.min(session.stageIndex + 1, session.stagePlan.length - 1);
}
```

### 2.5 Update the prompt to use the stage

**File:** `backend/src/services/llmService.js`, `generateQuestion()`

Add a `stage` parameter and inject its description into the prompt:

```js
export async function generateQuestion(
  domain,
  history = [],
  followUpCount = 0,
  candidateContext = null,
  stage = "intro"
) {
  // ...existing setup...

  const stageInstruction = STAGE_DESCRIPTIONS[stage]
    ? `Current interview stage: "${stage}". ${STAGE_DESCRIPTIONS[stage]}`
    : "";

  // Opening question prompt:
  prompt = `You are an expert technical interviewer conducting a mock interview for the domain "${domain}".
${contextSnippet}${stageInstruction}
Ask ONE concise question appropriate for this stage. Ground it in the candidate's target role, experience level, or specific listed projects/skills if relevant to this stage.
Return JSON ONLY in this format: {"type": "new_topic", "question": "..."}`;

  // Follow-up/continuing prompt — add stageInstruction the same way, before followUpConstraint.
}
```

Import `STAGE_DESCRIPTIONS` from `interviewPlan.js` at the top of the file.

### 2.6 Update the fallback bank to respect stages too

The static fallback bank (used when Gemini is unreachable) should also
roughly follow the stage plan rather than firing questions in a fixed list
order regardless of stage. Minimal version — tag each bank entry by stage and
pick by `stage` instead of `turnIndex`:

```js
function fallbackQuestion(domain, stage, turnIndex = 0) {
  const bank = {
    "Software Engineering": {
      intro: ["Tell me a bit about yourself and your background."],
      experience: ["Walk me through a project you're proud of — what was your specific role?"],
      technical: [
        "Explain the difference between a process and a thread.",
        "How would you design a rate limiter for a REST API?",
      ],
      behavioral: ["Describe a situation where a technical project didn't go as planned."],
      closing: ["Do you have any questions for me about the role?"],
    },
    // ...same structure for "Data Science" and "General"
  };
  const domainBank = bank[domain] || bank.General;
  const pool = domainBank[stage] || domainBank.technical;
  return {
    question: pool[turnIndex % pool.length],
    type: "new_topic", // fallback doesn't attempt follow-up logic
    source: "fallback",
  };
}
```
Update both call sites of `fallbackQuestion(domain, validHistory.length)` to
pass `stage` instead/also: `fallbackQuestion(domain, stage, validHistory.length)`.

**Verify:** run a full 5-question session and confirm the stage sequence
actually shows up as: an intro-style opener, then a question referencing the
candidate's resume projects, then technical depth, then a behavioral
question — in that order, regardless of how many follow-ups happen within a
stage. Log `currentStage` server-side for each turn during testing to confirm
it advances as expected and never skips a stage early due to a follow-up being
miscounted as a stage transition.
