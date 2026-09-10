import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/mock_interviewer";
  try {
    await mongoose.connect(uri);
    console.log("[db] MongoDB connected:", uri);
  } catch (err) {
    console.error("[db] MongoDB connection failed:", err.message);
    process.exit(1);
  }
}
