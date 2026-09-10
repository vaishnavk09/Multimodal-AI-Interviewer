import { useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import api from "../api.js";

export default function Interview() {
  const { sessionId } = useParams();
  const location = useLocation();
  const [question, setQuestion] = useState(location.state?.firstQuestion || "Loading question...");
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post(`/interview/${sessionId}/respond`, { transcript });
      if (data.done) {
        setDone(true);
        setFeedback({ overallScore: data.overallScore, guidance: data.guidance });
      } else {
        setQuestion(data.nextQuestion);
        setFeedback({ lastScore: data.lastScore });
        setTranscript("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white p-8 rounded-xl shadow">
        <h1 className="text-xl font-semibold mb-2">Session complete</h1>
        <p className="text-3xl font-bold text-slate-900 mb-4">{feedback.overallScore}/100</p>
        <p className="text-slate-600">{feedback.guidance}</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-16 bg-white p-8 rounded-xl shadow">
      <h1 className="text-lg font-semibold mb-4">{question}</h1>

      {/* NOTE: this text box is a Phase-1 stand-in. Wire this up to
          getUserMedia + MediaRecorder to capture real audio/video,
          then send the file to the backend for ASR transcription
          instead of typing the answer directly. */}
      <textarea
        className="w-full border rounded px-3 py-2 h-32"
        placeholder="Type your answer here (temporary — replace with mic/video capture)"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
      />

      {feedback?.lastScore != null && (
        <p className="text-sm text-slate-500 mt-2">Last answer score: {feedback.lastScore}/100</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-slate-900 text-white rounded py-2 mt-4 disabled:opacity-50"
      >
        {submitting ? "Analyzing..." : "Submit answer"}
      </button>
    </div>
  );
}
