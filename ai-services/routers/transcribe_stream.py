import asyncio
import json
import os
import shutil
import numpy as np
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel
import webrtcvad

router = APIRouter()

# Whisper is the server-side FALLBACK transcriber (the browser's Web Speech API
# is the primary path). Model/device/compute are env-configurable so this can be
# tuned to the host: `base.en` is a good CPU default — far more accurate than
# `tiny` while still real-time on short VAD segments. Bump to `small.en` on a
# stronger box, or set WHISPER_DEVICE=cuda for GPU.
WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "base.en")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

_whisper_model = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel(
            WHISPER_MODEL_NAME, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE
        )
    return _whisper_model


# Backwards-compatible alias (older call sites).
def get_whisper_tiny():
    return get_whisper_model()


def get_ffmpeg_binary() -> str:
    cmd = shutil.which("ffmpeg")
    if cmd:
        return cmd
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


SAMPLE_RATE = 16000
FRAME_MS = 30  # VAD frame size: 10, 20, or 30 ms only
FRAME_BYTES = int(SAMPLE_RATE * FRAME_MS / 1000) * 2  # 960 bytes for 16-bit PCM mono


def split_into_vad_frames(pcm: bytes, frame_bytes: int):
    for i in range(0, len(pcm) - frame_bytes + 1, frame_bytes):
        yield pcm[i : i + frame_bytes]


@router.post("/transcribe/stream")
async def transcribe_stream(request: Request):
    session_id = request.headers.get("X-Session-Id", "unknown")
    ffmpeg_bin = get_ffmpeg_binary()
    whisper_model = get_whisper_tiny()
    vad = webrtcvad.Vad(2)  # aggressiveness 0-3; 2 = balanced

    async def generate():
        speech_frames = []
        silence_count = 0
        SILENCE_THRESHOLD = 10  # 10 x 30 ms = 300 ms silence triggers segment commit
        MAX_SPEECH_FRAMES = 150  # ~4.5 s of continuous speech without pause triggers flush

        # Spawn persistent ffmpeg process for streaming decode of WebM/Opus -> 16kHz s16le PCM
        proc = await asyncio.create_subprocess_exec(
            ffmpeg_bin,
            "-fflags", "nobuffer",
            "-flags", "low_delay",
            "-i", "pipe:0",
            "-ar", str(SAMPLE_RATE),
            "-ac", "1",
            "-f", "s16le",
            "pipe:1",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )

        pcm_queue = asyncio.Queue()
        input_done = asyncio.Event()

        async def stdin_writer():
            try:
                async for raw_chunk in request.stream():
                    if raw_chunk and proc.stdin:
                        proc.stdin.write(raw_chunk)
                        await proc.stdin.drain()
            except Exception as e:
                pass
            finally:
                if proc.stdin:
                    try:
                        proc.stdin.close()
                        await proc.stdin.wait_closed()
                    except Exception:
                        pass
                input_done.set()

        async def stdout_reader():
            buffer = bytearray()
            try:
                while True:
                    # Read available PCM bytes from ffmpeg
                    chunk = await proc.stdout.read(FRAME_BYTES * 2)
                    if not chunk:
                        break
                    buffer.extend(chunk)
                    while len(buffer) >= FRAME_BYTES:
                        frame = bytes(buffer[:FRAME_BYTES])
                        del buffer[:FRAME_BYTES]
                        await pcm_queue.put(frame)
            except Exception:
                pass
            finally:
                await pcm_queue.put(None)  # Sentinel to signal EOF

        writer_task = asyncio.create_task(stdin_writer())
        reader_task = asyncio.create_task(stdout_reader())
        loop = asyncio.get_running_loop()

        def transcribe_frames(frames: list[bytes]) -> str:
            if not frames:
                return ""
            pcm_audio = b"".join(frames)
            audio_np = np.frombuffer(pcm_audio, dtype=np.int16).astype(np.float32) / 32768.0
            if len(audio_np) < SAMPLE_RATE * 0.2:  # Less than 200ms
                return ""
            try:
                segments, _ = whisper_model.transcribe(
                    audio_np,
                    language="en",
                    beam_size=1,
                    vad_filter=False,
                    word_timestamps=False,
                )
                return " ".join(s.text.strip() for s in segments).strip()
            except Exception as e:
                return ""

        try:
            while True:
                # Wait for next VAD frame or EOF sentinel
                frame = await pcm_queue.get()
                if frame is None:
                    # Stream finished — transcribe any pending speech frames
                    if speech_frames:
                        text = await loop.run_in_executor(None, transcribe_frames, speech_frames)
                        if text:
                            yield json.dumps({"isFinal": True, "final": text}) + "\n"
                        speech_frames = []
                    break

                try:
                    is_speech = vad.is_speech(frame, SAMPLE_RATE)
                except Exception:
                    is_speech = False

                if is_speech:
                    speech_frames.append(frame)
                    silence_count = 0
                else:
                    silence_count += 1
                    if speech_frames:
                        speech_frames.append(frame)  # include trailing silence

                # Flush segment on silence or if candidate speaks continuously for too long
                should_flush = (silence_count >= SILENCE_THRESHOLD and speech_frames) or (
                    len(speech_frames) >= MAX_SPEECH_FRAMES
                )

                if should_flush:
                    text = await loop.run_in_executor(None, transcribe_frames, speech_frames)
                    if text:
                        yield json.dumps({"isFinal": True, "final": text}) + "\n"
                    speech_frames = []
                    silence_count = 0

        finally:
            writer_task.cancel()
            reader_task.cancel()
            try:
                if proc.returncode is None:
                    proc.kill()
            except Exception:
                pass

    return StreamingResponse(generate(), media_type="text/plain")


