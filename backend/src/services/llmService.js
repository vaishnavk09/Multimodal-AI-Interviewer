import axios from "axios";

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
 * Takes the domain, past response history, and followUpCount.
 * Falls back to a static question bank if the API key is missing or calls fail.
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

${contextSnippet}Here is the conversation history so far:
${historyText}

${followUpConstraint}

Return JSON ONLY in this format: {"type": "follow_up" | "new_topic", "question": "..."}`;
  }

  if (!apiKey) {
    console.warn("[llmService] No GEMINI_API_KEY set — using fallback question bank");
    return fallbackQuestion(domain, validHistory.length);
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
  return fallbackQuestion(domain, validHistory.length);
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
  const isFollowUp = turnIndex % 2 === 1;
  return {
    question: list[turnIndex % list.length],
    type: isFollowUp ? "follow_up" : "new_topic",
    source: "fallback",
  };
}


