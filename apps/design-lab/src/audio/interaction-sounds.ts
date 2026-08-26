import {
  registerManagedAudioContext,
  SinglePendingPlaybackQueue,
  type PlaybackHandle,
} from "./queued-playback";

type SoundKind = "correct" | "wrong" | "complete" | "complete-bonus";

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;
let activeCleanup: (() => void) | null = null;
let lastCompletionAt = 0;

const playbackQueue = new SinglePendingPlaybackQueue();

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const AudioContextConstructor =
    window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  if (!audioContext || audioContext.state === "closed") {
    audioContext = registerManagedAudioContext(
      new AudioContextConstructor(),
      () => {
        activeCleanup?.();
        activeCleanup = null;
      },
    );
  }
  return audioContext;
}

function scheduleTone(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const attack = Math.min(0.025, duration * 0.18);
  const end = start + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(end + 0.03);
}

function scheduleSound(
  context: AudioContext,
  kind: SoundKind,
  master: GainNode,
) {
  const start = context.currentTime + 0.015;
  master.gain.setValueAtTime(0.92, start);
  master.connect(context.destination);

  if (kind === "correct") {
    scheduleTone(context, master, 523.25, start, 0.13, 0.13);
    scheduleTone(context, master, 659.25, start + 0.1, 0.15, 0.12);
    scheduleTone(context, master, 783.99, start + 0.2, 0.22, 0.11);
    return 0.48;
  }

  if (kind === "wrong") {
    scheduleTone(context, master, 311.13, start, 0.16, 0.1, "triangle");
    scheduleTone(context, master, 233.08, start + 0.13, 0.28, 0.09, "triangle");
    return 0.5;
  }

  // A bright, short reward chime that remains audible on iPad speakers.
  scheduleTone(context, master, 392, start, 0.22, 0.08, "triangle");
  scheduleTone(context, master, 523.25, start + 0.12, 0.24, 0.1, "triangle");
  scheduleTone(context, master, 659.25, start + 0.24, 0.28, 0.11, "triangle");
  scheduleTone(context, master, 783.99, start + 0.4, 0.42, 0.1, "sine");
  scheduleTone(context, master, 1046.5, start + 0.52, 0.46, 0.07, "sine");
  if (kind === "complete-bonus") {
    scheduleTone(context, master, 1318.51, start + 0.68, 0.28, 0.06, "sine");
    scheduleTone(context, master, 1567.98, start + 0.8, 0.32, 0.05, "sine");
  }
  return 1.12;
}

function createSoundPlayback(kind: SoundKind): PlaybackHandle {
  let settlePlayback: (() => void) | null = null;
  let cancelPlayback: (() => void) | null = null;
  const done = new Promise<void>((resolve) => {
    let settled = false;
    let timer: number | null = null;
    let master: GainNode | null = null;
    let cancelled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) window.clearTimeout(timer);
      master?.disconnect();
      if (activeCleanup === settle) activeCleanup = null;
      resolve();
    };

    settlePlayback = settle;
    cancelPlayback = () => {
      cancelled = true;
      settle();
    };
    activeCleanup = settle;

    const context = getAudioContext();
    if (!context) {
      settle();
      return;
    }

    const start = () => {
      if (cancelled || context.state !== "running") {
        settle();
        return;
      }
      master = context.createGain();
      const duration = scheduleSound(context, kind, master);
      timer = window.setTimeout(settle, Math.ceil((duration + 0.08) * 1000));
    };

    if (context.state === "suspended") {
      void context.resume().then(start).catch(settle);
    } else {
      start();
    }
  });

  return { done, cancel: () => (cancelPlayback ?? settlePlayback)?.() };
}

/** Resume Web Audio during a user gesture before a later API response. */
export function prepareInteractionSounds() {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

export function playAnswerSound(correct: boolean) {
  prepareInteractionSounds();
  playbackQueue.enqueue(() => createSoundPlayback(correct ? "correct" : "wrong"));
}

export function playTaskCompleteSound({ bonus = false }: { bonus?: boolean } = {}) {
  // React StrictMode and a fast API retry must not produce duplicate reward sounds.
  const now = Date.now();
  if (now - lastCompletionAt < 1200) return;
  lastCompletionAt = now;

  prepareInteractionSounds();
  playbackQueue.enqueue(() => createSoundPlayback(bonus ? "complete-bonus" : "complete"));
}
