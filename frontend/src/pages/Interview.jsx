import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
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

  // Pre-interview device check state
  const [deviceCheckDone, setDeviceCheckDone] = useState(false);
  const [previewStream, setPreviewStream] = useState(null);
  const [micActive, setMicActive] = useState(false);
  const previewVideoRef = useRef(null);
  const liveVideoRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);

  // Auto-fetch question if direct link accessed without location.state
  useEffect(() => {
    if (!location.state?.firstQuestion) {
      api.get(`/interview/${sessionId}`).then(({ data }) => {
        if (data.status === "completed") {
          setDone(true);
          setFeedback({ overallScore: data.overallScore, guidance: data.guidance });
        } else if (data.responses && data.responses.length > 0) {
          const current = data.responses.at(-1);
          setQuestion(current.question);
        }
      }).catch(err => console.error(err));
    }
  }, [sessionId, location.state]);

  // Clean up recording URL and streams
  useEffect(() => () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    previewStream?.getTracks().forEach((track) => track.stop());
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl, previewStream]);

  // Handle live preview video stream binding
  useEffect(() => {
    if (previewVideoRef.current && previewStream) {
      previewVideoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  useEffect(() => {
    if (liveVideoRef.current && mediaStreamRef.current) {
      liveVideoRef.current.srcObject = mediaStreamRef.current;
    }
  }, [recording]);

  async function testDevices() {
    setCaptureError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setPreviewStream(stream);
      setMicActive(true);
    } catch (err) {
      setCaptureError("Camera or microphone access denied/unavailable. Typed answers will be enabled.");
      setMicActive(false);
    }
  }

  function finishDeviceCheck() {
    if (previewStream) {
      previewStream.getTracks().forEach((t) => t.stop());
      setPreviewStream(null);
    }
    setDeviceCheckDone(true);
  }

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

  // Pre-interview Device Check Screen
  if (!deviceCheckDone && !done) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white p-8 rounded-xl shadow border border-slate-100 text-left space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pre-Interview System Check</h1>
          <p className="text-slate-500 text-sm mt-1">
            Test your camera and microphone to ensure clear audio/video capture for multimodal analysis.
          </p>
        </div>

        <div className="bg-slate-900 rounded-lg overflow-hidden h-52 flex items-center justify-center relative">
          {previewStream ? (
            <video
              ref={previewVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
          ) : (
            <div className="text-center p-4">
              <p className="text-slate-400 text-sm mb-3">Camera preview inactive</p>
              <button
                onClick={testDevices}
                className="bg-white text-slate-900 font-semibold px-4 py-2 rounded text-xs hover:bg-slate-100 transition"
              >
                Test Camera & Mic
              </button>
            </div>
          )}
        </div>

        {captureError && <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded">{captureError}</p>}

        {previewStream && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Camera & Microphone active and ready!
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={finishDeviceCheck}
            className="w-full bg-slate-900 text-white rounded-lg py-2.5 font-medium hover:bg-slate-800 transition text-sm"
          >
            Start Practice Interview
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white p-8 rounded-xl shadow border border-slate-100 text-center space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Interview Session Complete!</h1>
        <div className="py-2">
          <p className="text-4xl font-extrabold text-slate-900">{feedback.overallScore}/100</p>
          <p className="text-xs text-slate-500 mt-1">Overall Multimodal Performance Score</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-lg text-left text-sm text-slate-700">
          <span className="font-semibold text-slate-900 block mb-1">Personalized Feedback & Guidance:</span>
          {feedback.guidance}
        </div>
        <div className="pt-2 flex justify-center gap-3">
          <Link
            to="/history"
            className="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 transition"
          >
            View History & Analytics
          </Link>
          <Link
            to="/"
            className="border border-slate-300 text-slate-700 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
          >
            New Session
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-12 bg-white p-8 rounded-xl shadow border border-slate-100 text-left space-y-5">
      <div>
        <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Current Question</span>
        <h1 className="text-lg font-bold text-slate-900 mt-1">{question}</h1>
      </div>

      {/* Recording & Preview area */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg px-4 py-2.5 transition flex items-center gap-2"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white"></span>
              Record Video Answer
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg px-4 py-2.5 transition flex items-center gap-2"
            >
              <span className="w-2.5 h-2.5 rounded bg-red-400"></span>
              Stop Recording
            </button>
          )}
          {recording && <span className="text-xs text-red-600 font-medium animate-pulse">● Live Recording...</span>}
        </div>

        {recording && (
          <div className="bg-slate-900 rounded-lg overflow-hidden h-44 relative">
            <video
              ref={liveVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
          </div>
        )}

        {recordedUrl && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Answer Video Preview:</p>
            <video controls src={recordedUrl} className="w-full rounded-lg h-44 bg-black object-cover" />
          </div>
        )}
      </div>

      {captureError && <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded">{captureError}</p>}

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Transcript / Written Answer (Optional if video recorded)
        </label>
        <textarea
          className="w-full border rounded-lg px-3 py-2 text-sm h-28 focus:ring-2 focus:ring-slate-900 outline-none"
          placeholder="Type an answer here, or let Whisper auto-transcribe your video recording..."
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
      </div>

      {feedback?.lastScore != null && (
        <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 flex justify-between items-center">
          <span>Previous Answer Score:</span>
          <span className="font-bold text-slate-900 text-sm">{feedback.lastScore}/100</span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || (!recordedBlob && !transcript.trim())}
        className="w-full bg-slate-900 text-white rounded-lg py-3 font-semibold text-sm disabled:opacity-40 hover:bg-slate-800 transition"
      >
        {submitting ? "Analyzing Answer..." : "Submit Answer"}
      </button>
    </div>
  );
}
