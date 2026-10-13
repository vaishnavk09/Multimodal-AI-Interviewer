import asyncio
import json
import os
import shutil
import numpy as np
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel
import webrtcvad

router = APIRouter()

# Global whisper model for live streaming — loaded on-demand or at startup
_whisper_tiny = None


def get_whisper_tiny():
    global _whisper_tiny
    if _whisper_tiny is None:
        _whisper_tiny = WhisperModel("tiny", device="cpu", compute_type="int8")
    return _whisper_tiny


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
                        text = transcribe_frames(speech_frames)
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
                    text = transcribe_frames(speech_frames)
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
