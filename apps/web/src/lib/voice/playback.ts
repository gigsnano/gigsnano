/**
 * Ordered audio playback with an instant stop, for barge-in.
 *
 * Sentences arrive as separate synthesis responses and must play in order and
 * never overlap. `stop()` has to be immediate and total: when the user talks over
 * the agent, a sentence that surfaces a moment later — after they have already
 * interrupted — reads as the assistant ignoring them.
 *
 * The sink is injected because jsdom has no working AudioContext, and because
 * the queue's ordering behaviour is worth testing on its own.
 */

export interface IAudioSink {
  /** Resolves when the chunk has finished playing. */
  play(chunk: ArrayBuffer): Promise<void>;
  /** Cut the currently sounding audio immediately. */
  stop(): void;
}

export class PlaybackQueue {
  private queue: ArrayBuffer[] = [];
  private playing = false;
  /** Bumped by stop(); an in-flight play() belonging to an older epoch is ignored
   *  when it resolves, which is what stops a cut-off sentence from continuing. */
  private epoch = 0;

  constructor(private readonly sink: IAudioSink) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  get pending(): number {
    return this.queue.length;
  }

  enqueue(chunk: ArrayBuffer): void {
    this.queue.push(chunk);
    if (!this.playing) this.drain(this.epoch);
  }

  stop(): void {
    this.epoch += 1;
    this.queue = [];
    this.playing = false;
    this.sink.stop();
  }

  private drain(epoch: number): void {
    const next = this.queue.shift();
    if (next === undefined) {
      if (epoch === this.epoch) this.playing = false;
      return;
    }
    this.playing = true;
    // .then/.catch rather than try/finally: the React Compiler cannot lower a
    // try{}finally{} without a catch, and react-doctor flags it.
    this.sink
      .play(next)
      .catch(() => undefined)
      .then(() => {
        if (epoch !== this.epoch) return; // stopped while this chunk was sounding
        this.drain(epoch);
      });
  }
}

/** The real sink. Not unit-tested — it is a thin wrapper over Web Audio. */
export function createAudioSink(context: AudioContext): IAudioSink {
  let current: AudioBufferSourceNode | null = null;
  /** Bumped by stop(); an in-flight decode is discarded if generation changed. */
  let generation = 0;
  return {
    async play(chunk) {
      const gen = generation;
      const buffer = await context.decodeAudioData(chunk.slice(0));
      if (gen !== generation) return; // stop() was called; abandon this decode
      await new Promise<void>((resolve) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = () => {
          current = null;
          resolve();
        };
        current = source;
        source.start();
      });
    },
    stop() {
      generation += 1;
      current?.stop();
      current = null;
    },
  };
}
