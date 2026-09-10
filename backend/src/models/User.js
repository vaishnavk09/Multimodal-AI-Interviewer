import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    domain: { type: String, default: "General" }, // e.g. "Software Engineering", "Data Science"
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
