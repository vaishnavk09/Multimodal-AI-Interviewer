# Multimodal AI Interviewer — Project Plan

**Status as of:** commit `7cf491a` ("feat: add interview recording and transcription")
**Supersedes:** `NEXT_STEPS.md` (Tasks 1 and 2 from that file are now done — see status table below)

This file is the single source of truth for: what's built, what's broken, what's
left, how any contributor (human or coding agent) should work in this repo, and
how to split remaining work across a team. Re-read Section 3 before every coding
session — it doesn't change often. Re-read Section 1 and 4 every time, since they
change as work lands.

---

## 1. Current Implementation Status

| # | Feature | Status | Where |
|---|---|---|---|
| 1 | Auth (signup/login, JWT) | ✅ Done | `backend/src/controllers/auth.controller.js` |
| 2 | Resume upload + parsing (regex-based skills/projects/years) | ✅ Done | `ai-services/main.py: parse_resume`, `interview.controller.js: uploadResume` |
| 3 | Role/experience/JD intake on frontend | ✅ Done | `frontend/src/pages/Dashboard.jsx` |
| 4 | Conversational agent with full history + follow-up logic | ✅ Done | `backend/src/services/llmService.js` |
| 5 | Follow-up depth capping | ⚠️ Works, but not precise (see §2, item B) | `interview.controller.js: submitResponse` |
| 6 | Audio/video capture (MediaRecorder) + typed fallback | ✅ Done | `frontend/src/pages/Interview.jsx` |
| 7 | Speech-to-text (faster-whisper) | ✅ Done | `ai-services/main.py: /transcribe` |
| 8 | NLP scoring (semantic similarity + VADER sentiment) | 🔴 **Broken — crashes** | `ai-services/main.py: score_nlp` (see §2, item A) |
| 9 | Facial expression scoring | ⬜ Placeholder (hardcoded 65) | `ai-services/main.py: score_facial_placeholder` |
| 10 | Speech emotion/prosody scoring | ⬜ Placeholder (hardcoded 65) | `ai-services/main.py: score_speech_placeholder` |
| 11 | Score fusion + weakest-area guidance | ✅ Done (works once #8 is fixed) | `interview.controller.js: submitResponse, buildGuidance` |
| 12 | Session history dashboard / score trends | ⬜ Not started | — |
| 13 | Pre-interview mic/camera check | ⬜ Not started | — |
| 14 | README reflects actual current features | ⚠️ Stale — missing resume/role/JD intake | `README.md` |

**Read before writing any code:** items marked ✅ are genuinely solid — don't
rewrite them speculatively. Item 8 is the one thing that must be fixed before
anything else, because it silently breaks every interview session end-to-end
right now (see below).

---

## 2. 🔴 Critical Bugs — Fix These First

### A. `/analyze` crashes on every call (blocking bug)

**File:** `ai-services/main.py`

`score_nlp()` (line ~185) calls `embedder.encode(...)` and
`sentiment_analyzer.polarity_scores(...)`, but those names don't exist anymore.
The lazy-loading refactor introduced `get_embedder()` and
`get_sentiment_analyzer()` (with underscore-prefixed globals `_embedder` /
`_sentiment_analyzer`), but `score_nlp()` was never updated to call them. Every
call to `/analyze` currently raises a `NameError`.

Because `interview.controller.js` wraps the `/analyze` call in a try/catch and
silently falls back to `{facialScore: 60, speechScore: 60, nlpScore: 60}`, **this
bug is invisible in the UI** — the app appears to work, but every single answer
gets a flat placeholder score of 60 instead of the real relevance/sentiment
score. This defeats the one piece of genuinely-implemented scoring you have.

**Fix:**
```python
def score_nlp(question: str, transcript: str) -> tuple[int, str]:
    if not transcript.strip():
        return 0, "No answer was recorded — remember to speak clearly into the microphone."

    embedder = get_embedder()
    sentiment_analyzer = get_sentiment_analyzer()

    q_emb = embedder.encode(question, convert_to_tensor=True)
    a_emb = embedder.encode(transcript, convert_to_tensor=True)
    ...
```
Just call the getter functions at the top of `score_nlp()` instead of referencing
the old bare names.

**Verify:** call `POST /analyze` directly (curl or the FastAPI `/docs` page) with
a real question+transcript and confirm it returns a varying score, not a crash
and not a flat fallback. Then run a full session end-to-end and confirm
`nlpScore` in the response actually changes based on answer quality (give one
excellent answer and one nonsense answer in the same session, scores should
differ noticeably).

### B. Follow-up depth counter doesn't track actual follow-ups

**File:** `backend/src/controllers/interview.controller.js`, `submitResponse`

`session.followUpCount` is incremented on every single turn unconditionally, and
reset every 3rd turn — it doesn't actually know whether the LLM's last question
was a follow-up or a new topic (that decision happens inside free-text prompting
with no structured signal returned). In practice this just forces a topic change
every 3rd question regardless of what actually happened, which is a reasonable
approximation but not what it looks like it's doing.

**Fix (do this after Task 1 in §4, not urgently — it's not broken, just imprecise):**
Change `generateQuestion`'s expected LLM output from freeform question text to
structured JSON: `{"type": "follow_up" | "new_topic", "question": "..."}`. Parse
`type` in `llmService.js`, return it alongside the question, and increment
`followUpCount` in the controller only when `type === "follow_up"`, reset to 0
otherwise. Update the fallback bank to just always return `type: "new_topic"`.

**Verify:** log the returned `type` for each turn in a full session and confirm
the count only goes up on genuine follow-ups.

---

## 3. Agent / Contributor Working Rules

Read this section before starting work in this repo, every session.

1. **Never remove a fallback path.** Every external call (Gemini, faster-whisper,
   the `/analyze` service) has a try/catch with a graceful degradation. This is
   intentional — the app must never hard-crash during a live demo. If you touch
   one of these call sites, keep the fallback, don't just propagate the error.
2. **Service boundaries are deliberate**: Node/Express owns auth, sessions, and
   orchestration; Python/FastAPI owns anything ML/NLP (embeddings, sentiment,
   ASR, resume parsing, future facial/speech models). Don't reimplement ML logic
   in Node, and don't put session/auth logic in the Python service.
3. **Don't hand-roll what a library already does well.** e.g. resume parsing
   currently uses a regex skill-list — if replacing it, prefer a proper NER-based
   resume parser over a bigger regex list.
4. **Every task must end with a manual verification step**, not just "code
   compiles." Each task below states what to check. Do that check before moving
   to the next task.
5. **Update `README.md`'s status table and "what's not built yet" list** as part
   of the same commit that finishes a task — it's currently the most reliable doc
   in the repo, keep it that way.
6. **Don't add a feature not listed in §4** without adding it to this file first.
   Scope creep here means Phase-II review time gets eaten by half-finished extras
   instead of a working core loop.
7. **Never commit `.env` files or API keys.** `.env.example` only.

---

## 4. Remaining Work — Ordered Task List

Do these in order. Later tasks depend on earlier ones.

### Task 1 — Fix `/analyze` (see §2.A)
Already fully specified above. Do this before anything else — it's a one-line
fix with an outsized impact (every score in the app is currently fake).

### Task 2 — Real facial expression scoring
**Replaces:** `score_facial_placeholder()` in `ai-services/main.py`

1. Add `mediapipe` and `deepface` to `ai-services/requirements.txt`.
2. Extend `/analyze` to accept the answer's video file (currently it only
   receives `question` + `transcript` as JSON — you'll need to change this
   endpoint to accept multipart form data with the video attached, similar to
   `/transcribe`). Update `interview.controller.js`'s call to `/analyze`
   accordingly — forward the same media file it already has in `req.files`.
3. Implementation:
   - Sample ~1 frame/second from the video (OpenCV `VideoCapture`).
   - Run MediaPipe Face Mesh per sampled frame → estimate eye-contact (is gaze
     roughly centered/forward) and head stability.
   - Run DeepFace emotion classification per sampled frame → aggregate emotion
     distribution across the answer.
   - Combine into a single 0–100 score: e.g. `0.5 * eye_contact_pct + 0.5 *
     positive_engaged_emotion_pct` — pick a formula, document it in a comment,
     you'll need to justify this weighting in your report.
4. Rename the function (drop `_placeholder`) once real, update README status
   table.

**Verify:** record one answer maintaining eye contact with a neutral/positive
expression, and one deliberately looking away/frowning — confirm the scores
differ in the expected direction.

### Task 3 — Real speech/prosody scoring
**Replaces:** `score_speech_placeholder()` in `ai-services/main.py`

1. `librosa` is already a dependency.
2. Using the same audio file now available in `/analyze` (from Task 2's endpoint
   change), extract: pitch variance, energy/RMS, speaking rate (words per
   minute, using the Whisper transcript's word count / audio duration), and
   pause count (silence gaps > ~0.5s).
3. Start with a **heuristic** scoring function (e.g. moderate pitch variance +
   steady energy + 120–160 WPM = higher score) rather than training a model —
   document the thresholds you pick.
4. Only attempt a trained CNN/LSTM (e.g. on RAVDESS/CREMA-D) if time remains
   after everything else in this file is done — it's a stretch goal, not core.

**Verify:** compare a flat/monotone slowly-spoken sample vs. an animated,
well-paced one — confirm the score differs in the expected direction.

### Task 4 — Structured follow-up tracking (see §2.B)
Already fully specified above. Do this once Tasks 2–3 are stable — it's a
precision improvement, not a functional blocker.

### Task 5 — Session history dashboard
1. Backend: `GET /api/interview/history` (auth required) → the current user's
   completed sessions with `overallScore`, `targetRole`, `createdAt`, and
   per-dimension averages (facial/speech/NLP) computed from `session.responses`.
2. Frontend: new route/page with a Recharts line chart (`overallScore` over
   time) and a radar chart (latest session's Confidence/Clarity/Content/Body-
   language breakdown vs. an earlier session, if ≥2 sessions exist).

**Verify:** complete 2+ sessions with different scores, confirm both chart types
render correctly and match the stored data.

### Task 6 — Pre-interview environment check
1. Frontend: before starting a session, request camera/mic permission and show
   a live preview + a "we can hear/see you" confirmation, instead of discovering
   capture problems mid-interview (current `captureError` message in
   `Interview.jsx` only surfaces after a failed `getUserMedia` call during the
   interview itself).

**Verify:** deny camera permission deliberately, confirm the check catches it
before the interview starts rather than silently falling back mid-session.

### Task 7 — README accuracy pass
Update the stack table and status list to include resume/role/JD intake and the
conversational follow-up logic (both currently undocumented), and correct the
"what's not built yet" list to match this file's Section 1.

---

## 5. Team Split

Assuming a 3–4 person team. Compress tracks if the team is smaller; the
dependency order below still applies regardless of headcount.

### Track A — Backend & Conversational Agent
**Owns:** `backend/src/services/llmService.js`, `interview.controller.js`,
`models/Session.js`, `models/User.js`
**Tasks:** §4 Task 4 (structured follow-up tracking), any prompt-quality
iteration on question generation, session/auth model changes needed by other
tracks.

### Track B — AI/ML Services
**Owns:** `ai-services/main.py`, `ai-services/requirements.txt`
**Tasks:** §4 Tasks 1, 2, 3 (the critical bug fix, facial scoring, speech
scoring) — **this track should start immediately**, the other tracks aren't
blocked by it but the project's actual scoring quality depends entirely on it.

### Track C — Frontend & UX
**Owns:** `frontend/src/pages/*`
**Tasks:** §4 Tasks 5, 6 (history dashboard, environment check), plus UI polish
(loading states, error messaging) as Tracks A/B's endpoints stabilize.

### Track D — Integration, Docs, Deployment
**Owns:** `docker-compose.yml`, `README.md`, cross-service testing
**Tasks:** §4 Task 7 (README pass), end-to-end testing of every task above
before it's considered "done" (don't trust a single dev's "works on my machine"
— re-run each Task's Verify step independently), Docker Compose validation after
new dependencies are added (Tasks 2–3 add heavy ML libs — confirm the
`ai-services` image still builds and runs within reasonable memory limits).

### Sync Points
- **After Task 1 lands (Track B):** everyone re-tests their own feature, since
  every score in the app was silently fake until now — assumptions made against
  flat-60 scores may need re-checking.
- **Before Task 2/3 start (Track B):** confirm the `/analyze` endpoint's request
  format change (JSON → multipart with media) with Track A, since Track A owns
  the code that calls it.
- **Weekly:** short check-in — one paragraph per track: what shipped, what's
  blocked, does anyone need another track's endpoint before it's ready.

---

## 6. Definition of Done (Phase-II Review Checklist)

Before calling this "ready for review," confirm:
- [ ] `/analyze` returns real, varying NLP scores (Task 1)
- [ ] Facial and speech scores are real, not hardcoded 65s (Tasks 2–3)
- [ ] A full interview (intro → follow-ups → new topics → close) demonstrates
      at least one visible adaptive follow-up tied to something specific the
      candidate said
- [ ] Session history shows at least 2 completed sessions with a visible score
      trend
- [ ] README accurately describes every implemented feature (Task 7)
- [ ] A cold `docker compose up --build` on a clean machine works end-to-end
      with no manual fixes
