import { registerManagedAudioContext } from "./queued-playback";

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let alarmContext: AudioContext | null = null;
let alarmInterval: number | null = null;
let alarmTimeout: number | null = null;
let alarmRun = 0;

function getAlarmContext() {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!alarmContext || alarmContext.state === "closed") {
    alarmContext = registerManagedAudioContext(
      new AudioContextConstructor(),
      stopDashboardAlarm,
    );
  }
  return alarmContext;
}

function scheduleTone(context: AudioContext, frequency: number, start: number, duration: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function scheduleAlarmBurst(context: AudioContext) {
  const start = context.currentTime + 0.025;
  scheduleTone(context, 880, start, 0.2);
  scheduleTone(context, 660, start + 0.24, 0.2);
}

function clearAlarmTimers() {
  if (alarmInterval !== null) window.clearInterval(alarmInterval);
  if (alarmTimeout !== null) window.clearTimeout(alarmTimeout);
  alarmInterval = null;
  alarmTimeout = null;
}

export function prepareDashboardAlarmAudio() {
  const context = getAlarmContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

export function stopDashboardAlarm() {
  alarmRun += 1;
  clearAlarmTimers();
  if (alarmContext?.state === "running") {
    void alarmContext.suspend().catch(() => undefined);
  }
}

export function startDashboardAlarm() {
  const context = getAlarmContext();
  if (!context) return;

  clearAlarmTimers();
  const run = ++alarmRun;
  const play = () => {
    if (run !== alarmRun || context.state !== "running") return;
    scheduleAlarmBurst(context);
    alarmInterval = window.setInterval(() => {
      if (run === alarmRun) scheduleAlarmBurst(context);
    }, 900);
    alarmTimeout = window.setTimeout(() => {
      if (run === alarmRun) stopDashboardAlarm();
    }, 20_000);
  };

  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}
