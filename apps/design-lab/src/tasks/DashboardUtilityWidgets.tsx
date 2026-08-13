import { useEffect, useRef, useState } from "react";
import postcardStack from "@star-monsters/assets/images/task-dashboard/postcard-stack.webp";
import spaceTimer from "@star-monsters/assets/images/task-dashboard/space-timer.webp";
import { prepareDashboardAlarmAudio, startDashboardAlarm, stopDashboardAlarm } from "../audio/dashboard-alarm";
import type { PetTrip } from "../api/child-api";
import type { ChildRoute } from "../components/ChildBottomNav";

const TIMER_STORAGE_KEY = "star-monsters-dashboard-countdown-v1";
const TIMER_PRESETS = [5, 10, 15, 30, 45, 60] as const;

type TimerState =
  | { status: "idle" }
  | { status: "running"; durationMs: number; endAt: number }
  | { status: "paused"; durationMs: number; remainingMs: number }
  | { status: "finished"; durationMs: number };

function readTimerState(): TimerState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TIMER_STORAGE_KEY) ?? "null") as Partial<TimerState> | null;
    if (!parsed || !parsed.status) return { status: "idle" };
    if (parsed.status === "running" && typeof parsed.durationMs === "number" && typeof parsed.endAt === "number") {
      return parsed.endAt <= Date.now()
        ? { status: "finished", durationMs: parsed.durationMs }
        : { status: "running", durationMs: parsed.durationMs, endAt: parsed.endAt };
    }
    if (parsed.status === "paused" && typeof parsed.durationMs === "number" && typeof parsed.remainingMs === "number") {
      return { status: "paused", durationMs: parsed.durationMs, remainingMs: parsed.remainingMs };
    }
    if (parsed.status === "finished" && typeof parsed.durationMs === "number") {
      return { status: "finished", durationMs: parsed.durationMs };
    }
  } catch {
    // A countdown remains usable when storage is unavailable or was cleared.
  }
  return { status: "idle" };
}

function writeTimerState(state: TimerState) {
  try {
    if (state.status === "idle") window.localStorage.removeItem(TIMER_STORAGE_KEY);
    else window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is optional in private browsing.
  }
}

function formatRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PostcardCarouselWidget({
  postcards,
  onNavigate,
}: {
  postcards: PetTrip[] | null | undefined;
  onNavigate?: (route: ChildRoute) => void;
}) {
  const [index, setIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const scrollReleaseTimerRef = useRef<number | null>(null);
  const postcardIds = postcards?.map((postcard) => postcard.id).join("|") ?? "";

  useEffect(() => {
    if (!postcards?.length || postcards.length < 2) return;
    setIndex((current) => Math.min(current, postcards.length - 1));
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % postcards.length);
    }, 5_500);
    return () => window.clearInterval(timer);
  }, [postcardIds, postcards?.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    programmaticScrollRef.current = true;
    if (scrollReleaseTimerRef.current !== null) window.clearTimeout(scrollReleaseTimerRef.current);
    viewport.scrollTo({
      left: index * viewport.clientWidth,
      behavior: "smooth",
    });
    scrollReleaseTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
      scrollReleaseTimerRef.current = null;
    }, 700);
    return () => {
      if (scrollReleaseTimerRef.current !== null) window.clearTimeout(scrollReleaseTimerRef.current);
      scrollReleaseTimerRef.current = null;
      programmaticScrollRef.current = false;
    };
  }, [index]);

  function updateIndexFromScroll() {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth === 0 || programmaticScrollRef.current) return;
    setIndex(Math.max(0, Math.min((postcards?.length ?? 1) - 1, Math.round(viewport.scrollLeft / viewport.clientWidth))));
  }

  if (postcards === undefined) {
    return <div className="task-widget-postcards task-widget-postcards--state"><img src={postcardStack} alt="" /><strong>正在翻找旅行收藏</strong></div>;
  }
  if (postcards === null) {
    return <div className="task-widget-postcards task-widget-postcards--state"><img src={postcardStack} alt="" /><strong>明信片暂时没有打开</strong></div>;
  }
  if (postcards.length === 0) {
    return <button className="task-widget-postcards task-widget-postcards--state" type="button" onClick={() => onNavigate?.("pet-growth")}><img src={postcardStack} alt="两张等待收藏的旅行明信片" /><span><small>旅行明信片</small><strong>第一张收藏正在远方等你</strong></span></button>;
  }

  return (
    <div className="task-widget-postcards">
      <header><span><small>星宠的旅行收藏</small><strong>{postcards.length} 张明信片</strong></span><button type="button" onClick={() => onNavigate?.("pet-growth")}>打开卡册</button></header>
      <div className="task-widget-postcards__viewport" ref={viewportRef} onScroll={updateIndexFromScroll}>
        <div className="task-widget-postcards__track">
          {postcards.map((postcard) => (
            <button type="button" key={postcard.id} onClick={() => onNavigate?.("pet-growth")} aria-label={`查看来自${postcard.destinationName}的明信片`}>
              <img src={postcard.imageUrl} alt={postcard.destinationName} loading="lazy" decoding="async" />
              <span><small>{postcard.city} · {postcard.country}</small><strong>{postcard.destinationName}</strong></span>
            </button>
          ))}
        </div>
      </div>
      {postcards.length > 1 && (
        <div className="task-widget-postcards__pages" aria-label={`第 ${index + 1} 张，共 ${postcards.length} 张`}>
          {postcards.length <= 8
            ? postcards.map((postcard, page) => <button type="button" className={page === index ? "is-active" : ""} key={postcard.id} aria-label={`显示第 ${page + 1} 张明信片`} onClick={() => setIndex(page)} />)
            : <span>{index + 1} / {postcards.length}</span>}
        </div>
      )}
    </div>
  );
}

