import io
import os
import re
import tempfile
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, util
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import pypdf
import docx

_whisper_model = None

app = FastAPI(title="Multimodal AI Interviewer - Analysis Service")

_embedder = None
_sentiment_analyzer = None


def get_embedder():
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedder


def get_sentiment_analyzer():
    global _sentiment_analyzer
    if _sentiment_analyzer is None:
        _sentiment_analyzer = SentimentIntensityAnalyzer()
    return _sentiment_analyzer


class AnalyzeRequest(BaseModel):
    question: str
    transcript: str


class AnalyzeResponse(BaseModel):
    facialScore: int
    speechScore: int
    nlpScore: int
    feedback: str


class ParseResumeResponse(BaseModel):
    skills: list[str]
    projects: list[str]
    yearsExperience: float
    rawText: str


class TranscribeResponse(BaseModel):
    transcript: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse-resume", response_model=ParseResumeResponse)
async def parse_resume(file: UploadFile = File(...)):
    filename = (file.filename or "").lower()
    content = await file.read()
    raw_text = ""

    if filename.endswith(".pdf"):
        try:
            reader = pypdf.PdfReader(io.BytesIO(content))
            raw_text = "\n".join([page.extract_text() or "" for page in reader.pages])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse PDF resume: {str(e)}")
    elif filename.endswith(".docx") or filename.endswith(".doc"):
        try:
            doc = docx.Document(io.BytesIO(content))
            raw_text = "\n".join([p.text for p in doc.paragraphs if p.text])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse DOCX resume: {str(e)}")
    else:
        try:
            raw_text = content.decode("utf-8", errors="ignore")
        except Exception:
            raw_text = ""

    parsed = extract_resume_info(raw_text)
    return ParseResumeResponse(
        skills=parsed["skills"],
        projects=parsed["projects"],
        yearsExperience=parsed["yearsExperience"],
        rawText=raw_text[:4000],
    )


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(file: UploadFile = File(...)):
    global _whisper_model
    try:
        from faster_whisper import WhisperModel

        if _whisper_model is None:
            _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        content = await file.read()
        safe_name = re.sub(r"[^a-zA-Z0-9.]", "-", file.filename or "answer.webm")
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"interview-{safe_name}")
        with open(temp_path, "wb") as output:
            output.write(content)
        try:
            segments, _ = _whisper_model.transcribe(temp_path)
            transcript = " ".join(segment.text.strip() for segment in segments).strip()
            return TranscribeResponse(transcript=transcript)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    except ImportError:
        raise HTTPException(status_code=503, detail="faster-whisper is not installed")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to transcribe recording: {str(e)}")


