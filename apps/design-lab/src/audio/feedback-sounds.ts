let audioContext: AudioContext | null = null;

function context() {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function tone(
  audio: AudioContext,
  frequency: number,
  startsIn: number,
  duration: number,
  volume: number,
) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const startsAt = audio.currentTime + startsIn;
  const endsAt = startsAt + duration;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(startsAt);
  oscillator.stop(endsAt + 0.02);
}

export function playAnswerSound(correct: boolean) {
  try {
    const audio = context();
    if (correct) {
      tone(audio, 523.25, 0, 0.14, 0.11);
      tone(audio, 659.25, 0.11, 0.15, 0.1);
      tone(audio, 783.99, 0.22, 0.2, 0.09);
    } else {
      tone(audio, 293.66, 0, 0.18, 0.08);
      tone(audio, 220, 0.15, 0.28, 0.07);
    }
  } catch {
    // Audio feedback is optional when the browser blocks Web Audio.
  }
}
