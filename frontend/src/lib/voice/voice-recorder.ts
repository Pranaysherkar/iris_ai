/** Browser microphone capture for voice chat turns, with optional silence (VAD) auto-stop. */

export type VoiceRecorderStopResult = {
  blob: Blob;
  mimeType: string;
};

export type VoiceRecorderStartOptions = {
  /** After speech is detected, silence this long ends the turn (default 2500ms). */
  silenceMs?: number;
  /** RMS threshold 0–1 for “speech” (default ~0.012). */
  speechRmsThreshold?: number;
  /** Fired once when end-of-utterance silence is detected. */
  onSilence?: () => void;
};

const DEFAULT_SILENCE_MS = 2500;
const DEFAULT_SPEECH_RMS = 0.012;

export class VoiceRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadRaf: number | null = null;
  private silenceFired = false;
  private onSilence: (() => void) | null = null;

  async start(options: VoiceRecorderStartOptions = {}): Promise<void> {
    if (this.mediaRecorder?.state === "recording") return;

    this.chunks = [];
    this.silenceFired = false;
    this.onSilence = options.onSilence ?? null;
    const silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
    const speechRms = options.speechRmsThreshold ?? DEFAULT_SPEECH_RMS;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    });

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.mediaStream, { mimeType })
      : new MediaRecorder(this.mediaStream);

    this.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) this.chunks.push(ev.data);
    };

    this.mediaRecorder.start(250);
    await this.startVad(silenceMs, speechRms);
  }

  async stop(): Promise<VoiceRecorderStopResult> {
    this.stopVad();
    const recorder = this.mediaRecorder;
    if (!recorder || recorder.state === "inactive") {
      throw new Error("Recorder is not active.");
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        resolve(new Blob(this.chunks, { type }));
      };
      recorder.onerror = () => reject(new Error("Recording failed."));
      recorder.stop();
    });

    this.cleanup();
    return { blob, mimeType: blob.type || "audio/webm" };
  }

  cancel(): void {
    this.stopVad();
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  get isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  private async startVad(silenceMs: number, speechRms: number): Promise<void> {
    if (!this.mediaStream || typeof AudioContext === "undefined") return;

    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;

      this.audioContext = new Ctx();
      // Browsers often start AudioContext suspended until a user gesture — mic tap counts.
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume().catch(() => undefined);
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.55;
      source.connect(this.analyser);

      const data = new Uint8Array(this.analyser.fftSize);
      let heardSpeech = false;
      let lastSpeechAt = 0;
      const startedAt = performance.now();

      const tick = () => {
        if (!this.analyser || this.silenceFired) return;
        this.analyser.getByteTimeDomainData(data);

        let sumSq = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / data.length);
        const now = performance.now();

        if (rms >= speechRms) {
          heardSpeech = true;
          lastSpeechAt = now;
        } else if (
          heardSpeech &&
          lastSpeechAt > 0 &&
          now - lastSpeechAt >= silenceMs
        ) {
          this.silenceFired = true;
          // Capture callback BEFORE stopVad clears it (previous bug).
          const cb = this.onSilence;
          this.stopVad();
          cb?.();
          return;
        }

        this.vadRaf = window.requestAnimationFrame(tick);
      };

      this.vadRaf = window.requestAnimationFrame(tick);
    } catch {
      // VAD is best-effort; manual mic tap still works.
    }
  }

  private stopVad(): void {
    if (this.vadRaf != null) {
      window.cancelAnimationFrame(this.vadRaf);
      this.vadRaf = null;
    }
    this.analyser = null;
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
    this.onSilence = null;
  }

  private cleanup(): void {
    this.stopVad();
    this.mediaRecorder = null;
    this.chunks = [];
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }
  }
}
