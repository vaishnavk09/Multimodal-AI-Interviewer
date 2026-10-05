import axios from "axios";
import { STAGE_DESCRIPTIONS } from "./interviewPlan.js";

const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.7-flash",
  "gemini-3.1-flash-lite",
];

/**
 * Generates a domain-specific interview question using Gemini Flash API.
 * Takes the domain, past response history, followUpCount, candidateContext,
 * and the current interview stage.
 * Falls back to a static question bank if the API key is missing or calls fail.
 */
export async function generateQuestion(
  domain,
  history = [],
  followUpCount = 0,
  candidateContext = null,
  stage = "intro"
) {
  const apiKey = process.env.GEMINI_API_KEY;

  // Filter history to turns that actually contain a transcript
  const validHistory = history.filter((h) => h && h.transcript && h.transcript.trim());

  let contextSnippet = "";
  if (candidateContext) {
    const parts = [];
    if (candidateContext.targetRole) parts.push(`Target Role: ${candidateContext.targetRole}`);
    if (candidateContext.experienceLevel) parts.push(`Experience Level: ${candidateContext.experienceLevel}`);
    if (candidateContext.projects && candidateContext.projects.length)
      parts.push(`Key Projects: ${candidateContext.projects.join(", ")}`);
    if (candidateContext.skills && candidateContext.skills.length)
      parts.push(`Skills: ${candidateContext.skills.join(", ")}`);
    if (candidateContext.jobDescription) parts.push(`Job Description: ${candidateContext.jobDescription}`);

    if (parts.length > 0) {
      contextSnippet = `Candidate Background & Role Info:\n- ${parts.join("\n- ")}\n\n`;
    }
  }

  const stageInstruction = STAGE_DESCRIPTIONS[stage]
    ? `Current interview stage: "${stage}". ${STAGE_DESCRIPTIONS[stage]}`
    : "";

  let prompt = "";
  if (validHistory.length === 0) {
    prompt = `You are an expert technical interviewer conducting a mock interview for the domain "${domain}".
${contextSnippet}${stageInstruction}
Ask ONE concise question appropriate for this stage. Ground it in the candidate's target role, experience level, or specific listed projects/skills if relevant to this stage.
Return JSON ONLY in this format: {"type": "new_topic", "question": "..."}`;
  } else {
    const historyText = validHistory
      .map(
        (turn, i) =>
          `Turn ${i + 1}:\nQuestion: ${turn.question}\nCandidate Answer: ${turn.transcript}${
            turn.fusedScore != null ? `\nScore: ${turn.fusedScore}/100` : ""
          }`
      )
      .join("\n\n");

    const followUpConstraint =
      followUpCount >= 2
        ? "You have already asked 2 follow-ups on this topic; move to a completely new topic appropriate for the domain and candidate's target role (type = 'new_topic')."
        : "Decide whether to ask a follow-up that digs deeper into the candidate's last answer (type = 'follow_up'), or move to a new topic (type = 'new_topic'). Prefer a follow-up if the last answer was vague, mentioned something specific worth probing, or contradicted an earlier answer.";

    prompt = `You are an expert technical interviewer conducting a mock interview for the domain "${domain}".

${contextSnippet}${stageInstruction}

Here is the conversation history so far:
${historyText}

${followUpConstraint}

Return JSON ONLY in this format: {"type": "follow_up" | "new_topic", "question": "..."}`;
  }

  if (!apiKey) {
    console.warn("[llmService] No GEMINI_API_KEY set — using fallback question bank");
    return fallbackQuestion(domain, stage, validHistory.length);
  }

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const { data } = await axios.post(
        url,
        { contents: [{ parts: [{ text: prompt }] }] },
        { timeout: 8000 }
      );
      let text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) {
        // Clean potential markdown backticks ```json ... ```
        text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.question) {
            console.log(`[llmService] Generated question using Gemini (${model})`);
            return {
              question: parsed.question.trim(),
              type: parsed.type === "follow_up" ? "follow_up" : "new_topic",
              source: "llm",
            };
          }
        } catch (e) {
          // Fallback text parsing if not valid JSON
          text = text.replace(/^["']|["']$/g, "").trim();
          console.log(`[llmService] Generated question text using Gemini (${model})`);
          return {
            question: text,
            type: validHistory.length === 0 ? "new_topic" : "follow_up",
            source: "llm",
          };
        }
      }
    } catch (err) {
      console.error(`[llmService] Gemini model ${model} call failed:`, err.response?.data?.error?.message || err.message);
    }
  }

  console.warn("[llmService] All Gemini model calls failed, using fallback question bank");
  return fallbackQuestion(domain, stage, validHistory.length);
}

function fallbackQuestion(domain, stage, turnIndex = 0) {
  const bank = {
    "Software Engineering": {
      intro: ["Tell me a bit about yourself and your background."],
      experience: ["Walk me through a project you're proud of — what was your specific role?"],
      technical: [
        "Explain the difference between a process and a thread.",
        "How would you design a rate limiter for a REST API?",
        "What are index structures in database management systems?",
      ],
      behavioral: ["Describe a situation where a technical project didn't go as planned."],
      closing: ["Do you have any questions for me about the role?"],
    },
    "Data Science": {
      intro: ["Tell me about your background and what drew you to data science."],
      experience: ["Walk me through a data project you worked on end-to-end — from data collection to results."],
      technical: [
        "How would you handle missing values in a dataset?",
        "Explain the bias-variance tradeoff in machine learning.",
        "What is the difference between L1 and L2 regularization?",
      ],
      behavioral: ["How do you prioritize competing priorities when deadline pressures arise?"],
      closing: ["Is there anything else you'd like to share about your data science experience?"],
    },
    General: {
      intro: ["Tell me about yourself and your professional background."],
      experience: ["Tell me about a challenging project you worked on and your specific role in it."],
      technical: [
        "What is one technical skill you have recently improved, and how did you do it?",
        "How do you approach learning a new technology or framework?",
      ],
      behavioral: ["Describe a situation where you had to work with a difficult team member."],
      closing: ["Do you have any questions for me about the role?"],
    },
  };
  const domainBank = bank[domain] || bank.General;
  const pool = domainBank[stage] || domainBank.technical;
  return {
    question: pool[turnIndex % pool.length],
    type: "new_topic", // fallback doesn't attempt follow-up logic
    source: "fallback",
  };
}
