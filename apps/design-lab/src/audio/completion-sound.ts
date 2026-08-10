import { registerManagedAudioContext } from "./queued-playback";

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const AudioContextConstructor =
    window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  if (!audioContext || audioContext.state === "closed") {
    audioContext = registerManagedAudioContext(new AudioContextConstructor());
  }
  return audioContext;
}

function scheduleNote(
  context: AudioContext,
  destination: AudioNode,
  {
    frequency,
    start,
    duration,
    volume,
    type = "triangle",
  }: {
    frequency: number;
    start: number;
    duration: number;
    volume: number;
    type?: OscillatorType;
  },
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const attack = Math.min(0.025, duration * 0.15);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function scheduleCelebration(context: AudioContext, bonus: boolean) {
  const now = context.currentTime + 0.025;
  const master = context.createGain();
  master.gain.setValueAtTime(0.9, now);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
  master.connect(context.destination);

  scheduleNote(context, master, {
    frequency: 261.63,
    start: now,
    duration: 0.62,
    volume: 0.028,
    type: "sine",
  });

  [
    { frequency: 523.25, offset: 0, duration: 0.42, volume: 0.052 },
    { frequency: 659.25, offset: 0.11, duration: 0.44, volume: 0.05 },
    { frequency: 783.99, offset: 0.22, duration: 0.5, volume: 0.048 },
    { frequency: 1046.5, offset: 0.39, duration: 0.82, volume: 0.055 },
  ].forEach((note, index) => {
    scheduleNote(context, master, {
      frequency: note.frequency,
      start: now + note.offset,
      duration: note.duration,
      volume: note.volume,
      type: index === 3 ? "sine" : "triangle",
    });
  });

  const sparkleNotes = bonus
    ? [1318.51, 1567.98, 2093]
    : [1318.51, 1567.98];
  sparkleNotes.forEach((frequency, index) => {
    scheduleNote(context, master, {
      frequency,
      start: now + 0.52 + index * 0.12,
      duration: 0.3,
      volume: 0.018,
      type: "sine",
    });
  });
}

/**
 * iPad Safari requires AudioContext.resume() inside a user gesture.
 * Call this synchronously when the child taps the completion button.
 */
export function prepareCompletionSound() {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

export function playCompletionSound({ bonus = false } = {}) {
  const context = getAudioContext();
  if (!context) return;

  // React StrictMode mounts effects twice in development.
  const now = Date.now();
  if (now - lastPlayedAt < 1200) return;
  lastPlayedAt = now;

  const play = () => {
    if (context.state === "running") scheduleCelebration(context, bonus);
  };

  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}