# ─────────────────────────────────────────────────────────────────────────────
# Persistent WebSocket transcription endpoint.
#
# The Node gateway opens one WebSocket per browser session and relays:
#   • binary frames  → WebM/Opus audio chunks, piped into a long-lived ffmpeg
#     decoder, then VAD-segmented and transcribed.
#   • text frames    → JSON control messages: {"type":"reset"} restarts the
#     decoder (used after a reconnect where the client replays the WebM header),
#     {"type":"end"} flushes and closes.
#
# It emits JSON text frames back, matching the client's existing schema:
#   {"isFinal": false, "partial": "..."}   throttled interim transcript
#   {"isFinal": true,  "final":   "..."}   committed segment on silence/length
# ─────────────────────────────────────────────────────────────────────────────

SILENCE_THRESHOLD = 10      # 10 × 30 ms = 300 ms of silence commits a segment
MAX_SPEECH_FRAMES = 150     # ~4.5 s continuous speech forces a commit
PARTIAL_MIN_FRAMES = 25     # ~0.75 s of speech before we bother with a partial
PARTIAL_INTERVAL_S = 1.2    # throttle interim transcriptions


def _transcribe_pcm_frames(whisper_model, frames: list[bytes], beam_size: int = 5) -> str:
    if not frames:
        return ""
    pcm_audio = b"".join(frames)
    audio_np = np.frombuffer(pcm_audio, dtype=np.int16).astype(np.float32) / 32768.0
    if len(audio_np) < SAMPLE_RATE * 0.2:  # less than 200 ms
        return ""
    try:
        segments, _ = whisper_model.transcribe(
            audio_np,
            language="en",
            beam_size=beam_size,
            # Anti-hallucination: don't carry context across independent segments
            # (prevents repetition loops), and drop low-confidence / silent audio
            # instead of inventing words.
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            log_prob_threshold=-1.0,
            temperature=0.0,
            word_timestamps=False,
        )
        return " ".join(s.text.strip() for s in segments).strip()
    except Exception:
        return ""


