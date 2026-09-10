import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema(
  {
    skills: [String],
    projects: [String],
    yearsExperience: { type: Number, default: 0 },
    rawText: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    domain: { type: String, default: "General" }, // e.g. "Software Engineering", "Data Science"
    targetRole: { type: String, default: "" },
    experienceLevel: { type: String, default: "Fresher" }, // "Fresher", "1-3 yrs", "3+ yrs"
    jobDescription: { type: String, default: "" },
    resume: resumeSchema,
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);

