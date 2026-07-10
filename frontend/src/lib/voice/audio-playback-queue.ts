/** Sequential audio playback queue for streamed TTS chunks. */

type QueuedClip = {
  blob: Blob;
  onStart?: () => void;
};

export class AudioPlaybackQueue {
  private queue: QueuedClip[] = [];
  private playing = false;
  private currentUrl: string | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private idleWaiters: Array<() => void> = [];

  enqueueBase64(base64: string, mime: string, onStart?: () => void): void {
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
    this.playing = false;
    this.resolveIdleWaiters();
  }

  private async playNext(): Promise<void> {
    if (this.playing || this.queue.length === 0) return;
    this.playing = true;
    const item = this.queue.shift();
    if (!item) {
      this.playing = false;
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
        this.playing = false;
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
