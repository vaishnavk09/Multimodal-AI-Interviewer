import axios from "axios";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * Generates a domain-specific interview question using Gemini 2.5 Flash (free tier).
 * Falls back to a static question bank if the API key is missing or the call fails,
 * so local dev/demo never breaks.
 */
export async function generateQuestion(domain, priorScores = []) {
  const apiKey = process.env.GEMINI_API_KEY;

  const difficultyHint =
    priorScores.length === 0
      ? "medium"
      : priorScores.at(-1) >= 70
      ? "slightly harder"
      : "slightly easier";

  const prompt = `You are conducting a technical mock interview for the domain "${domain}".
Ask ONE concise interview question, difficulty: ${difficultyHint}.
Return ONLY the question text, no preamble.`;

  if (!apiKey) {
    return fallbackQuestion(domain);
  }

  try {
    const { data } = await axios.post(
      `${GEMINI_URL}?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 8000 }
    );
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || fallbackQuestion(domain);
  } catch (err) {
    console.error("[llmService] Gemini call failed, using fallback:", err.message);
    return fallbackQuestion(domain);
  }
}

function fallbackQuestion(domain) {
  const bank = {
    "Software Engineering": "Explain the difference between a process and a thread.",
    "Data Science": "How would you handle missing values in a dataset?",
    General: "Tell me about a challenging project you worked on.",
  };
  return bank[domain] || bank.General;
}
