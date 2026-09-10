import axios from "axios";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * Generates a domain-specific interview question using Gemini 2.5 Flash (free tier).
 * Takes the domain, past response history, and followUpCount.
 * Falls back to a static question bank if the API key is missing or the call fails.
 */
export async function generateQuestion(
  domain,
  history = [],
  followUpCount = 0,
  candidateContext = null
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

  let prompt = "";
  if (validHistory.length === 0) {
    prompt = `You are an expert technical interviewer conducting a mock interview for the domain "${domain}".
${contextSnippet}Ask ONE concise opening interview question. Ground the question in the candidate's target role, experience level, or specific listed projects/skills if provided.
Return ONLY the question text, no preamble or surrounding quotes.`;
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
        ? "You have already asked 2 follow-ups on this topic; move to a completely new topic appropriate for the domain and candidate's target role."
        : "Decide whether to ask a follow-up that digs deeper into the candidate's last answer, or move to a new topic. Prefer a follow-up if the last answer was vague, mentioned something specific worth probing (a project, a technology, a decision), or contradicted an earlier answer. Otherwise move to a new topic appropriate for the domain.";

    prompt = `You are an expert technical interviewer conducting a mock interview for the domain "${domain}".

${contextSnippet}Here is the conversation history so far:
${historyText}

${followUpConstraint}

Ask ONE concise interview question. Return ONLY the question text, with no preamble, conversational filler, or surrounding quotation marks.`;
  }

  if (!apiKey) {
    return fallbackQuestion(domain, validHistory.length);
  }

  try {
    const { data } = await axios.post(
      `${GEMINI_URL}?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 8000 }
    );
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      // Strip any wrapping quotes if Gemini included them
      text = text.replace(/^["']|["']$/g, "").trim();
    }
    return text || fallbackQuestion(domain, validHistory.length);
  } catch (err) {
    console.error("[llmService] Gemini call failed, using fallback:", err.message);
    return fallbackQuestion(domain, validHistory.length);
  }
}

function fallbackQuestion(domain, turnIndex = 0) {
  const bank = {
    "Software Engineering": [
      "Explain the difference between a process and a thread.",
      "Can you expand on how memory management differs between processes and threads?",
      "How do microservices communicate synchronously vs asynchronously?",
      "What are index structures in database management systems?",
      "How would you design a rate limiter for a REST API?",
    ],
    "Data Science": [
      "How would you handle missing values in a dataset?",
      "What specific techniques would you use if the data is missing systematically rather than randomly?",
      "Explain the bias-variance tradeoff in machine learning.",
      "How do you evaluate a model when dealing with severe class imbalance?",
      "What is the difference between L1 and L2 regularization?",
    ],
    General: [
      "Tell me about a challenging project you worked on.",
      "What was your specific technical role in that project and what trade-offs did you make?",
      "Describe a situation where a technical project didn't go as planned.",
      "How do you prioritize competing priorities when deadline pressures arise?",
      "What is one technical skill you have recently improved, and how did you do it?",
    ],
  };
  const list = bank[domain] || bank.General;
  return list[turnIndex % list.length];
}

