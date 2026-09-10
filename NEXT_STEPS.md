# Build Plan — Multimodal AI Interviewer (Next Implementation Pass)

Repo: `Multimodal-AI-Interviewer` (React/Vite/Tailwind frontend, Node/Express backend,
MongoDB, JWT auth, Python FastAPI `ai-services`, Docker Compose).

Read `README.md` first — it accurately states what's real vs. placeholder as of now.
Do the tasks below **in order**. Each task lists exact files, what to change, and how
to verify it worked before moving to the next one. Don't jump ahead — later tasks
depend on earlier ones (e.g. the agent rewrite needs conversation history, which needs
the Session schema updated first).

---

## Task 1 — Give the interview agent memory (conversation history + follow-ups)

**Problem:** `generateQuestion(domain, priorScores)` in `backend/src/services/llmService.js`
only receives the domain and an array of past numeric scores — never the actual
question/answer text. It can only nudge difficulty, not ask real follow-ups.

**Steps:**
1. In `backend/src/models/Session.js`, the `responses` array already stores
   `question` and `transcript` per turn — no schema change needed. Confirm this.
2. Rewrite `generateQuestion` in `llmService.js`:
   - New signature: `generateQuestion(domain, history)` where `history` is
     `session.responses` (array of `{question, transcript, fusedScore}`), filtered
     to only turns that have a transcript.
   - Build the prompt from the full history, not just the last score. Include:
     - the domain
     - every prior Q&A pair, in order
     - an explicit instruction: "Decide whether to ask a follow-up that digs
       deeper into the candidate's last answer, or move to a new topic. Prefer a
       follow-up if the last answer was vague, mentioned something specific worth
       probing (a project, a technology, a decision), or contradicted an earlier
       answer. Otherwise move to a new topic appropriate for the domain."
     - Ask for ONLY the question text back (same as now).
   - Keep the existing fallback-to-static-bank behavior if `GEMINI_API_KEY` is
     missing or the call fails — do not remove this safety net.
3. In `backend/src/controllers/interview.controller.js`, update both call sites of
   `generateQuestion` (`startSession` and `submitResponse`) to pass `session.responses`
   instead of the mapped score array.
4. Add a soft cap on consecutive follow-ups on the same topic (e.g. track a
   `followUpDepth` counter in the session or infer it from repeated similar
   questions) so the interview can't get stuck probing one answer forever. Simplest
   approach: add a `followUpCount` field to the session schema, increment it when
   the LLM's new question is judged a follow-up (you can ask the LLM to prefix its
   internal reasoning, or just cap by instructing the prompt: "You have already
   asked N follow-ups on this topic; if N >= 2, move to a new topic regardless.")

**Verify:** Start a session, give a vague first answer, confirm the next question
references something specific from that answer rather than being a generic new
question. Give a strong, complete answer, confirm the next question moves topics.

---

## Task 2 — Resume + role intake

**Problem:** No CV upload, no JD, no experience level. Domain is a 3-item dropdown.
Questions have no grounding in the candidate's actual background.

**Steps:**
1. Backend: add a resume upload endpoint.
   - New route `POST /api/interview/resume` (auth required) using `multer`
     (already a dependency) to accept a PDF/DOCX file.
   - Parse it server-side. Simplest: use a Python step — this is one of the few
     things the `ai-services` FastAPI app should own, since Python has better
     resume-parsing libraries (`pyresparser`, or fall back to `pdfplumber` +
     regex/spaCy for skills/projects/experience if `pyresparser` is too heavy for
     free-tier). Add `POST /parse-resume` to `ai-services/main.py` that accepts
     the file, returns `{skills: [...], projects: [...], yearsExperience: number,
     rawText: string}`.
   - Backend forwards the uploaded file to `ai-services` and stores the parsed
     result on the session (or on the user profile if you want it reusable across
     sessions — recommend user profile, since a candidate will run multiple mock
     interviews with the same resume).
2. Extend `backend/src/models/User.js` with a `resume` sub-schema: `{skills, projects,
   yearsExperience, rawText, jobDescription, updatedAt}`. Keep `domain` for backward
   compatibility or fold it into a `targetRole` field — decide one, don't keep both
   meaning the same thing.
3. Frontend: add a resume/role step before the interview starts.
   - Simplest: extend `Dashboard.jsx` with a file input (resume) + text input
     (target role) + optional textarea (job description) + the existing domain-like
     dropdown repurposed as experience level (`Fresher` / `1-3 yrs` / `3+ yrs`).
   - On "Start interview," upload the resume first (if not already on the user's
     profile), then call `/interview/start` with `{targetRole, experienceLevel,
     jobDescription}` instead of just `{domain}`.
