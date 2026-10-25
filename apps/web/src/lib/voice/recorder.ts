/**
 * Microphone capture → 16 kHz mono PCM WAV (GIN-491 end-to-end).
 *
 * `MediaRecorder` is the obvious choice and the wrong one here: it produces
 * WebM/Opus, and the Azure recogniser wants RIFF PCM. Transcoding server-side
 * would mean shipping ffmpeg into the API image for one feature.
 *
 * So this taps the raw float samples with a ScriptProcessor, downsamples to
 * 16 kHz, and writes the RIFF header itself. That is ~40 lines and no
 * dependency, against a container format conversion and a native binary.
 *
 * ScriptProcessor is deprecated in favour of AudioWorklet. It is used anyway:
 * AudioWorklet requires serving a separate module file, which Next's bundler
 * makes awkward, and this runs only while a user is actively holding the mic —
 * not on a hot path. Swap it if capture ever moves to always-on.
 */

const TARGET_RATE = 16_000;

export interface IRecorder {
  stop: () => Promise<Blob>;
  /** 0–1, for the level meter. Read on an animation frame. */
  level: () => number;
}

/** An already-open stream/context to record from, instead of opening a new
 *  microphone + AudioContext for this utterance. The hands-free call loop
 *  (`use-voice-call.ts`) already keeps both alive for its own continuous VAD
 *  tap for the whole session — passing them here avoids a second
 *  `getUserMedia` prompt-free-but-still-a-track and a second `AudioContext`
 *  per utterance. Ownership stays with the caller: `stop()` disconnects this
 *  recording's own nodes but does NOT stop the shared tracks or close the
 *  shared context, since the call needs both to keep running afterwards. */
export interface ISharedAudioSource {
  stream: MediaStream;
  context: AudioContext;
}

export async function startRecording(
  deviceId?: string,
  shared?: ISharedAudioSource,
): Promise<IRecorder> {
  const stream =
    shared?.stream ??
    (await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    }));
  const context = shared?.context ?? new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const processor = context.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    // Copy: the underlying buffer is reused by the audio thread, so keeping the
    // reference would leave every chunk holding the same final samples.
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(context.destination);

  const bins = new Uint8Array(analyser.frequencyBinCount);

  return {
    level() {
      analyser.getByteFrequencyData(bins);
      return Math.min(1, bins.reduce((sum, v) => sum + v, 0) / bins.length / 96);
    },
    async stop() {
      processor.disconnect();
      source.disconnect();
      const rate = context.sampleRate;
      // Only tear down the stream/context this call opened itself — a shared
      // source belongs to the caller and must keep running after this one
      // utterance ends.
      if (!shared) {
        stream.getTracks().forEach((track) => track.stop());
        await context.close();
      }
      return encodeWav(downsample(flatten(chunks), rate, TARGET_RATE), TARGET_RATE);
    },
  };
}

function flatten(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function downsample(samples: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    // Average across the source window rather than picking one sample —
    // nearest-neighbour decimation aliases, and aliased speech transcribes badly.
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling: a sample above 1.0 would wrap to a loud click.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}


/** Exported for tests only. The WAV header and the resampler are the two places
 *  a silent corruption would show up as an opaque 400 from the recogniser. */
export const __testables = { downsample, encodeWav };
