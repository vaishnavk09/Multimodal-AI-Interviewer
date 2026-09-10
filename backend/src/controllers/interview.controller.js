import axios from "axios";
import Session from "../models/Session.js";
import { generateQuestion } from "../services/llmService.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

export async function startSession(req, res) {
  try {
    const { domain } = req.body;
    const session = await Session.create({
      user: req.userId,
      domain: domain || "General",
      responses: [],
    });

    const question = await generateQuestion(session.domain);
    session.responses.push({ question, transcript: "" });
    await session.save();

    res.status(201).json({ sessionId: session._id, question });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not start session" });
  }
}

/**
 * Accepts audio+video for the current question, forwards to the Python AI
 * service for facial/speech/NLP analysis, fuses the scores, stores the
 * result, and returns the next question (or final feedback if done).
 */
export async function submitResponse(req, res) {
  try {
    const { sessionId } = req.params;
    const { transcript } = req.body; // audio/video files handled via multer in route

    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const current = session.responses.at(-1);
    current.transcript = transcript || "";

    // Call the Python AI microservice for analysis.
    // In early dev, this endpoint can just return mock scores.
    let analysis = { facialScore: 60, speechScore: 60, nlpScore: 60 };
    try {
      const { data } = await axios.post(`${AI_SERVICE_URL}/analyze`, {
        question: current.question,
        transcript: current.transcript,
      });
      analysis = data;
    } catch (err) {
      console.warn("[interview] AI service unavailable, using placeholder scores");
    }

    const fusedScore = Math.round(
      0.5 * analysis.nlpScore + 0.25 * analysis.facialScore + 0.25 * analysis.speechScore
    );

    current.facialScore = analysis.facialScore;
    current.speechScore = analysis.speechScore;
    current.nlpScore = analysis.nlpScore;
    current.fusedScore = fusedScore;
    current.feedback = analysis.feedback || "Keep your answers structured and specific.";

    const MAX_QUESTIONS = 5;
    if (session.responses.length < MAX_QUESTIONS) {
      const nextQuestion = await generateQuestion(
        session.domain,
        session.responses.map((r) => r.fusedScore).filter((s) => s != null)
      );
      session.responses.push({ question: nextQuestion, transcript: "" });
      await session.save();
      return res.json({ done: false, nextQuestion, lastScore: fusedScore });
    }

    session.status = "completed";
    const scores = session.responses.map((r) => r.fusedScore).filter((s) => s != null);
    session.overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    session.guidance = buildGuidance(session);
    await session.save();

    res.json({ done: true, overallScore: session.overallScore, guidance: session.guidance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not process response" });
  }
}

// Simple rule-based placeholder for the "personalized guidance" module.
// Replace with a proper weak-area-detection model later.
function buildGuidance(session) {
  const avgFacial =
    session.responses.reduce((a, r) => a + (r.facialScore || 0), 0) / session.responses.length;
  const avgSpeech =
    session.responses.reduce((a, r) => a + (r.speechScore || 0), 0) / session.responses.length;
  const avgNlp =
    session.responses.reduce((a, r) => a + (r.nlpScore || 0), 0) / session.responses.length;

  const weakest = [
    ["facial expression / confidence", avgFacial],
    ["vocal tone and fluency", avgSpeech],
    ["answer content and relevance", avgNlp],
  ].sort((a, b) => a[1] - b[1])[0];

  return `Your weakest area this session was ${weakest[0]} (avg score ${Math.round(
    weakest[1]
  )}/100). Focus your next practice sessions there.`;
}

export async function getSession(req, res) {
  const session = await Session.findById(req.params.sessionId);
  if (!session) return res.status(404).json({ message: "Session not found" });
  res.json(session);
}
