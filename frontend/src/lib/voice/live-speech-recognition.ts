/** Browser live transcription (Web Speech API) for low-latency voice UX. */

export type LiveSpeechHandlers = {
  onInterim: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
};

export class LiveSpeechRecognizer {
  private recognition: SpeechRecognition | null = null;
  private accumulated = "";
  private handlers: LiveSpeechHandlers | null = null;
  private active = false;

  static supported(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  }

  start(handlers: LiveSpeechHandlers): boolean {
    if (!LiveSpeechRecognizer.supported()) return false;

    this.cancel();
    this.accumulated = "";
    this.handlers = handlers;
    this.active = true;

    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition!;
    const recognition = new Ctor();
    this.recognition = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (!text) continue;
        if (result.isFinal) {
          this.accumulated = `${this.accumulated} ${text}`.trim();
          handlers.onFinal?.(this.accumulated);
        } else {
          interim += text;
        }
      }
      const display = interim
        ? `${this.accumulated} ${interim}`.trim()
        : this.accumulated;
      if (display) handlers.onInterim(display);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      handlers.onError?.(event.error);
    };

    recognition.onend = () => {
      if (!this.active || this.recognition !== recognition) return;
      try {
        recognition.start();
      } catch {
        /* already started or stopped */
      }
    };

    try {
      recognition.start();
      return true;
    } catch {
      this.active = false;
      this.recognition = null;
      return false;
    }
  }

  stop(): string {
    this.active = false;
    const recognition = this.recognition;
    this.recognition = null;
    this.handlers = null;
    try {
      recognition?.stop();
    } catch {
      /* ignore */
    }
    return this.accumulated.trim();
  }

  cancel(): void {
    this.active = false;
    try {
      this.recognition?.abort();
    } catch {
      /* ignore */
    }
    this.recognition = null;
    this.handlers = null;
    this.accumulated = "";
  }
}
