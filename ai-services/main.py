import io
import os
import re
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
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
def analyze(req: AnalyzeRequest):
    nlp_score, nlp_feedback = score_nlp(req.question, req.transcript)
    facial_score = score_facial_placeholder()
    speech_score = score_speech_placeholder()

    feedback_parts = [nlp_feedback]
    if facial_score < 60:
        feedback_parts.append("Try to maintain steadier eye contact and a relaxed expression.")
    if speech_score < 60:
        feedback_parts.append("Slow down slightly and reduce filler words for clearer delivery.")

    return AnalyzeResponse(
        facialScore=facial_score,
        speechScore=speech_score,
        nlpScore=nlp_score,
        feedback=" ".join(feedback_parts),
    )


def score_nlp(question: str, transcript: str) -> tuple[int, str]:
    """
    NLP scoring: calculates semantic similarity between question and candidate transcript,
    plus VADER sentiment compound score for overall tone alignment.
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

    final = max(0, min(100, relevance_score + tone_adjustment))
    feedback = (
        "Your answer was highly relevant to the question."
        if final >= 75
        else "Try to tie your answer more directly back to the question asked."
    )
    return round(final), feedback


def score_facial_placeholder() -> int:
    # TODO: replace with MediaPipe face landmarks + DeepFace emotion classification
    return 65


def score_speech_placeholder() -> int:
    # TODO: replace with Librosa MFCC extraction + CNN/LSTM emotion classifier
    return 65
