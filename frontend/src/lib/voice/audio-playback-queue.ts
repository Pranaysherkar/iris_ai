/** Sequential audio playback queue for streamed TTS chunks. */

type QueuedClip = {
  blob: Blob;
  onStart?: () => void;
};

export class AudioPlaybackQueue {
  private queue: QueuedClip[] = [];
  private playing = false;
  private muted = false;
  private currentUrl: string | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private idleWaiters: Array<() => void> = [];
  private onPlayingChange: ((playing: boolean) => void) | null = null;

  /** Notify UI when real TTS audio starts/stops (not merely when a reply is streaming). */
  setPlayingChangeListener(cb: ((playing: boolean) => void) | null): void {
    this.onPlayingChange = cb;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /** When muted, new clips are dropped (used to stop TTS while text keeps streaming). */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  isMuted(): boolean {
    return this.muted;
  }

  enqueueBase64(base64: string, mime: string, onStart?: () => void): void {
    if (this.muted) return;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    this.queue.push({ blob: new Blob([bytes], { type: mime }), onStart });
    void this.playNext();
  }

  whenIdle(): Promise<void> {
    if (!this.playing && this.queue.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  private resolveIdleWaiters(): void {
    if (this.playing || this.queue.length > 0) return;
    const waiters = this.idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  private setPlayingState(next: boolean): void {
    if (this.playing === next) return;
    this.playing = next;
    try {
      this.onPlayingChange?.(next);
    } catch {
      /* ignore UI callback errors */
    }
  }

  stop(): void {
    this.queue = [];
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
    this.setPlayingState(false);
    this.resolveIdleWaiters();
  }

  private async playNext(): Promise<void> {
    if (this.playing || this.queue.length === 0) return;
    this.setPlayingState(true);
    const item = this.queue.shift();
    if (!item) {
      this.setPlayingState(false);
      return;
    }

    const url = URL.createObjectURL(item.blob);
    this.currentUrl = url;
    const audio = new Audio(url);
    this.currentAudio = audio;

    await new Promise<void>((resolve) => {
      const cleanup = () => {
        URL.revokeObjectURL(url);
        if (this.currentUrl === url) this.currentUrl = null;
        if (this.currentAudio === audio) this.currentAudio = null;
        // Avoid UI flicker between consecutive TTS clips.
        this.playing = false;
        const hasMore = this.queue.length > 0;
        if (!hasMore) {
          try {
            this.onPlayingChange?.(false);
          } catch {
            /* ignore */
          }
        }
        resolve();
        void this.playNext();
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      try {
        item.onStart?.();
      } catch {
        /* ignore UI callback errors */
      }
      void audio.play().catch(cleanup);
    });
    this.resolveIdleWaiters();
  }
}

