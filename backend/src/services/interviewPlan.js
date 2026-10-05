// interviewPlan.js — Stage definitions and plan builder for structured interview flow

export const STAGE_DESCRIPTIONS = {
  intro: "A warm opening question — e.g. asking the candidate to introduce themselves or walk through their background at a high level. Not technical yet.",
  experience: "Dig into the candidate's actual listed projects, internships, or work experience — ask them to explain a specific one in depth: their role, decisions made, challenges faced.",
  technical: "Role-specific technical questions appropriate for the target role and experience level — concepts, problem-solving, system design (scale depth to experience level).",
  behavioral: "Situational/behavioral questions — teamwork, conflict, failure, prioritization, leadership.",
  closing: "A closing question — e.g. asking if the candidate has questions, or why they want this role.",
};

export function buildStagePlan(maxQuestions) {
  if (maxQuestions <= 5) return ["intro", "experience", "technical", "technical", "behavioral"];
  if (maxQuestions === 6) return ["intro", "experience", "technical", "technical", "behavioral", "closing"];
  if (maxQuestions === 7) return ["intro", "experience", "experience", "technical", "technical", "behavioral", "closing"];
  return ["intro", "experience", "experience", "technical", "technical", "technical", "behavioral", "closing"]; // 8
}
