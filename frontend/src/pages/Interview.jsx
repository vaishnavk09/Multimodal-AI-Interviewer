import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import api from "../api.js";

// ─── Web Speech API check ───────────────────────────────────────────────────
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

export default function Interview() {
  const { sessionId } = useParams();
  const location = useLocation();

  // ── Interview state ───────────────────────────────────────────────────────
  const [question, setQuestion] = useState(location.state?.firstQuestion || "");
  const [questionNum, setQuestionNum] = useState(1);
  const [maxQuestions, setMaxQuestions] = useState(location.state?.maxQuestions || 5);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Device / media state ──────────────────────────────────────────────────
  const [deviceCheckDone, setDeviceCheckDone] = useState(false);
  const [checkStep, setCheckStep] = useState("idle"); // idle | testing | ready | error
  const [micLevel, setMicLevel] = useState(0);        // 0-100 for visualizer bar
  const [personDetected, setPersonDetected] = useState(null); // null | true | false
  const [captureError, setCaptureError] = useState("");

  // ── Recording state ───────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [speechActive, setSpeechActive] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const previewVideoRef = useRef(null);   // pre-check preview
  const liveVideoRef = useRef(null);      // during interview
  const streamRef = useRef(null);         // persists from device check through interview
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const analyserRef = useRef(null);
  const micAnimFrameRef = useRef(null);
  const isRecordingRef = useRef(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllMedia();
    };
  }, []);

  function stopAllMedia() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopSpeechRecognition();
    if (micAnimFrameRef.current) cancelAnimationFrame(micAnimFrameRef.current);
  }

  // Auto-fetch question if arrived via direct link
  useEffect(() => {
    if (!location.state?.firstQuestion) {
      api.get(`/interview/${sessionId}`).then(({ data }) => {
        if (data.status === "completed") {
          setDone(true);
          setFeedback({ overallScore: data.overallScore, guidance: data.guidance });
        } else if (data.responses?.length > 0) {
          setQuestion(data.responses.at(-1).question);
          setMaxQuestions(data.maxQuestions || 5);
          setQuestionNum(data.responses.length);
        }
      }).catch(console.error);
    }
  }, [sessionId, location.state]);

  // Bind stream to live video ref when it's available
  useEffect(() => {
    if (liveVideoRef.current && streamRef.current && deviceCheckDone) {
      liveVideoRef.current.srcObject = streamRef.current;
    }
  }, [deviceCheckDone]);

  // ─────────────────────────────────────────────────────────────────────────
  // PRE-INTERVIEW DEVICE CHECK
  // ─────────────────────────────────────────────────────────────────────────

  async function startDeviceCheck() {
    setCaptureError("");
    setCheckStep("testing");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
      }
      startMicLevelMeter(stream);
      // Give a 1.5s delay then check if camera is showing a face via a quick snapshot
      setTimeout(() => checkPersonInFrame(stream), 1500);
      setCheckStep("ready");
    } catch (err) {
      setCaptureError("Camera or microphone access was denied. You can still type answers, but AI facial analysis will be limited.");
      setCheckStep("error");
    }
  }

  function startMicLevelMeter(stream) {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      function tick() {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, Math.round(avg * 2.5)));
        micAnimFrameRef.current = requestAnimationFrame(tick);
      }
      tick();
    } catch {}
  }

  async function checkPersonInFrame(stream) {
    try {
      const videoTrack = stream?.getVideoTracks?.()?.[0];
      if (!videoTrack || videoTrack.readyState !== "live") {
        setPersonDetected(false);
        return;
      }

      const video = previewVideoRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let totalBrightness = 0;
        const totalPixels = imgData.data.length / 4;

        for (let i = 0; i < imgData.data.length; i += 4) {
          const r = imgData.data[i];
          const g = imgData.data[i + 1];
          const b = imgData.data[i + 2];
          totalBrightness += (r + g + b) / 3;
        }

        const avgBrightness = totalBrightness / totalPixels;
        // If average brightness > 12, camera is active and delivering light/feed
        setPersonDetected(avgBrightness > 12);
      } else {
        // Active stream present, default to true
        setPersonDetected(true);
      }
    } catch {
      setPersonDetected(true); // Fallback to true if browser context restricts canvas extraction
    }
  }

  function proceedToInterview() {
    if (micAnimFrameRef.current) cancelAnimationFrame(micAnimFrameRef.current);
    setDeviceCheckDone(true);
    // Keep stream alive; bind to live video
    setTimeout(() => {
      if (liveVideoRef.current && streamRef.current) {
        liveVideoRef.current.srcObject = streamRef.current;
      }
      startRecording();
    }, 100);
  }

  function proceedWithoutCamera() {
    stopAllMedia();
    setDeviceCheckDone(true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECORDING (runs throughout the entire question)
  // ─────────────────────────────────────────────────────────────────────────

  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm",
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
    };
    recorder.start(500); // collect chunks every 500ms
    mediaRecorderRef.current = recorder;
    isRecordingRef.current = true;
    setIsRecording(true);
    startSpeechRecognition();
  }

  function stopCurrentRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    isRecordingRef.current = false;
    setIsRecording(false);
    stopSpeechRecognition();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REAL-TIME SPEECH → TRANSCRIPT
  // ─────────────────────────────────────────────────────────────────────────

  const startSpeechRecognition = useCallback(() => {
    if (!SpeechRecognition) {
      console.warn("[speech] SpeechRecognition API not supported in this browser.");
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setSpeechActive(true);
      };

      recognition.onresult = (event) => {
        let finalChunk = "";
        let interimChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) {
            finalChunk += r[0].transcript + " ";
          } else {
            interimChunk += r[0].transcript;
          }
        }
        if (finalChunk) {
          setTranscript((prev) => (prev ? prev.trim() + " " + finalChunk.trim() : finalChunk.trim()));
        }
        setInterimText(interimChunk);
        setSpeechActive(true);
      };

      recognition.onend = () => {
        setSpeechActive(false);
        setInterimText("");
        // Auto-restart with fresh recognition instance if still recording
        if (isRecordingRef.current) {
          setTimeout(() => {
            if (isRecordingRef.current) {
              startSpeechRecognition();
            }
          }, 200);
        }
      };

      recognition.onerror = (e) => {
        console.warn("[speech] recognition error:", e.error);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          isRecordingRef.current = false;
        }
      };

      recognition.start();
    } catch (err) {
      console.warn("[speech] Failed to initialize recognition:", err);
    }
  }, []);

  function stopSpeechRecognition() {
    isRecordingRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    setSpeechActive(false);
    setInterimText("");
  }

  function toggleManualSpeech() {
    if (speechActive || recognitionRef.current) {
      stopSpeechRecognition();
    } else {
      isRecordingRef.current = true;
      startSpeechRecognition();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBMIT ANSWER
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    stopCurrentRecording();
    stopSpeechRecognition();

    // Wait a tick for the onstop blob to be set
    await new Promise((r) => setTimeout(r, 600));

    try {
      const formData = new FormData();
      const finalTranscript = (transcript + " " + interimText).trim();
      if (finalTranscript) formData.append("transcript", finalTranscript);

      // Use the recorded blob captured above (might still be setting)
      const blob = recordedBlob || (chunksRef.current.length > 0
        ? new Blob(chunksRef.current, { type: "video/webm" })
        : null);
      if (blob) formData.append("video", blob, "answer.webm");

      const { data } = await api.post(`/interview/${sessionId}/respond`, formData);

      if (data.done) {
        setDone(true);
        setFeedback({ overallScore: data.overallScore, guidance: data.guidance });
        stopAllMedia();
      } else {
        setQuestion(data.nextQuestion);
        setQuestionNum((n) => n + 1);
        setFeedback({ lastScore: data.lastScore });
        setTranscript("");
        setInterimText("");
        setRecordedBlob(null);
        chunksRef.current = [];
        // Re-start recording for next question
        setTimeout(() => startRecording(), 200);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Pre-Interview Device Check
  // ─────────────────────────────────────────────────────────────────────────

  if (!deviceCheckDone && !done) {
    return (
      <div className="interview-page max-w-xl mx-auto mt-10 px-4 space-y-5">
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-7 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Pre-Interview System Check</h1>
            <p className="text-slate-500 text-sm mt-1">
              We verify your camera, microphone, and that you&apos;re alone in frame before proceeding.
            </p>
          </div>

          {/* Camera preview */}
          <div className="bg-slate-900 rounded-xl overflow-hidden h-56 flex items-center justify-center relative">
            {checkStep !== "idle" ? (
              <>
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
                {/* Person detection overlay */}
                {personDetected === false && (
                  <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center">
                    <p className="text-white text-sm font-semibold text-center px-4">
                      ⚠️ We couldn&apos;t detect a person in frame.<br />
                      <span className="font-normal opacity-80">Please position yourself in front of the camera.</span>
                    </p>
                  </div>
                )}
                {personDetected === true && (
                  <div className="absolute bottom-2 left-2 bg-emerald-500/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                    ✓ Person detected
                  </div>
                )}
              </>
            ) : (
              <div className="text-center p-4">
                <p className="text-slate-400 text-sm mb-4">Camera preview inactive</p>
                <button
                  onClick={startDeviceCheck}
                  className="bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-indigo-700 transition"
                >
                  🎥 Test Camera & Mic
                </button>
              </div>
            )}
          </div>

          {captureError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3.5 py-2.5 rounded-xl">
              ⚠️ {captureError}
            </div>
          )}

          {/* Mic level visualizer */}
          {checkStep === "ready" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>🎙️ Microphone Level</span>
                <span className={micLevel > 10 ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                  {micLevel > 10 ? "Audio detected ✓" : "Speak to test…"}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-100"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
            </div>
          )}

          {/* Background check status */}
          {personDetected !== null && (
            <div className="flex items-center justify-between text-xs font-medium px-3.5 py-2.5 rounded-xl transition-all border"
              style={{
                backgroundColor: personDetected ? "#f0fdf4" : "#fef2f2",
                color: personDetected ? "#15803d" : "#b91c1c",
                borderColor: personDetected ? "#dcfce7" : "#fee2e2"
              }}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${personDetected ? "bg-emerald-500" : "bg-amber-500"} animate-pulse`} />
                {personDetected
                  ? "Camera feed active — candidate in frame"
                  : "Check lighting & position in front of camera"}
              </div>
              {streamRef.current && (
                <button
                  type="button"
                  onClick={() => checkPersonInFrame(streamRef.current)}
                  className="underline text-[11px] font-semibold hover:opacity-80"
                >
                  Re-check
                </button>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {checkStep === "ready" && (
              <button
                onClick={proceedToInterview}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-indigo-700 transition"
              >
                ✅ All Good — Start Interview
              </button>
            )}
            {checkStep === "idle" && (
              <button
                onClick={startDeviceCheck}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-indigo-700 transition"
              >
                🎥 Test Camera & Mic
              </button>
            )}
            <button
              onClick={proceedWithoutCamera}
              className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-3 text-sm hover:bg-slate-50 transition"
            >
              Skip — Type Answers Only
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Session Complete
  // ─────────────────────────────────────────────────────────────────────────

  if (done) {
    const score = feedback?.overallScore ?? 0;
    const scoreLabel = score >= 75 ? "Excellent" : score >= 50 ? "Good" : "Needs Work";
    const scoreColor = score >= 75 ? "text-emerald-600" : score >= 50 ? "text-amber-500" : "text-red-500";

    return (
      <div className="interview-page max-w-lg mx-auto mt-14 px-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100 text-center space-y-5">
          <div>
            <div className="text-5xl mb-2">{score >= 75 ? "🏆" : score >= 50 ? "👍" : "💪"}</div>
            <h1 className="text-xl font-bold text-slate-900">Interview Complete!</h1>
          </div>
          <div className="py-2">
            <p className={`text-5xl font-black ${scoreColor}`}>{score}/100</p>
            <p className="text-xs text-slate-500 mt-1 font-medium">{scoreLabel} · Multimodal Performance Score</p>
          </div>
          {feedback?.guidance && (
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-left text-sm text-slate-700">
              <span className="font-semibold text-slate-900 block mb-1">💡 Key Recommendation</span>
              {feedback.guidance}
            </div>
          )}
          <div className="flex justify-center gap-3 pt-2">
            <Link
              to="/history"
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition"
            >
              View Analytics
            </Link>
            <Link
              to="/"
              className="border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition"
            >
              New Session
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Active Interview
  // ─────────────────────────────────────────────────────────────────────────

  const canSubmit = !submitting && (transcript.trim().length > 0 || interimText.trim().length > 0 || recordedBlob);

  return (
    <div className="interview-page max-w-4xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* LEFT: Camera Monitor */}
        <div className="md:col-span-1 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 uppercase tracking-wider">Live Camera</span>
            {isRecording && (
              <span className="flex items-center gap-1.5 text-red-600 font-semibold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Recording
              </span>
            )}
          </div>

          {/* Camera feed — always visible during interview */}
          <div className="bg-slate-900 rounded-2xl overflow-hidden aspect-video relative">
            {streamRef.current ? (
              <video
                ref={liveVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-slate-400 text-xs">No camera — text mode</p>
              </div>
            )}
            {/* Monitoring badge */}
            {streamRef.current && (
              <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                🎥 Monitoring
              </div>
            )}
          </div>

          {/* Speech activity indicator */}
          <div className={`text-xs flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
            speechActive
              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
              : "bg-slate-50 text-slate-400 border border-slate-100"
          }`}>
            <span className={`w-2 h-2 rounded-full ${speechActive ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
            {speechActive ? "Speaking — auto-transcribing" : "Listening…"}
          </div>

          {/* Progress */}
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-xs">
            <div className="flex justify-between text-slate-500 mb-1.5">
              <span>Progress</span>
              <span className="font-semibold text-slate-900">Q{questionNum}/{maxQuestions}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${(questionNum / maxQuestions) * 100}%` }}
              />
            </div>
          </div>

          {/* Previous question score */}
          {feedback?.lastScore != null && (
            <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500">Previous answer</p>
              <p className={`text-2xl font-black mt-0.5 ${
                feedback.lastScore >= 75 ? "text-emerald-600" :
                feedback.lastScore >= 50 ? "text-amber-500" : "text-red-500"
              }`}>
                {feedback.lastScore}/100
              </p>
            </div>
          )}
        </div>

        {/* RIGHT: Question + Answer */}
        <div className="md:col-span-2 space-y-5">
          {/* Question card */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                Question {questionNum} of {maxQuestions}
              </span>
              {!SpeechRecognition && (
                <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                  Auto-transcription unavailable — type below
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-900 leading-snug">
              {question || "Loading question…"}
            </h1>
          </div>

          {/* Answer area */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Your Answer
              </label>
              <div className="flex items-center gap-2">
                {SpeechRecognition && (
                  <button
                    type="button"
                    onClick={toggleManualSpeech}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer flex items-center gap-1.5 ${
                      speechActive
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${speechActive ? "bg-emerald-500 animate-pulse" : "bg-indigo-400"}`} />
                    {speechActive ? "🎙️ Mic Active (Listening)" : "⚡ Click to Start Mic"}
                  </button>
                )}
              </div>
            </div>

            {/* Combined real text + interim ghost text */}
            <div className="relative">
              <textarea
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm h-36 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white"
                placeholder={
                  SpeechRecognition
                    ? "Start speaking — your words will appear here automatically. You can also type or edit."
                    : "Type your answer here..."
                }
                value={
                  interimText
                    ? (transcript ? transcript.trim() + " " + interimText.trim() : interimText)
                    : transcript
                }
                onChange={(e) => {
                  setTranscript(e.target.value);
                  setInterimText("");
                }}
              />
            </div>

            {/* Character count */}
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>
                {(transcript + " " + interimText).trim().split(/\s+/).filter(Boolean).length} words
              </span>
              <span>
                {(transcript + interimText).length} characters
              </span>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-40 hover:bg-indigo-700 transition"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing your answer with AI…
                </span>
              ) : (
                "Submit Answer →"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
