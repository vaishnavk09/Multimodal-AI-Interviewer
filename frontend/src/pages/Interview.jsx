import { useEffect, useRef, useState } from "react";
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
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState("");
  const [captureError, setCaptureError] = useState("");
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  function clearRecording() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl("");
    setRecordedBlob(null);
  }

  async function startRecording() {
    setCaptureError("");
    clearRecording();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      setCaptureError("Camera and microphone access is unavailable. You can still type an answer.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData();
      if (transcript.trim()) formData.append("transcript", transcript);
      if (recordedBlob) formData.append("video", recordedBlob, "answer.webm");
      const { data } = await api.post(`/interview/${sessionId}/respond`, formData);
      if (data.done) {
        setDone(true);
        setFeedback({ overallScore: data.overallScore, guidance: data.guidance });
      } else {
        setQuestion(data.nextQuestion);
        setFeedback({ lastScore: data.lastScore });
        setTranscript("");
        clearRecording();
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

      <div className="flex gap-2 mb-3">
        {!recording ? (
          <button type="button" onClick={startRecording} className="bg-red-600 text-white rounded px-4 py-2">
            Record answer
          </button>
        ) : (
          <button type="button" onClick={stopRecording} className="bg-slate-700 text-white rounded px-4 py-2">
            Stop recording
          </button>
        )}
        {recording && <span className="text-sm text-red-600 self-center">Recording...</span>}
      </div>

      {recordedUrl && <video controls src={recordedUrl} className="w-full rounded mb-3" />}
      {captureError && <p className="text-sm text-amber-700 mb-3">{captureError}</p>}
      <textarea
        className="w-full border rounded px-3 py-2 h-32"
        placeholder="Type an answer, or record one above"
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