4. Update `startSession` in `interview.controller.js` to pass the candidate's parsed
   resume + role + experience into `generateQuestion` so the very first question is
   grounded in their actual background (e.g. "I see you worked on X — walk me
   through the architecture decisions there").

**Verify:** Upload a resume with a specific named project, start a session, confirm
the opening question references that project by name.

---

## Task 3 — Real audio/video capture + ASR

**Problem:** `Interview.jsx` uses a plain `<textarea>` — no mic/camera capture, no
transcription.

**Steps:**
1. Frontend (`Interview.jsx`):
   - Replace the textarea with `navigator.mediaDevices.getUserMedia({audio: true,
     video: true})` + `MediaRecorder` to record each answer as a Blob (webm).
   - Add basic UI: "Record answer" / "Stop" buttons, a recording indicator, and a
     preview/playback before submit (candidates will want to re-record).
   - On submit, send the Blob via `multipart/form-data` to
     `/interview/:sessionId/respond` — the route already accepts `video`/`audio`
     fields via multer, just unused until now.
2. Backend (`interview.controller.js`):
   - Read `req.files` (currently ignored) and forward the audio file to
     `ai-services` for transcription instead of expecting `transcript` in the body.
3. AI service (`ai-services/main.py`):
   - Add `faster-whisper` to `requirements.txt`.
   - Add a transcription step: given the uploaded audio, run Whisper (start with
     the `base` or `small` model for free-tier CPU speed), return the transcript.
   - Call this from `/analyze` (or a separate `/transcribe` endpoint called first
     by the backend, then `/analyze` with the resulting transcript — cleaner
     separation, pick this).
4. Keep the typed-answer path working behind a feature flag or as a fallback for
   local dev without a webcam — don't delete it outright until capture is proven
   reliable.

**Verify:** Record a real spoken answer, confirm the returned transcript
reasonably matches what was said, confirm NLP scoring still works on the
transcribed text.

---

## Task 4 — Replace facial/speech placeholders with real models

**Problem:** `score_facial_placeholder()` and `score_speech_placeholder()` in
`ai-services/main.py` both hardcode `65`.

**Steps:**
1. Facial: implement `score_facial_placeholder()` using MediaPipe Face Mesh
   (landmarks → eye-contact estimation via gaze/head-pose) + DeepFace (emotion
   classification on sampled frames from the submitted video). Add `mediapipe`
   and `deepface` to `requirements.txt`.
2. Speech: implement `score_speech_placeholder()` using `librosa` (already a
   dependency) — extract MFCCs, pitch variance, energy, speaking rate — and either
   (a) a simple heuristic scoring function to start, or (b) a small trained
   CNN/LSTM on RAVDESS/CREMA-D if time allows (this is a heavier lift — do the
   heuristic version first, upgrade later if time permits).
3. Rename both functions once they're real (drop `_placeholder` suffix) and update
   the README's status table accordingly.

**Verify:** Compare scores across a clearly confident/expressive sample answer vs.
a flat/monotone one — the flat one should score lower on speech; a sample with poor
eye contact should score lower on facial.

---

## Task 5 — Session history dashboard

**Problem:** No way to see score trends across multiple sessions.

**Steps:**
1. Backend: add `GET /api/interview/history` (auth required) returning the current
   user's completed sessions (`overallScore`, `domain`/`targetRole`, `createdAt`,
   per-dimension averages).
2. Frontend: new page `Dashboard` section or a new route `/history` — simple line/
   radar chart (Recharts) of `overallScore` over time, plus per-dimension averages
   (facial/speech/NLP) to show which area is improving or stagnant.

**Verify:** Complete 2+ sessions, confirm the history page shows both with correct
scores.

---

## Do NOT do yet (explicitly out of scope for this pass)

- Don't build TTS / spoken questions until Tasks 1–3 are solid — it's polish, not
  core function.
- Don't train a custom CNN/LSTM for speech emotion until the heuristic version in
  Task 4 is working end-to-end — a trained model with no working pipeline around
  it is wasted effort.
- Don't add multi-language support — out of scope per your architecture doc's
  future-work section.

## While you're in each file, also fix

- `ai-services/main.py`: `score_nlp()`'s docstring claims it compares the answer to
  "an ideal-answer keyword set" — the code actually does question-vs-answer
  similarity. Either fix the comment or change the code to compare against the
  parsed resume/JD content from Task 2 (recommended — it's a more meaningful
  relevance signal once resume/JD data exists).
- `backend/src/controllers/interview.controller.js`: `MAX_QUESTIONS = 5` is
  hardcoded — once Task 2 lands, scale question count by experience level
  (e.g. fresher: 5, experienced: 7-8 with more system-design depth).
