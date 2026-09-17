# Multimodal AI Interviewer

An integrated mock-interview platform combining real-time facial expression & gaze tracking, speech prosody analysis, and NLP-based semantic relevance scoring into intelligent, adaptive interview practice.

---

## Technical Architecture & Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + Recharts |
| Backend API | Node.js + Express + MongoDB (Mongoose) |
| Auth & Security | JWT authentication + bcryptjs |
| Question Generation | Gemini 2.5 Flash (structured follow-up & adaptive depth) |
| Speech-to-Text | faster-whisper (local int8 compute model) |
| NLP & Sentiment | Sentence-Transformers (all-MiniLM-L6-v2) + VADER Sentiment |
| Facial Expression Analysis | OpenCV + MediaPipe Face Mesh (eye contact & pose stability) |
| Speech & Vocal Dynamics | Librosa (pitch variance, WPM speaking rate, pause ratios) |
| AI Microservice | Python 3 + FastAPI + Uvicorn |

---

## Fully Implemented Features

- **JWT Authentication:** Secure user signup and login.
- **Resume Upload & Parsing:** Automated PDF and DOCX parsing extracting skills, projects, and years of experience.
- **Tailored Question Intake:** Role, domain, experience level, and job description intake.
- **Structured Follow-up Tracking:** Gemini 2.5 Flash LLM adaptive follow-up loop (probing deeper into answers vs. switching topics).
- **Multimodal AI Answer Analysis:**
  - **NLP Relevance & Sentiment:** Cosine similarity against question + VADER tone scoring.
  - **Facial Analysis:** MediaPipe Face Mesh tracking gaze center alignment, face visibility, and head stability.
  - **Speech Prosody:** Librosa audio feature extraction analyzing WPM pace (120–170 target), pitch variance dynamics, and silence pause ratios.
- **Pre-Interview Environment Check:** System check for camera preview and microphone responsiveness before session start.
- **Analytics & History Dashboard:** Interactive Recharts time-series progression line chart and 3D dimension breakdown (Facial/Speech/NLP) across past completed sessions.

---

## Getting Started (Local Development)

### 1. Backend Service
```bash
cd backend
cp .env.example .env      # Fill in GEMINI_API_KEY (optional) and JWT_SECRET
npm install
npm run dev               # runs on http://localhost:5000
```

### 2. AI Microservice
```bash
cd ai-services
python -m venv .venv
# On Windows:
.\.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend Application
```bash
cd frontend
npm install
npm run dev                # runs on http://localhost:5173
```

---

## Getting Started (Docker Compose)
```bash
cp backend/.env.example backend/.env   # fill in secrets
docker compose up --build
```
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000
- **AI Microservice:** http://localhost:8000

---

## Gemini API Configuration
1. Obtain a free key from [Google AI Studio](https://aistudio.google.com/).
2. Add to `backend/.env` as `GEMINI_API_KEY=your_key_here`.
3. If no key is set, the system gracefully falls back to structured domain question banks.
