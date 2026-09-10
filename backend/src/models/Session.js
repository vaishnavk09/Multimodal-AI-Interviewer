import mongoose from "mongoose";

const responseSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    transcript: { type: String, default: "" },
    facialScore: { type: Number, default: null },   // 0-100
    speechScore: { type: Number, default: null },   // 0-100
    nlpScore: { type: Number, default: null },      // 0-100
    fusedScore: { type: Number, default: null },    // 0-100
    feedback: { type: String, default: "" },
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    domain: { type: String, required: true },
    targetRole: { type: String, default: "" },
    experienceLevel: { type: String, default: "Fresher" },
    jobDescription: { type: String, default: "" },
    maxQuestions: { type: Number, default: 5 },
    status: { type: String, enum: ["in_progress", "completed"], default: "in_progress" },
    responses: [responseSchema],
    followUpCount: { type: Number, default: 0 },
    overallScore: { type: Number, default: null },
    guidance: { type: String, default: "" }, // personalized prep plan text
  },
  { timestamps: true }
);

export default mongoose.model("Session", sessionSchema);