export function CountdownTimerWidget() {
  const [timer, setTimer] = useState<TimerState>(readTimerState);
  const [now, setNow] = useState(Date.now);
  const [alarmActive, setAlarmActive] = useState(false);
  const announcedRef = useRef(false);
  const alarmVisualTimeoutRef = useRef<number | null>(null);
  const remainingMs = timer.status === "running"
    ? Math.max(0, timer.endAt - now)
    : timer.status === "paused"
      ? timer.remainingMs
      : 0;
  const durationMs = timer.status === "idle" ? 0 : timer.durationMs;
  const progress = durationMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / durationMs)) : 0;
  const ringOffset = 100 - progress * 100;
  const remainingProgress = durationMs > 0 ? Math.min(1, Math.max(0, remainingMs / durationMs)) : 0;

  useEffect(() => {
    writeTimerState(timer);
  }, [timer]);

  useEffect(() => {
    if (timer.status !== "running") return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [timer.status]);

  useEffect(() => {
    if (timer.status !== "running" || remainingMs > 0) return;
    setTimer({ status: "finished", durationMs: timer.durationMs });
    if (!announcedRef.current) {
      announcedRef.current = true;
      setAlarmActive(true);
      startDashboardAlarm();
      if (alarmVisualTimeoutRef.current !== null) window.clearTimeout(alarmVisualTimeoutRef.current);
      alarmVisualTimeoutRef.current = window.setTimeout(() => {
        alarmVisualTimeoutRef.current = null;
        setAlarmActive(false);
      }, 20_000);
      navigator.vibrate?.([180, 80, 180]);
    }
  }, [remainingMs, timer]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        stopDashboardAlarm();
        if (alarmVisualTimeoutRef.current !== null) window.clearTimeout(alarmVisualTimeoutRef.current);
        alarmVisualTimeoutRef.current = null;
        setAlarmActive(false);
      }
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      stopDashboardAlarm();
      if (alarmVisualTimeoutRef.current !== null) window.clearTimeout(alarmVisualTimeoutRef.current);
    };
  }, []);

  function stopAlarm() {
    stopDashboardAlarm();
    if (alarmVisualTimeoutRef.current !== null) window.clearTimeout(alarmVisualTimeoutRef.current);
    alarmVisualTimeoutRef.current = null;
    setAlarmActive(false);
  }

  function start(minutes: number) {
    stopAlarm();
    prepareDashboardAlarmAudio();
    announcedRef.current = false;
    const nextDuration = Math.min(60, Math.max(1, minutes)) * 60_000;
    setNow(Date.now());
    setTimer({ status: "running", durationMs: nextDuration, endAt: Date.now() + nextDuration });
  }

  function pause() {
    if (timer.status !== "running") return;
    setTimer({ status: "paused", durationMs: timer.durationMs, remainingMs: Math.max(0, timer.endAt - Date.now()) });
  }

  function resume() {
    if (timer.status !== "paused") return;
    prepareDashboardAlarmAudio();
    announcedRef.current = false;
    setTimer({ status: "running", durationMs: timer.durationMs, endAt: Date.now() + timer.remainingMs });
  }

  const active = timer.status === "running" || timer.status === "paused";
  const displayRemaining = timer.status === "idle" ? "--:--" : formatRemaining(remainingMs);
  return (
    <div className={`task-widget-timer task-widget-timer--${timer.status}${alarmActive ? " task-widget-timer--ringing" : ""}`} aria-live="polite">
      <strong className="task-widget-timer__title">倒计时</strong>
      <button
        type="button"
        className="task-widget-timer__face"
        onClick={alarmActive ? stopAlarm : undefined}
        aria-label={timer.status === "finished" ? "停止闹铃" : active ? displayRemaining : "未开始倒计时"}
      >
        <img src={spaceTimer} alt="" />
        <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.75" /><circle className="task-widget-timer__progress" cx="18" cy="18" r="15.75" pathLength="100" style={{ strokeDashoffset: ringOffset }} /></svg>
        <strong className="task-widget-timer__remaining">{displayRemaining}</strong>
      </button>
      <div className="task-widget-timer__progress-bar" role="progressbar" aria-label="倒计时进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1 - remainingProgress) * 100)}>
        <span style={{ width: `${remainingProgress * 100}%` }} />
      </div>
      {timer.status === "idle" ? (
        <div className="task-widget-timer__presets">{TIMER_PRESETS.map((minutes) => <button type="button" key={minutes} onClick={() => start(minutes)}>{minutes}<small>分钟</small></button>)}</div>
      ) : timer.status === "finished" ? (
        <div className="task-widget-timer__controls"><button type="button" onClick={stopAlarm}>停止闹铃</button><button type="button" onClick={() => { stopAlarm(); setTimer({ status: "idle" }); }}>重新设置</button></div>
      ) : (
        <div className="task-widget-timer__controls"><button type="button" onClick={timer.status === "running" ? pause : resume}>{timer.status === "running" ? "暂停" : "继续"}</button><button type="button" onClick={() => { stopAlarm(); setTimer({ status: "idle" }); }}>结束</button></div>
      )}
    </div>
  );
}
