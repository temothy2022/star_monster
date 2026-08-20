export type PlaybackHandle = {
  done: Promise<void>;
  cancel: () => void;
};

export type PlaybackFactory = () => PlaybackHandle;

const managedHtmlAudios = new Map<HTMLAudioElement, () => void>();
const knownHtmlAudios = new Set<HTMLAudioElement>();
const managedAudioContexts = new Map<AudioContext, (() => void) | undefined>();
const detachedAudioSources = new WeakMap<HTMLAudioElement, string>();
const mediaSessionActions = [
  "play",
  "pause",
  "seekbackward",
  "seekforward",
  "previoustrack",
  "nexttrack",
  "skipad",
  "stop",
] as const;

/** Safari can keep a stale webpage media control after an audio element ends. */
export function clearWebMediaSession() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const mediaSession = navigator.mediaSession;
  try {
    mediaSession.metadata = null;
  } catch {
    // Some iPadOS releases expose Media Session but reject metadata cleanup.
  }
  try {
    mediaSession.playbackState = "none";
  } catch {
    // Older Safari versions may expose Media Session but reject state cleanup.
  }
  for (const action of mediaSessionActions) {
    try {
      mediaSession.setActionHandler(action, null);
    } catch {
      // Some Safari versions reject unsupported action names.
    }
  }
}

/**
 * Keep preloaded audio in the same lifecycle as actively playing audio.
 *
 * iPad Safari can retain a lock-screen media item while a paused audio
 * element still has a source. Caches therefore need to be detached too,
 * not only the element that is currently playing.
 */
export function registerManagedHtmlAudio(audio: HTMLAudioElement) {
  knownHtmlAudios.add(audio);
  return audio;
}

export function createManagedHtmlAudio(source?: string) {
  const audio = registerManagedHtmlAudio(new Audio());
  if (source) audio.src = source;
  return audio;
}

function detachHtmlAudio(audio: HTMLAudioElement) {
  const source = audio.currentSrc || audio.src;
  if (source) detachedAudioSources.set(audio, source);
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // Ignore elements whose media resource has already been released.
  }
  try {
    audio.removeAttribute("src");
    audio.load();
  } catch {
    // Releasing a media source is best-effort on older Safari versions.
  }
}

function restoreHtmlAudio(audio: HTMLAudioElement) {
  if (audio.getAttribute("src")) return;
  const source = detachedAudioSources.get(audio);
  if (!source) return;
  audio.src = source;
  audio.load();
}

/** Register short-lived Web Audio contexts so they are suspended on lock/background. */
export function registerManagedAudioContext(
  context: AudioContext,
  cleanup?: () => void,
) {
  managedAudioContexts.set(context, cleanup);
  return context;
}

/** Stop audio created by the shared playback helpers when leaving a feature. */
export function stopManagedHtmlAudio() {
  for (const stop of [...managedHtmlAudios.values()]) {
    stop();
  }
  managedHtmlAudios.clear();

  // Also release cached/preloaded media and any native media element that a
  // feature may have rendered without going through the playback helper.
  const documentMedia = typeof document === "undefined"
    ? []
    : Array.from(document.querySelectorAll<HTMLMediaElement>("audio,video"));
  const media = new Set<HTMLMediaElement>([
    ...knownHtmlAudios,
    ...documentMedia,
  ]);
  for (const element of media) {
    element.pause();
    if (element instanceof HTMLAudioElement) detachHtmlAudio(element);
    else {
      try {
        element.removeAttribute("src");
        element.load();
      } catch {
        // Releasing a media source is best-effort on older Safari versions.
      }
    }
  }
  knownHtmlAudios.clear();

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  for (const [context, cleanup] of managedAudioContexts) {
    cleanup?.();
    if (context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
  }
  managedAudioContexts.clear();
  clearWebMediaSession();
}

/** Install one app-wide guard against stale iPad lock-screen media controls. */
export function installWebMediaCleanup() {
  const stopWhenHidden = () => {
    if (document.visibilityState === "hidden") stopManagedHtmlAudio();
  };
  const stopWhenFrozen = () => stopManagedHtmlAudio();
  window.addEventListener("pagehide", stopManagedHtmlAudio);
  window.addEventListener("beforeunload", stopManagedHtmlAudio);
  window.addEventListener("freeze", stopWhenFrozen);
  document.addEventListener("visibilitychange", stopWhenHidden);

  return () => {
    window.removeEventListener("pagehide", stopManagedHtmlAudio);
    window.removeEventListener("beforeunload", stopManagedHtmlAudio);
    window.removeEventListener("freeze", stopWhenFrozen);
    document.removeEventListener("visibilitychange", stopWhenHidden);
    stopManagedHtmlAudio();
  };
}

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
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      this.pending = null;
      clearWebMediaSession();
      this.onPlayingChange?.(false);
      return;
    }
    const next = this.pending;
    this.pending = null;
    if (next && !this.disposed) {
      this.start(next);
      return;
    }
    clearWebMediaSession();
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
    managedHtmlAudios.delete(audio);
    detachHtmlAudio(audio);
    clearWebMediaSession();
    if (reason) rejectDone(reason);
    else resolveDone();
  };
  const handleEnded = () => settle();
  const handleError = () => settle(new Error("Audio playback failed"));

  registerManagedHtmlAudio(audio);
  restoreHtmlAudio(audio);
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // Safari can reject seeking while a detached source is being restored.
  }
  managedHtmlAudios.set(audio, () => settle());
  audio.addEventListener("ended", handleEnded);
  audio.addEventListener("error", handleError);
  void audio.play().catch(settle);

  return {
    done,
    cancel: () => {
      if (settled) return;
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

export function createSequentialPlayback(
  factories: PlaybackFactory[],
  pauseMs = 0,
): PlaybackHandle {
  let cancelled = false;
  let active: PlaybackHandle | null = null;
  let pauseTimer: number | null = null;
  let finishPause: (() => void) | null = null;

  const wait = () => new Promise<void>((resolve) => {
    if (pauseMs <= 0 || cancelled) {
      resolve();
      return;
    }
    finishPause = resolve;
    pauseTimer = window.setTimeout(() => {
      pauseTimer = null;
      finishPause = null;
      resolve();
    }, pauseMs);
  });

  const done = (async () => {
    for (let index = 0; index < factories.length && !cancelled; index += 1) {
      active = factories[index]?.() ?? null;
      await active?.done.catch(() => undefined);
      active = null;
      if (index < factories.length - 1) await wait();
    }
  })();

  return {
    done,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      active?.cancel();
      active = null;
      if (pauseTimer !== null) window.clearTimeout(pauseTimer);
      pauseTimer = null;
      finishPause?.();
      finishPause = null;
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