@router.websocket("/ws/transcribe")
async def transcribe_ws(websocket: WebSocket):
    await websocket.accept()
    ffmpeg_bin = get_ffmpeg_binary()
    whisper_model = get_whisper_model()
    vad = webrtcvad.Vad(2)
    loop = asyncio.get_running_loop()

    proc = None
    reader_task = None
    pcm_queue: asyncio.Queue = asyncio.Queue()
    stop_flag = asyncio.Event()

    async def stop_decoder():
        nonlocal proc, reader_task
        if reader_task:
            reader_task.cancel()
            reader_task = None
        if proc:
            try:
                if proc.stdin:
                    proc.stdin.close()
            except Exception:
                pass
            try:
                if proc.returncode is None:
                    proc.kill()
            except Exception:
                pass
            proc = None

    async def start_decoder():
        nonlocal proc, reader_task
        await stop_decoder()
        proc = await asyncio.create_subprocess_exec(
            ffmpeg_bin,
            "-fflags", "nobuffer",
            "-flags", "low_delay",
            "-i", "pipe:0",
            "-ar", str(SAMPLE_RATE),
            "-ac", "1",
            "-f", "s16le",
            "pipe:1",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        local_proc = proc

        async def reader():
            buffer = bytearray()
            try:
                while True:
                    chunk = await local_proc.stdout.read(FRAME_BYTES * 2)
                    if not chunk:
                        break
                    buffer.extend(chunk)
                    while len(buffer) >= FRAME_BYTES:
                        frame = bytes(buffer[:FRAME_BYTES])
                        del buffer[:FRAME_BYTES]
                        await pcm_queue.put(frame)
            except asyncio.CancelledError:
                pass
            except Exception:
                pass

        reader_task = asyncio.create_task(reader())

    async def consumer():
        speech_frames: list[bytes] = []
        silence_count = 0
        last_partial = 0.0
        try:
            while not stop_flag.is_set():
                try:
                    frame = await asyncio.wait_for(pcm_queue.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue

                try:
                    is_speech = vad.is_speech(frame, SAMPLE_RATE)
                except Exception:
                    is_speech = False

                if is_speech:
                    speech_frames.append(frame)
                    silence_count = 0
                else:
                    silence_count += 1
                    if speech_frames:
                        speech_frames.append(frame)  # keep trailing silence

                should_flush = (silence_count >= SILENCE_THRESHOLD and speech_frames) or (
                    len(speech_frames) >= MAX_SPEECH_FRAMES
                )

                if should_flush:
                    # Committed segment → accurate beam search.
                    text = await loop.run_in_executor(
                        None, _transcribe_pcm_frames, whisper_model, speech_frames, 5
                    )
                    if text:
                        await websocket.send_text(json.dumps({"isFinal": True, "final": text}))
                    speech_frames = []
                    silence_count = 0
                    last_partial = 0.0
                else:
                    now = loop.time()
                    if (
                        speech_frames
                        and len(speech_frames) >= PARTIAL_MIN_FRAMES
                        and (now - last_partial) > PARTIAL_INTERVAL_S
                    ):
                        last_partial = now
                        # Interim preview → fast greedy decoding.
                        ptext = await loop.run_in_executor(
                            None, _transcribe_pcm_frames, whisper_model, speech_frames, 1
                        )
                        if ptext:
                            await websocket.send_text(
                                json.dumps({"isFinal": False, "partial": ptext})
                            )
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    consumer_task = asyncio.create_task(consumer())

    try:
        await start_decoder()
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break

            data = msg.get("bytes")
            if data is not None:
                if proc is None:
                    await start_decoder()
                try:
                    if proc and proc.stdin:
                        proc.stdin.write(data)
                        await proc.stdin.drain()
                except Exception:
                    # Decoder died (e.g. broken pipe) — restart it.
                    await start_decoder()
                continue

            text = msg.get("text")
            if text:
                try:
                    ctrl = json.loads(text)
                except Exception:
                    ctrl = {}
                if ctrl.get("type") == "reset":
                    await start_decoder()
                elif ctrl.get("type") == "end":
                    break
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        stop_flag.set()
        consumer_task.cancel()
        await stop_decoder()
        try:
            await websocket.close()
        except Exception:
            pass
