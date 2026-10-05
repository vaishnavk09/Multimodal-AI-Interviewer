import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.middleware.js";
import { startSession, submitResponse, getSession, uploadResume, getUserHistory, transcribePartial } from "../controllers/interview.controller.js";

const upload = multer({ dest: "uploads/" }); // swap for Cloudinary storage later

const router = Router();

router.get("/history", requireAuth, getUserHistory);
router.post("/resume", requireAuth, upload.single("resume"), uploadResume);
router.post("/start", requireAuth, startSession);
router.post(
  "/transcribe-partial",
  requireAuth,
  upload.single("file"),
  transcribePartial
);
router.post(
  "/:sessionId/respond",
  requireAuth,
  upload.fields([{ name: "video" }, { name: "audio" }]),
  submitResponse
);
router.get("/:sessionId", requireAuth, getSession);

export default router;
