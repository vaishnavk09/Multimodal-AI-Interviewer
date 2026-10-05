import fs from "fs";
import axios from "axios";
import Session from "../models/Session.js";
import User from "../models/User.js";
import { generateQuestion } from "../services/llmService.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

export async function uploadResume(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No resume file uploaded" });
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    const blob = new Blob([fileBuffer]);
    const formData = new FormData();
    formData.append("file", blob, req.file.originalname);

    let parsedResume = { skills: [], projects: [], yearsExperience: 0, rawText: "" };
    try {
      const { data } = await axios.post(`${AI_SERVICE_URL}/parse-resume`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      parsedResume = data;
    } catch (err) {
      console.warn("[interview] AI resume parsing service failed, using fallback:", err.message);
    } finally {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }

    const user = await User.findById(req.userId);
    if (user) {
      user.resume = {
        skills: parsedResume.skills || [],
        projects: parsedResume.projects || [],
        yearsExperience: parsedResume.yearsExperience || 0,
        rawText: parsedResume.rawText || "",
        updatedAt: new Date(),
      };
      await user.save();
    }

    res.json({ message: "Resume uploaded and parsed successfully", resume: user?.resume });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not upload and parse resume" });
  }
}

export async function startSession(req, res) {
  try {
    const { domain, targetRole, experienceLevel, jobDescription } = req.body;
    const user = await User.findById(req.userId);

    let maxQuestions = 5;
    if (experienceLevel === "1-3 yrs") maxQuestions = 6;
    else if (experienceLevel === "3+ yrs") maxQuestions = 8;

    const session = await Session.create({
      user: req.userId,
      domain: domain || user?.domain || "General",
      targetRole: targetRole || user?.targetRole || "",
      experienceLevel: experienceLevel || user?.experienceLevel || "Fresher",
      jobDescription: jobDescription || user?.jobDescription || "",
      maxQuestions,
      responses: [],
      followUpCount: 0,
    });

    if (user) {
      if (targetRole) user.targetRole = targetRole;
      if (experienceLevel) user.experienceLevel = experienceLevel;
      if (jobDescription) user.jobDescription = jobDescription;
      await user.save();
    }

    const candidateContext = {
      targetRole: session.targetRole,
      experienceLevel: session.experienceLevel,
      jobDescription: session.jobDescription,
      skills: user?.resume?.skills || [],
      projects: user?.resume?.projects || [],
      yearsExperience: user?.resume?.yearsExperience || 0,
    };

    const result = await generateQuestion(session.domain, session.responses, 0, candidateContext);
    console.log(`[llm] Question source: ${result.source || "llm"} | type: ${result.type} | q: "${result.question.slice(0, 60)}..."`);
    session.responses.push({ question: result.question, transcript: "" });
    await session.save();

    res.status(201).json({ sessionId: session._id, question: result.question, maxQuestions: session.maxQuestions });
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
    let { transcript } = req.body;

    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const user = await User.findById(session.user);
    const candidateContext = {
      targetRole: session.targetRole,
      experienceLevel: session.experienceLevel,
      jobDescription: session.jobDescription,
      skills: user?.resume?.skills || [],
      projects: user?.resume?.projects || [],
      yearsExperience: user?.resume?.yearsExperience || 0,
    };

    const current = session.responses.at(-1);
    const mediaFile = req.files?.audio?.[0] || req.files?.video?.[0];
    if (mediaFile) {
      try {
        const mediaBuffer = fs.readFileSync(mediaFile.path);
        const formData = new FormData();
        formData.append("file", new Blob([mediaBuffer]), mediaFile.originalname);
        const { data } = await axios.post(`${AI_SERVICE_URL}/transcribe`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
        });
        if (data.transcript && data.transcript.trim()) {
          if (!transcript || !transcript.trim()) {
            transcript = data.transcript;
          }
        }
      } catch (err) {
        console.warn("[interview] Audio transcription failed, using live/typed answer:", err.message);
      } finally {
        if (fs.existsSync(mediaFile.path)) fs.unlinkSync(mediaFile.path);
      }
    }
    current.transcript = transcript || "";

    // Call the Python AI microservice for analysis.
    let analysis = { facialScore: 60, speechScore: 60, nlpScore: 60 };
    try {
      const analyzeFormData = new FormData();
      analyzeFormData.append("question", current.question);
      analyzeFormData.append("transcript", current.transcript);
      if (mediaFile && fs.existsSync(mediaFile.path)) {
        const mediaBuffer = fs.readFileSync(mediaFile.path);
        analyzeFormData.append("file", new Blob([mediaBuffer]), mediaFile.originalname);
      }
      const { data } = await axios.post(`${AI_SERVICE_URL}/analyze`, analyzeFormData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      analysis = data;
    } catch (err) {
      console.warn("[interview] AI service analysis call failed, using placeholder scores:", err.message);
    }

    const fusedScore = Math.round(
      0.5 * analysis.nlpScore + 0.25 * analysis.facialScore + 0.25 * analysis.speechScore
    );

    current.facialScore = analysis.facialScore;
    current.speechScore = analysis.speechScore;
    current.nlpScore = analysis.nlpScore;
    current.fusedScore = fusedScore;
    current.feedback = analysis.feedback || "Keep your answers structured and specific.";

    const maxQuestions = session.maxQuestions || 5;
    if (session.responses.length < maxQuestions) {
      const currentFollowUp = session.followUpCount || 0;
      const { question: nextQuestion, type: questionType } = await generateQuestion(
        session.domain,
        session.responses,
        currentFollowUp,
        candidateContext
      );

      if (questionType === "follow_up") {
        session.followUpCount = currentFollowUp + 1;
      } else {
        session.followUpCount = 0;
      }

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

export async function getUserHistory(req, res) {
  try {
    const sessions = await Session.find({
      user: req.userId,
      status: "completed",
    }).sort({ createdAt: -1 });

    const history = sessions.map((s) => {
      const respCount = s.responses.length || 1;
      const facialAvg = s.responses.reduce((a, r) => a + (r.facialScore || 0), 0) / respCount;
      const speechAvg = s.responses.reduce((a, r) => a + (r.speechScore || 0), 0) / respCount;
      const nlpAvg = s.responses.reduce((a, r) => a + (r.nlpScore || 0), 0) / respCount;

      return {
        sessionId: s._id,
        domain: s.domain,
        targetRole: s.targetRole,
        experienceLevel: s.experienceLevel,
        overallScore: s.overallScore || 0,
        guidance: s.guidance,
        createdAt: s.createdAt,
        questionCount: s.responses.length,
        averages: {
          facial: Math.round(facialAvg),
          speech: Math.round(speechAvg),
          nlp: Math.round(nlpAvg),
        },
        responses: s.responses,
      };
    });

    res.json({ history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not fetch session history" });
  }
}

