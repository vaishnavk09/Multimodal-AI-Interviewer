# Multimodal AI Interviewer

An integrated mock-interview platform combining facial expression analysis, speech
emotion recognition, and NLP-based answer evaluation into sentiment-aware feedback
and a personalized preparation plan.

## Stack (all free-tier)

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | MongoDB (local Docker for dev, Atlas free tier for deployment) |
| Auth | JWT |
| Question generation | Gemini 2.5 Flash (free tier) |
| NLP / sentiment | Sentence-Transformers (MiniLM) + VADER — **implemented** |
| Facial emotion | MediaPipe + DeepFace — **placeholder, TODO** |
| Speech emotion | Librosa (MFCC) + CNN/LSTM — **placeholder, TODO** |
| AI microservice | Python + FastAPI |

## Project status (Phase 1)

What's working end-to-end right now:
- Signup/login with JWT
- Start an interview session, get an LLM-generated question (falls back to a
  static question bank if `GEMINI_API_KEY` isn't set, so it never breaks)
- Submit a typed or recorded audio/video answer; recorded answers are transcribed
  with faster-whisper when the AI service is configured
- Get a **real** NLP relevance/sentiment score for the submitted answer
- Fused score + a simple rule-based "weakest area" guidance message
- Facial and speech scores are currently **hardcoded placeholders** (65) — see
  `ai-services/main.py` for exactly where to plug in the real models

What's NOT built yet (next steps, roughly in priority order):
1. Implement `score_facial_placeholder()` with MediaPipe + DeepFace
2. Implement `score_speech_placeholder()` with Librosa MFCC + a heuristic, then a trained CNN/LSTM
3. Add a pre-interview environment check (camera/mic/connection test)
4. Add a session history dashboard (charts of score trends across sessions)

## Getting started (local dev, no Docker)

### 1. Backend
```bash
cd backend
cp .env.example .env      # then fill in GEMINI_API_KEY (optional) and JWT_SECRET
npm install
npm run dev               # runs on http://localhost:5000
```
Requires a local MongoDB running on `mongodb://localhost:27017` (or update `MONGO_URI`
in `.env` to point at a MongoDB Atlas free-tier cluster).

### 2. AI service
```bash
cd ai-services
python -m venv venv && source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                # runs on http://localhost:5173
```

## Getting started (Docker Compose — everything at once)
```bash
cp backend/.env.example backend/.env   # fill in secrets
docker compose up --build
```
- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- AI service: http://localhost:8000

## Getting a free Gemini API key
1. Go to https://aistudio.google.com/
2. Sign in with a Google account, create an API key (no billing needed for the free tier)
3. Put it in `backend/.env` as `GEMINI_API_KEY=...`
4. Free tier covers Gemini 2.5/3 Flash and Flash-Lite (Pro is paid-only as of 2026) —
   this project uses `gemini-2.5-flash`, well within free quota for a demo.

## Folder structure
```
backend/         Node/Express API, MongoDB models, JWT auth, Gemini integration
frontend/        React + Vite + Tailwind UI
ai-services/     Python FastAPI microservice for NLP/facial/speech analysis
docker-compose.yml
```
