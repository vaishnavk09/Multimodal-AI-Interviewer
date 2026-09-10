"""
AI microservice for the Multimodal AI Interviewer.

Phase-1 scope:
- NLP scoring is REAL: Sentence-BERT similarity (answer vs. an ideal-answer
  keyword set) + VADER sentiment, combined into a 0-100 score.
- Facial and speech scoring are PLACEHOLDER stubs for now — swap these
  functions for the MediaPipe/DeepFace and Librosa/CNN pipelines once the
  video/audio capture pipeline is wired up on the frontend.
"""

from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, util
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

app = FastAPI(title="Multimodal AI Interviewer - Analysis Service")

# Loaded once at startup — small, free, open-source model (~80MB).
embedder = SentenceTransformer("all-MiniLM-L6-v2")
sentiment_analyzer = SentimentIntensityAnalyzer()


class AnalyzeRequest(BaseModel):
    question: str
    transcript: str


class AnalyzeResponse(BaseModel):
    facialScore: int
    speechScore: int
    nlpScore: int
    feedback: str


@app.get("/health")
def health():
    return {"status": "ok"}


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
    if not transcript.strip():
        return 0, "No answer was recorded — remember to speak clearly into the microphone."

    # Relevance: semantic similarity between question and answer.
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
