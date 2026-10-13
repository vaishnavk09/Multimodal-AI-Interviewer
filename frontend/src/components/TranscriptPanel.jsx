import React, { useRef, useEffect } from "react";

export default function TranscriptPanel({
  transcript = "",
  onTranscriptChange,
  partialWord = "",
  isRecording = false,
  wsConnected = false,
  isFallback = false,
  errorMessage = "",
}) {
  const scrollContainerRef = useRef(null);

  // Auto-scroll when new text or partial word arrives during recording
  useEffect(() => {
    if (scrollContainerRef.current && (transcript || partialWord)) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [transcript, partialWord]);

  const fullText = (transcript + (partialWord ? " " + partialWord : "")).trim();
  const wordCount = fullText ? fullText.split(/\s+/).filter(Boolean).length : 0;
  const charCount = fullText.length;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700 flex items-center gap-2">
          Your Answer
          {wsConnected && isRecording && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Real-Time
            </span>
          )}
          {isFallback && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
              ⌨️ Typing Mode
            </span>
          )}
        </label>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 flex items-center gap-1.5 font-normal">
            {isRecording ? (
              wsConnected ? (
                partialWord ? (
                  <span className="text-emerald-600 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Transcribing…
                  </span>
                ) : (
                  <span>🎙️ Listening for speech…</span>
                )
              ) : isFallback ? (
                <span>⌨️ Keyboard input active</span>
              ) : (
                <span className="text-amber-600">Connecting transcription…</span>
              )
            ) : (
              <span>Paused</span>
            )}
          </span>
        </div>
      </div>

      {/* Error / fallback banner */}
      {errorMessage && (
        <div className="text-xs px-3.5 py-2.5 rounded-xl border text-amber-800 bg-amber-50 border-amber-200 flex items-center gap-2">
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Live transcript view with inline partial words */}
      <div className="relative">
        {isRecording && !isFallback ? (
          <div
            ref={scrollContainerRef}
            className="w-full border border-slate-200 rounded-xl p-4 text-sm h-36 overflow-y-auto bg-slate-50/50 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all font-sans leading-relaxed"
          >
            {transcript ? (
              <span className="text-slate-800 whitespace-pre-wrap">{transcript}</span>
            ) : null}

            {partialWord ? (
              <span className="text-slate-400 italic font-medium ml-1 inline-flex items-center">
                {partialWord}
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-indigo-500 animate-pulse align-middle" />
              </span>
            ) : null}

            {!transcript && !partialWord && (
              <span className="text-slate-400 italic">
                Start speaking — your words will stream here in real time. You can edit below anytime.
              </span>
            )}
          </div>
        ) : (
          <textarea
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm h-36 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white font-sans leading-relaxed text-slate-800"
            placeholder="Type your answer here..."
            value={transcript}
            onChange={(e) => onTranscriptChange?.(e.target.value)}
          />
        )}
      </div>

      {/* Editable fallback / manual correction expansion when recording is live */}
      {isRecording && !isFallback && (
        <details className="text-xs text-slate-500 group">
          <summary className="cursor-pointer font-medium text-indigo-600 hover:text-indigo-700 transition flex items-center gap-1 select-none">
            <span>✏️ Edit or type answer manually</span>
          </summary>
          <div className="mt-2 pt-2 border-t border-slate-100">
            <textarea
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs h-24 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white font-sans text-slate-800"
              placeholder="Edit your transcribed answer or add more notes..."
              value={transcript}
              onChange={(e) => onTranscriptChange?.(e.target.value)}
            />
          </div>
        </details>
      )}

      {/* Metrics footer */}
      <div className="flex justify-between items-center text-xs text-slate-400 pt-1">
        <span>{wordCount} words</span>
        <span>{charCount} characters</span>
      </div>
    </div>
  );
}