def extract_resume_info(text: str) -> dict:
    common_skills = [
        "python", "javascript", "typescript", "react", "node", "express", "mongodb",
        "sql", "postgresql", "docker", "kubernetes", "aws", "azure", "gcp", "git",
        "java", "c++", "c#", "go", "rust", "html", "css", "tailwind", "fastapi",
        "django", "flask", "pytorch", "tensorflow", "pandas", "numpy", "scikit-learn"
    ]

    found_skills = []
    text_lower = text.lower()
    for skill in common_skills:
        if re.search(r"\b" + re.escape(skill) + r"\b", text_lower):
            found_skills.append(skill.upper() if len(skill) <= 3 else skill.title())

    projects = []
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    in_project_section = False
    for line in lines:
        if re.search(r"\b(project|projects)\b", line, re.IGNORECASE):
            in_project_section = True
            continue
        if in_project_section and re.search(r"\b(education|experience|work|skills|certifications)\b", line, re.IGNORECASE):
            in_project_section = False

        if in_project_section and 5 < len(line) < 100:
            clean_line = line.lstrip("-*• 0123456789.").strip()
            if clean_line:
                projects.append(clean_line)

    years = 0.0
    year_matches = re.findall(r"(\d+)\+?\s*(?:year|yrs|yr)", text_lower)
    if year_matches:
        years = float(max([int(y) for y in year_matches if int(y) < 40] or [0]))

    return {
        "skills": list(set(found_skills)),
        "projects": projects[:5],
        "yearsExperience": years,
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    question: str = Form(...),
    transcript: str = Form(...),
    experience_level: str = Form("Fresher"),
    file: UploadFile = File(None)
):
    temp_path = None
    if file:
        try:
            content = await file.read()
            safe_name = re.sub(r"[^a-zA-Z0-9.]", "-", file.filename or "recording.webm")
            temp_dir = tempfile.gettempdir()
            temp_path = os.path.join(temp_dir, f"analyze-{safe_name}")
            with open(temp_path, "wb") as output:
                output.write(content)
        except Exception as e:
            print(f"[ai-services] Failed to save media for analyze: {e}")

    try:
        nlp_score, nlp_feedback = score_nlp(question, transcript, experience_level)
        facial_score = score_facial(temp_path) if temp_path else score_facial_placeholder()
        speech_score = score_speech(temp_path, transcript) if temp_path else score_speech_placeholder()

        feedback_parts = [nlp_feedback]
        if facial_score < 60:
            feedback_parts.append("Try to maintain steadier eye contact and a relaxed expression.")
        if speech_score < 60:
            feedback_parts.append("Slow down slightly and reduce filler words for clearer delivery.")

        print(f"[analyze] experience={experience_level} | nlp={nlp_score} | facial={facial_score} | speech={speech_score}")
        return AnalyzeResponse(
            facialScore=facial_score,
            speechScore=speech_score,
            nlpScore=nlp_score,
            feedback=" ".join(feedback_parts),
        )
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


def score_nlp(question: str, transcript: str, experience_level: str = "Fresher") -> tuple[int, str]:
    """
    NLP scoring: calculates semantic similarity between question and candidate transcript,
    plus VADER sentiment compound score for overall tone alignment.
    Applies adaptive difficulty scaling based on experience level:
      - Fresher:  base score (no penalty)
      - 1-3 yrs:  -8 point senior bar
      - 3+ yrs:   -15 point senior bar (expected depth / precision)
    Also rewards answer depth (word count) up to +10 points.
    """
    if not transcript.strip():
        return 0, "No answer was recorded — remember to speak clearly into the microphone."

    # Relevance: semantic similarity between question and answer.
    embedder = get_embedder()
    sentiment_analyzer = get_sentiment_analyzer()
    q_emb = embedder.encode(question, convert_to_tensor=True)
    a_emb = embedder.encode(transcript, convert_to_tensor=True)
    relevance = float(util.cos_sim(q_emb, a_emb)[0][0])  # roughly -1..1
    relevance_score = max(0, min(100, (relevance + 0.2) / 0.8 * 100))

    # Tone: VADER sentiment compound score, mapped to a mild bonus/penalty.
    compound = sentiment_analyzer.polarity_scores(transcript)["compound"]  # -1..1
    tone_adjustment = compound * 10  # small nudge, content relevance dominates

    # Depth bonus: reward well-developed answers (up to +10 pts for 80+ words)
    word_count = len(transcript.split())
    depth_bonus = min(10, (word_count / 80) * 10)

    raw_score = relevance_score + tone_adjustment + depth_bonus

    # Experience-level difficulty scaling: senior candidates are held to a higher bar
    difficulty_penalty = 0
    if experience_level == "1-3 yrs":
        difficulty_penalty = 8
    elif experience_level == "3+ yrs":
        difficulty_penalty = 15

    final = max(0, min(100, raw_score - difficulty_penalty))

    if final >= 75:
        feedback = "Strong answer — well-structured and directly relevant to the question."
    elif final >= 50:
        feedback = "Decent answer. Try to add more specific examples or technical depth."
    else:
        feedback = "Try to tie your answer more directly back to the question asked and include concrete examples."

    return round(final), feedback


