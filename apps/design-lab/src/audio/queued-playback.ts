export type PlaybackHandle = {
  done: Promise<void>;
  cancel: () => void;
};

export type PlaybackFactory = () => PlaybackHandle;

/** Keeps one active playback and, while it runs, at most one pending request. */
export class SinglePendingPlaybackQueue {
  private active: PlaybackHandle | null = null;
  private pending: PlaybackFactory | null = null;
  private disposed = false;

  constructor(private readonly onPlayingChange?: (playing: boolean) => void) {}

  enqueue(factory: PlaybackFactory) {
    if (this.disposed) return;
    if (this.active) {
      this.pending = factory;
      return;
    }
    this.start(factory);
  }

  clear() {
    this.pending = null;
    const active = this.active;
    this.active = null;
    active?.cancel();
    this.onPlayingChange?.(false);
  }

  dispose() {
    this.disposed = true;
    this.clear();
  }

  private start(factory: PlaybackFactory) {
    if (this.disposed) return;

    let playback: PlaybackHandle;
    try {
      playback = factory();
    } catch {
      this.startPendingOrFinish();
      return;
    }

    this.active = playback;
    this.onPlayingChange?.(true);
    void playback.done
      .catch(() => undefined)
      .finally(() => {
        if (this.active !== playback) return;
        this.active = null;
        this.startPendingOrFinish();
      });
  }

  private startPendingOrFinish() {
    const next = this.pending;
    this.pending = null;
    if (next && !this.disposed) {
      this.start(next);
      return;
    }
    this.onPlayingChange?.(false);
  }
}

export function createHtmlAudioPlayback(audio: HTMLAudioElement): PlaybackHandle {
  let settled = false;
  let resolveDone: () => void = () => undefined;
  let rejectDone: (reason?: unknown) => void = () => undefined;

  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const cleanup = () => {
    audio.removeEventListener("ended", handleEnded);
    audio.removeEventListener("error", handleError);
  };
  const settle = (reason?: unknown) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (reason) rejectDone(reason);
    else resolveDone();
  };
  const handleEnded = () => settle();
  const handleError = () => settle(new Error("Audio playback failed"));

  audio.pause();
  audio.currentTime = 0;
  audio.addEventListener("ended", handleEnded);
  audio.addEventListener("error", handleError);
  void audio.play().catch(settle);

  return {
    done,
    cancel: () => {
      if (settled) return;
      audio.pause();
      audio.currentTime = 0;
      settle();
    },
  };
}

export function createDeferredPlayback(
  factory: () => Promise<PlaybackHandle>,
): PlaybackHandle {
  let cancelled = false;
  let active: PlaybackHandle | null = null;
  const done = factory().then((playback) => {
    active = playback;
    if (cancelled) playback.cancel();
    return playback.done;
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      active?.cancel();
    },
  };
}

export function createCallbackPlayback(
  start: (finished: () => void) => () => void,
): PlaybackHandle {
  let settled = false;
  let cleanup: (() => void) | null = null;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const finish = () => {
    if (settled) return;
    settled = true;
    resolveDone();
  };

  try {
    cleanup = start(finish);
  } catch (reason) {
    finish();
    return {
      done: Promise.reject(reason),
      cancel: () => undefined,
    };
  }

  return {
    done,
    cancel: () => {
      if (settled) return;
      cleanup?.();
      finish();
    },
  };
}

export function createSpeechPlayback(
  text: string,
  options: { lang?: string; rate?: number; pitch?: number } = {},
): PlaybackHandle {
  if (!("speechSynthesis" in window)) {
    return {
      done: Promise.reject(new Error("Speech synthesis is unavailable")),
      cancel: () => undefined,
    };
  }

  let settled = false;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.lang ?? "zh-CN";
  utterance.rate = options.rate ?? 0.86;
  utterance.pitch = options.pitch ?? 1;

  const settle = () => {
    if (settled) return;
    settled = true;
    utterance.onend = null;
    utterance.onerror = null;
    resolveDone();
  };
  utterance.onend = settle;
  utterance.onerror = settle;
  window.speechSynthesis.speak(utterance);

  return {
    done,
    cancel: () => {
      if (settled) return;
      window.speechSynthesis.cancel();
      settle();
    },
  };
}

export function createAudioWithSpeechFallback(
  audio: HTMLAudioElement,
  fallbackText: string,
  options?: { lang?: string; rate?: number; pitch?: number },
): PlaybackHandle {
  let cancelled = false;
  let fallback: PlaybackHandle | null = null;
  const primary = createHtmlAudioPlayback(audio);
  const done = primary.done.catch(() => {
    if (cancelled) return;
    fallback = createSpeechPlayback(fallbackText, options);
    return fallback.done;
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      primary.cancel();
      fallback?.cancel();
    },
  };
}