def score_facial(media_path: str) -> int:
    """
    Analyzes face landmarks, eye contact ratio, and pose stability across sampled video frames.
    Returns a score 0..100.
    """
    if not media_path or not os.path.exists(media_path):
        return 65

    try:
        import cv2
        import mediapipe as mp

        cap = cv2.VideoCapture(media_path)
        if not cap.isOpened():
            return 65

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = int(cap.get(cv2.CAP_PROP_FPS) or 30)
        if total_frames <= 0 or fps <= 0:
            cap.release()
            return 65

        sample_step = max(1, fps)
        mp_face_mesh = mp.solutions.face_mesh
        face_mesh = mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5
        )

        eye_contact_count = 0
        face_detected_count = 0
        total_sampled = 0
        nose_positions = []

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % sample_step == 0:
                total_sampled += 1
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = face_mesh.process(rgb_frame)

                if results.multi_face_landmarks:
                    face_detected_count += 1
                    landmarks = results.multi_face_landmarks[0].landmark
                    nose = landmarks[1]
                    nose_positions.append((nose.x, nose.y))

                    if 0.35 <= nose.x <= 0.65 and 0.30 <= nose.y <= 0.70:
                        eye_contact_count += 1
            frame_idx += 1

        cap.release()
        face_mesh.close()

        if total_sampled == 0:
            return 65

        visibility_ratio = face_detected_count / total_sampled
        eye_contact_ratio = (eye_contact_count / face_detected_count) if face_detected_count > 0 else 0

        stability_score = 1.0
        if len(nose_positions) > 1:
            import numpy as np
            var_x = float(np.var([p[0] for p in nose_positions]))
            var_y = float(np.var([p[1] for p in nose_positions]))
            total_var = var_x + var_y
            stability_score = max(0.0, 1.0 - min(1.0, total_var * 50))

        final_score = (0.5 * eye_contact_ratio + 0.3 * visibility_ratio + 0.2 * stability_score) * 100
        return int(max(30, min(100, round(final_score))))
    except Exception as e:
        print(f"[ai-services] score_facial failed, fallback to 65: {e}")
        return 65


def score_speech(media_path: str, transcript: str) -> int:
    """
    Analyzes audio pitch dynamics, energy, speaking rate (WPM), and silence pauses.
    Returns a score 0..100.
    """
    if not media_path or not os.path.exists(media_path):
        return 65

    try:
        import librosa
        import numpy as np

        y, sr = librosa.load(media_path, sr=None)
        duration = float(len(y) / sr) if sr and len(y) > 0 else 0
        if duration < 0.5:
            return 65

        word_count = len((transcript or "").split())
        wpm = (word_count / duration) * 60.0 if duration > 0 else 0

        wpm_score = 70
        if 120 <= wpm <= 170:
            wpm_score = 95
        elif 90 <= wpm < 120 or 170 < wpm <= 200:
            wpm_score = 80
        elif 60 <= wpm < 90 or 200 < wpm <= 240:
            wpm_score = 65
        else:
            wpm_score = 50

        pitch_score = 70
        try:
            pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
            pitch_values = pitches[magnitudes > np.median(magnitudes)]
            valid_pitches = pitch_values[(pitch_values > 60) & (pitch_values < 400)]
            if len(valid_pitches) > 10:
                pitch_std = float(np.std(valid_pitches))
                if 15 <= pitch_std <= 60:
                    pitch_score = 90
                elif 8 <= pitch_std < 15 or 60 < pitch_std <= 80:
                    pitch_score = 75
                else:
                    pitch_score = 60
        except Exception:
            pass

        pause_score = 70
        try:
            intervals = librosa.effects.split(y, top_db=30)
            voiced_duration = sum((end - start) for start, end in intervals) / sr
            pause_ratio = (duration - voiced_duration) / duration if duration > 0 else 0
            if 0.08 <= pause_ratio <= 0.30:
                pause_score = 90
            elif 0.02 <= pause_ratio < 0.08 or 0.30 < pause_ratio <= 0.45:
                pause_score = 75
            else:
                pause_score = 60
        except Exception:
            pass

        final_score = 0.4 * wpm_score + 0.35 * pitch_score + 0.25 * pause_score
        return int(max(30, min(100, round(final_score))))
    except Exception as e:
        print(f"[ai-services] score_speech failed, fallback to 65: {e}")
        return 65


def score_facial_placeholder() -> int:
    return 65


def score_speech_placeholder() -> int:
    return 65

