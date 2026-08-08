import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  careForPet,
  getPetGrowth,
  purchasePetRoomTheme,
  revealPetTrip,
  selectPetRoomTheme,
  startPetTrip,
  type MascotDialogue,
  type PetDialogueContext,
  type PetGrowthState,
  type PetRoomTheme,
  type PetTravelTier,
  type PetTrip,
} from "../api/child-api";
import { createIdempotencyKey } from "../api/idempotency";
import { reportChildPageReady } from "../api/performance-telemetry";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import {
  ChildBottomNav,
  type ChildRoute,
} from "../components/ChildBottomNav";
import { useMascot } from "../mascots";
import { PLANET_BY_KEY } from "../planets/planet-data";
import returnEnvelope from "@star-monsters/assets/images/pet/pet-return-envelope.webp";
import eatingSound from "@star-monsters/assets/audio/pet/eating.mp3";
import drinkingSound from "@star-monsters/assets/audio/pet/drinking.mp3";
import happyEntrySound from "@star-monsters/assets/audio/pet/happy-entry.mp3";
import postcardArrivedSound from "@star-monsters/assets/audio/pet/postcard-arrived.mp3";
import soundToggleIcon from "@star-monsters/assets/images/pet/sound-toggle.webp";
import {
  createAudioWithSpeechFallback,
  createHtmlAudioPlayback,
  createSpeechPlayback,
  SinglePendingPlaybackQueue,
} from "../audio/queued-playback";

const TIER_COPY: Record<PetTravelTier, { name: string; note: string }> = {
  NEARBY: { name: "附近散步", note: "发现身边的小惊喜" },
  CHINA: { name: "中国旅行", note: "去看看祖国的山河" },
  WORLD: { name: "世界旅行", note: "认识更远的风景" },
};

const CARE_ANIMATION_MS = 3_000;
const ROOM_NOTICE_MS = 2_000;
const PET_SOUND_STORAGE_KEY = "star-monsters:pet-sound-enabled";
const PET_ENTRY_SOUND_DATE_KEY = "star-monsters:pet-entry-sound-date";
const ROOM_DECOR_ENTRY_IMAGE = "/pet-assets/v1/ui/room-decor-entry.webp";
type CareKind = "feed" | "drink";
type RoomNotice = { id: number; message: string };

const FALLBACK_ROOM_THEME: PetRoomTheme = {
  key: "sunny-garden",
  name: "阳光花园小屋",
  description: "暖暖阳光照进熟悉的小屋",
  priceStars: 0,
  backgroundLandscapeUrl: "/pet-assets/v1/scenes/pet-room.webp",
  backgroundTabletUrl: "/pet-assets/v1/scenes/pet-room.webp",
  backgroundPhoneUrl: "/pet-assets/v1/scenes/pet-room.webp",
  previewUrl: "/pet-assets/v1/scenes/pet-room.webp",
  ambience: [],
  isOwned: true,
  isEquipped: true,
};

function initialPetSoundEnabled() {
  try {
    return window.localStorage.getItem(PET_SOUND_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function shanghaiDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

const PET_FALLBACK_DIALOGUES: Record<PetDialogueContext, string[]> = {
  PET_NEEDS_CARE: ["肚子和水杯都有点空啦，先照顾我一下吧。"],
  PET_HUNGRY: ["肚子在咕咕唱歌，能给我一点点心吗？"],
  PET_THIRSTY: ["跑了这么久，我想喝一口清凉的水。"],
  PET_TASK_START: ["新的一天开始啦，做完任务再回来陪我玩吧。"],
  PET_TASK_PROGRESS: ["欢迎回来！休息一下，再按自己的节奏继续吧。"],
  PET_TASK_COMPLETE: ["今天辛苦啦，现在我们可以安心玩一会儿。"],
  PET_RELAX: ["今天没有新任务，我们一起轻松玩一会儿吧。"],
  PET_GENERAL: ["见到你真开心，来摸摸我吧。"],
};

function pickPetDialogue(
  dialogues: MascotDialogue[],
  context: PetDialogueContext,
): MascotDialogue {
  if (dialogues.length > 0) {
    return dialogues[Math.floor(Math.random() * dialogues.length)]!;
  }
  const fallback = PET_FALLBACK_DIALOGUES[context];
  const index = Math.floor(Math.random() * fallback.length);
  return {
    id: `fallback-${context}-${index}`,
    key: `fallback-${context}-${index}`,
    context,
    text: fallback[index]!,
    audioUrl: null,
  };
}

function roomDialogueContext(state: PetGrowthState): PetDialogueContext {
  if (state.dialogueContext) return state.dialogueContext;
  if (state.pet.satiety <= 30 && state.pet.hydration <= 30) return "PET_NEEDS_CARE";
  if (state.pet.satiety <= 30) return "PET_HUNGRY";
  if (state.pet.hydration <= 30) return "PET_THIRSTY";
  return "PET_GENERAL";
}

function actionKey(prefix: string) {
  return createIdempotencyKey(prefix);
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function formatCountdown(returnsAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(returnsAt).getTime() - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="pet-meter">
      <div className="pet-meter__label"><span>{label}</span><strong>{value}</strong></div>
      <div className="pet-meter__track"><i style={{ width: `${value}%`, background: tone }} /></div>
    </div>
  );
}

function Postcard({ trip, mascotImage, mascotName, soundEnabled, onClose }: { trip: PetTrip; mascotImage: string; mascotName: string; soundEnabled: boolean; onClose: () => void }) {
  const [speaking, setSpeaking] = useState(false);
  const playbackQueueRef = useRef<SinglePendingPlaybackQueue | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!playbackQueueRef.current) {
    playbackQueueRef.current = new SinglePendingPlaybackQueue(setSpeaking);
  }

  function speak() {
    if (!soundEnabled) return;
    const narration = `${trip.destinationName}。${trip.introduction}。你知道吗？${trip.funFact}`;
    if (trip.audioUrl) {
      playbackQueueRef.current?.enqueue(() => {
        const audio = audioRef.current ?? new Audio(trip.audioUrl!);
        audio.preload = "auto";
        audioRef.current = audio;
        return createAudioWithSpeechFallback(audio, narration, {
          rate: 0.86,
        });
      });
      return;
    }
    playbackQueueRef.current?.enqueue(() =>
      createSpeechPlayback(narration, { rate: 0.86 }),
    );
  }

  useEffect(() => () => {
    playbackQueueRef.current?.clear();
  }, []);

  useEffect(() => {
    if (!soundEnabled) playbackQueueRef.current?.clear();
  }, [soundEnabled]);

  return (
    <div className="pet-modal" role="dialog" aria-modal="true" aria-label={`${trip.destinationName}旅行明信片`}>
      <button className="pet-modal__backdrop" type="button" aria-label="关闭" onClick={onClose} />
      <article className="pet-postcard">
        <button className="pet-postcard__close" type="button" onClick={onClose} aria-label="关闭明信片">×</button>
        <div className="pet-postcard__image-wrap">
          <img className="pet-postcard__destination" src={trip.imageUrl} alt={trip.destinationName} decoding="async" />
          <img className="pet-postcard__travel-mascot" src={mascotImage} alt={`${mascotName}在${trip.destinationName}旅行`} decoding="async" />
          <span>旅行明信片</span>
        </div>
        <div className="pet-postcard__content">
          <p className="pet-postcard__location">{trip.city} · {trip.country}</p>
          <h2>{trip.destinationName}</h2>
          <p>{trip.introduction}</p>
          <div className="pet-postcard__fact"><strong>有趣的小知识</strong>{trip.funFact}</div>
          <button className={`pet-audio-button${speaking ? " is-speaking" : ""}`} type="button" disabled={!soundEnabled} onClick={speak}>
            <span className="pet-audio-icon" aria-hidden="true"><i /><b /></span>{soundEnabled ? speaking ? "正在讲给你听" : "听听这个地方" : "音效已关闭"}
          </button>
        </div>
      </article>
    </div>
  );
}

export function PetGrowthPage({ onNavigate }: { onNavigate: (route: ChildRoute) => void }) {
  const { mascot } = useMascot();
  const [state, setState] = useState<PetGrowthState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [careAnimation, setCareAnimation] = useState<{ kind: CareKind; startedAt: number } | null>(null);
  const [careConfirm, setCareConfirm] = useState<CareKind | null>(null);
  const [roomNotice, setRoomNotice] = useState<RoomNotice | null>(null);
  const [travelOpen, setTravelOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [themeShopOpen, setThemeShopOpen] = useState(false);
  const [themePreviewKey, setThemePreviewKey] = useState<string | null>(null);
  const [themePurchaseConfirm, setThemePurchaseConfirm] = useState<PetRoomTheme | null>(null);
  const [postcard, setPostcard] = useState<PetTrip | null>(null);
  const [selectedDialogue, setSelectedDialogue] = useState<MascotDialogue | null>(null);
  const [dialogueSpeaking, setDialogueSpeaking] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(initialPetSoundEnabled);
  const [now, setNow] = useState(Date.now());
  const careTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const dialogueAudioCacheRef = useRef(new Map<string, HTMLAudioElement>());
  const petSoundCacheRef = useRef(new Map<string, HTMLAudioElement>());
  const dialogueQueueRef = useRef<SinglePendingPlaybackQueue | null>(null);
  const petSoundQueueRef = useRef<SinglePendingPlaybackQueue | null>(null);
  const careSoundQueueRef = useRef<SinglePendingPlaybackQueue | null>(null);
  const entrySoundPlaybackRef = useRef<ReturnType<typeof createHtmlAudioPlayback> | null>(null);
  const soundRetryCleanupRef = useRef(new Set<() => void>());
  const postcardSoundTripIdRef = useRef<string | null>(null);
  const entryVisitHandledRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);
  const roomNoticeIdRef = useRef(0);
  if (!dialogueQueueRef.current) {
    dialogueQueueRef.current = new SinglePendingPlaybackQueue(setDialogueSpeaking);
  }
  if (!petSoundQueueRef.current) {
    petSoundQueueRef.current = new SinglePendingPlaybackQueue();
  }
  if (!careSoundQueueRef.current) {
    careSoundQueueRef.current = new SinglePendingPlaybackQueue();
  }
  const uploadedMascotImages = useMemo(
    () => new Map((state?.mascotAssets ?? []).map((asset) => [asset.slot, asset.mediaUrl])),
    [state?.mascotAssets],
  );
  const uploadedSleepingImage = uploadedMascotImages.get("SLEEPING");
  const uploadedCelebrateImage = uploadedMascotImages.get("CELEBRATE");
  const uploadedNeutralImage = uploadedMascotImages.get("NEUTRAL");
  const uploadedHungryImage = uploadedMascotImages.get("HUNGRY");
  const uploadedEatingImage = uploadedMascotImages.get("EATING");
  const uploadedDrinkingImage = uploadedMascotImages.get("DRINKING");
  const uploadedTravelImage = uploadedMascotImages.get("TRAVEL");
  const idleMascotImage = useMemo(
    () => (Math.random() < 0.42
      ? uploadedSleepingImage ?? mascot.activityImages.sleeping
      : uploadedNeutralImage ?? mascot.images.neutral),
    [mascot.activityImages.sleeping, mascot.images.neutral, uploadedNeutralImage, uploadedSleepingImage],
  );
  const celebrateMascotImage = uploadedCelebrateImage ?? mascot.images.celebrate;

  const load = useCallback(async (quiet = false) => {
    try {
      const result = await getPetGrowth();
      setState(result);
      setError("");
    } catch (reason) {
      if (!quiet) setError(reason instanceof Error ? reason.message : "暂时无法进入星宠小屋");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const stopEntrySound = useCallback(() => {
    entrySoundPlaybackRef.current?.cancel();
    entrySoundPlaybackRef.current = null;
  }, []);
  const playPetSound = useCallback((url: string, retryOnGesture = false) => {
    if (!soundEnabledRef.current) return;
    let canRetry = retryOnGesture;
    const enqueue = () => {
      petSoundQueueRef.current?.enqueue(() => {
        const cached = petSoundCacheRef.current.get(url);
        const audio = cached ?? new Audio(url);
        if (!cached) {
          audio.preload = "auto";
          petSoundCacheRef.current.set(url, audio);
        }
        const playback = createHtmlAudioPlayback(audio);
        if (canRetry) {
          void playback.done.catch(() => {
            canRetry = false;
            const retry = () => {
              cleanup();
              enqueue();
            };
            const cleanup = () => {
              document.removeEventListener("pointerdown", retry, true);
              soundRetryCleanupRef.current.delete(cleanup);
            };
            soundRetryCleanupRef.current.add(cleanup);
            document.addEventListener("pointerdown", retry, {
              capture: true,
              once: true,
            });
          });
        }
        return playback;
      });
    };
    enqueue();
  }, []);
  useEffect(() => {
    if (!state || entryVisitHandledRef.current) return;
    entryVisitHandledRef.current = true;

    const today = shanghaiDateKey();
    let lastPlayedDate: string | null = null;
    try {
      lastPlayedDate = window.localStorage.getItem(PET_ENTRY_SOUND_DATE_KEY);
      window.localStorage.setItem(PET_ENTRY_SOUND_DATE_KEY, today);
    } catch {
      // The visit still works when storage is unavailable, but cannot persist the daily limit.
    }
    if (
      lastPlayedDate === today
      || !soundEnabledRef.current
      || state.currentTrip?.status === "RETURNED"
    ) return;

    const cached = petSoundCacheRef.current.get(happyEntrySound);
    const audio = cached ?? new Audio(happyEntrySound);
    if (!cached) {
      audio.preload = "auto";
      petSoundCacheRef.current.set(happyEntrySound, audio);
    }
    const playback = createHtmlAudioPlayback(audio);
    entrySoundPlaybackRef.current = playback;
    void playback.done
      .catch(() => undefined)
      .finally(() => {
        if (entrySoundPlaybackRef.current === playback) {
          entrySoundPlaybackRef.current = null;
        }
      });
  }, [state, stopEntrySound]);
  useEffect(() => {
    const returnedTrip = state?.currentTrip;
    if (returnedTrip?.status !== "RETURNED") return;
    stopEntrySound();
    if (postcardSoundTripIdRef.current === returnedTrip.id) return;
    postcardSoundTripIdRef.current = returnedTrip.id;
    playPetSound(postcardArrivedSound, true);
  }, [playPetSound, state?.currentTrip, stopEntrySound]);
  useEffect(() => {
    if (postcard) stopEntrySound();
  }, [postcard, stopEntrySound]);
  useEffect(() => {
    if (state) reportChildPageReady("pet-growth", "/api/child/pet");
  }, [state]);
  useEffect(() => {
    if (state?.currentTrip?.status !== "TRAVELING") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [state?.currentTrip?.status]);

  useLiveRefresh(() => load(true), {
    enabled: Boolean(state),
    intervalMs: state?.currentTrip?.status === "TRAVELING" ? 10_000 : 30_000,
  });

  useEffect(() => {
    const preload = () => {
      Object.values(mascot.activityImages).forEach((src) => {
        const image = new Image();
        image.decoding = "async";
        image.src = src;
      });
    };
    const requestIdle = window.requestIdleCallback?.bind(window);
    if (requestIdle) {
      const id = requestIdle(preload, { timeout: 2_000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(preload, 500);
    return () => window.clearTimeout(timer);
  }, [mascot.activityImages]);

  useEffect(() => {
    if (!state) return;
    const context = roomDialogueContext(state);
    const dialogues = state.dialogues ?? [];
    setSelectedDialogue((current) => {
      const remainsAvailable = current?.context === context && (
        dialogues.length === 0 || dialogues.some((dialogue) => dialogue.id === current.id)
      );
      return remainsAvailable ? current : pickPetDialogue(dialogues, context);
    });
  }, [state]);

  useEffect(() => {
    if (!selectedDialogue?.audioUrl || dialogueAudioCacheRef.current.has(selectedDialogue.audioUrl)) return;
    const audio = new Audio(selectedDialogue.audioUrl);
    audio.preload = "auto";
    dialogueAudioCacheRef.current.set(selectedDialogue.audioUrl, audio);
  }, [selectedDialogue]);

  useEffect(() => () => {
    if (careTimerRef.current !== null) window.clearTimeout(careTimerRef.current);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    dialogueQueueRef.current?.clear();
    petSoundQueueRef.current?.clear();
    careSoundQueueRef.current?.clear();
    stopEntrySound();
    soundRetryCleanupRef.current.forEach((cleanup) => cleanup());
    soundRetryCleanupRef.current.clear();
  }, [stopEntrySound]);

  function speakPetDialogue() {
    if (!soundEnabledRef.current || !selectedDialogue || careAnimation) return;

    if (!selectedDialogue.audioUrl) {
      const text = selectedDialogue.text;
      dialogueQueueRef.current?.enqueue(() =>
        createSpeechPlayback(text, { rate: 0.9 }),
      );
      return;
    }

    const audioUrl = selectedDialogue.audioUrl;
    const text = selectedDialogue.text;
    dialogueQueueRef.current?.enqueue(() => {
      const cached = dialogueAudioCacheRef.current.get(audioUrl);
      const audio = cached ?? new Audio(audioUrl);
      audio.preload = "auto";
      dialogueAudioCacheRef.current.set(audioUrl, audio);
      return createAudioWithSpeechFallback(audio, text, { rate: 0.9 });
    });
  }

  function toggleSound() {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    try {
      window.localStorage.setItem(PET_SOUND_STORAGE_KEY, String(next));
    } catch {
      // The toggle still works for this visit when storage is unavailable.
    }
    if (!next) {
      dialogueQueueRef.current?.clear();
      petSoundQueueRef.current?.clear();
      careSoundQueueRef.current?.clear();
      stopEntrySound();
      soundRetryCleanupRef.current.forEach((cleanup) => cleanup());
      soundRetryCleanupRef.current.clear();
    }
  }

  const moodImage = useMemo(() => {
    if (!state) return mascot.images.neutral;
    if (careAnimation?.kind === "feed") return uploadedEatingImage ?? mascot.activityImages.eating;
    if (careAnimation?.kind === "drink") return uploadedDrinkingImage ?? mascot.activityImages.drinking;
    if (state.currentTrip?.status === "TRAVELING") return uploadedTravelImage ?? mascot.activityImages.travel;
    if (state.pet.satiety < 30 || state.pet.hydration < 30) return uploadedHungryImage ?? mascot.activityImages.hungry;
    if (state.currentTrip) return celebrateMascotImage;
    return idleMascotImage;
  }, [careAnimation, celebrateMascotImage, idleMascotImage, mascot.activityImages, mascot.images, state, uploadedDrinkingImage, uploadedEatingImage, uploadedHungryImage, uploadedTravelImage]);

  function showRoomNotice(message: string) {
    const id = roomNoticeIdRef.current + 1;
    roomNoticeIdRef.current = id;
    setRoomNotice({ id, message });
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setRoomNotice((current) => (current?.id === id ? null : current));
      noticeTimerRef.current = null;
    }, ROOM_NOTICE_MS);
  }

  function requestCare(kind: CareKind) {
    if (busy || careAnimation || !state) return;
    const status = kind === "feed" ? state.pet.satiety : state.pet.hydration;
    if (status >= 100) {
      showRoomNotice(kind === "feed" ? "星宠现在吃得很饱" : "星宠现在不渴");
      return;
    }
    setCareConfirm(kind);
  }

  async function care(kind: CareKind) {
    if (busy || careAnimation || !state) return;
    const status = kind === "feed" ? state.pet.satiety : state.pet.hydration;
    if (status >= 100) {
      showRoomNotice(kind === "feed" ? "星宠现在吃得很饱" : "星宠现在不渴");
      return;
    }
    setBusy(kind);
    try {
      const result = await careForPet(kind, actionKey(kind));
      setState(result);
      setError("");
      setCareConfirm(null);
      const startedAt = Date.now();
      setCareAnimation({ kind, startedAt });
      careSoundQueueRef.current?.clear();
      if (soundEnabledRef.current) {
        const soundUrl = kind === "feed" ? eatingSound : drinkingSound;
        careSoundQueueRef.current?.enqueue(() => {
          const cached = petSoundCacheRef.current.get(soundUrl);
          const audio = cached ?? new Audio(soundUrl);
          if (!cached) {
            audio.preload = "auto";
            petSoundCacheRef.current.set(soundUrl, audio);
          }
          return createHtmlAudioPlayback(audio);
        });
      }
      if (careTimerRef.current !== null) window.clearTimeout(careTimerRef.current);
      careTimerRef.current = window.setTimeout(() => {
        careSoundQueueRef.current?.clear();
        setCareAnimation(null);
        careTimerRef.current = null;
      }, CARE_ANIMATION_MS);
    } catch (reason) {
      setCareConfirm(null);
      setTravelOpen(false);
      showRoomNotice(reason instanceof ApiError ? reason.message : "照顾星宠没有完成");
    } finally {
      setBusy(null);
    }
  }

  async function depart(tier: PetTravelTier) {
    if (busy) return;
    setBusy(`travel-${tier}`);
    try {
      setState(await startPetTrip(tier, actionKey(`travel-${tier}`)));
      setTravelOpen(false);
      setError("");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "旅行没有成功出发");
    } finally {
      setBusy(null);
    }
  }

  async function reveal() {
    const trip = state?.currentTrip;
    if (!trip || busy) return;
    setBusy("reveal");
    try {
      const result = await revealPetTrip(trip.id);
      setState(result);
      setPostcard(result.postcards.find((item) => item.id === trip.id) ?? trip);
      setError("");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "明信片暂时打不开");
    } finally {
      setBusy(null);
    }
  }

  async function applyRoomTheme(theme: PetRoomTheme) {
    if (busy || theme.isEquipped) return;
    if (!theme.isOwned) {
      setThemePurchaseConfirm(theme);
      return;
    }
    setBusy(`theme-select-${theme.key}`);
    try {
      setState(await selectPetRoomTheme(theme.key));
      setThemePreviewKey(theme.key);
      showRoomNotice(`已经换成${theme.name}`);
    } catch (reason) {
      showRoomNotice(reason instanceof ApiError ? reason.message : "小屋背景暂时无法切换");
    } finally {
      setBusy(null);
    }
  }

  async function purchaseRoomTheme(theme: PetRoomTheme) {
    if (busy || theme.isOwned) return;
    setBusy(`theme-purchase-${theme.key}`);
    try {
      setState(await purchasePetRoomTheme(theme.key, actionKey(`room-theme-${theme.key}`)));
      setThemePurchaseConfirm(null);
      setThemePreviewKey(theme.key);
      showRoomNotice(`${theme.name}已经永久解锁`);
    } catch (reason) {
      setThemePurchaseConfirm(null);
      showRoomNotice(reason instanceof ApiError ? reason.message : "小屋背景没有解锁成功");
    } finally {
      setBusy(null);
    }
  }

  if (!state) {
    return <main className="pet-growth-page pet-growth-page--loading"><div className="pet-loading"><i /><span>{error || "正在打开星宠小屋…"}</span><button type="button" onClick={() => void load()}>重新加载</button></div><ChildBottomNav active="pet" onNavigate={onNavigate} /></main>;
  }

  const trip = state.currentTrip;
  const roomThemes = state.roomThemes?.length ? state.roomThemes : [FALLBACK_ROOM_THEME];
  const equippedRoomTheme = roomThemes.find((theme) => theme.isEquipped)
    ?? roomThemes.find((theme) => theme.key === state.equippedRoomThemeKey)
    ?? roomThemes[0]
    ?? FALLBACK_ROOM_THEME;
  const displayedRoomTheme = roomThemes.find((theme) => theme.key === themePreviewKey)
    ?? equippedRoomTheme;
  const levelRange = state.pet.nextLevelExperience === null
    ? 1
    : Math.max(1, state.pet.nextLevelExperience - state.pet.currentLevelStart);
  const levelProgress = state.pet.nextLevelExperience === null
    ? 100
    : Math.min(100, Math.max(0, ((state.pet.experience - state.pet.currentLevelStart) / levelRange) * 100));
  const careConfirmation = careConfirm
    ? {
        kind: careConfirm,
        title: careConfirm === "feed" ? `给${mascot.name}喂点心吗？` : `给${mascot.name}喂水吗？`,
        actionText: careConfirm === "feed" ? "确认喂点心" : "确认喂水",
        costStars: state.careOptions[careConfirm].costStars,
      }
    : null;

  return (
    <main
      className={`pet-growth-page pet-growth-page--${trip ? "travel" : "home"}`}
      onPointerDownCapture={stopEntrySound}
    >
      <section className="pet-growth-stage">
        <picture className="pet-room-backdrop" key={displayedRoomTheme.key}>
          <source media="(max-width: 699px) and (orientation: portrait)" srcSet={displayedRoomTheme.backgroundPhoneUrl} />
          <source media="(orientation: portrait)" srcSet={displayedRoomTheme.backgroundTabletUrl} />
          <img src={displayedRoomTheme.backgroundLandscapeUrl} alt="" aria-hidden="true" decoding="async" />
        </picture>
        <div className="pet-room-ambience" aria-hidden="true">
          {displayedRoomTheme.ambience.map((item, index) => (
            <img
              className={`pet-room-ambience__item pet-room-ambience__item--${item.motion.toLowerCase()} pet-room-ambience__item--${item.placement.toLowerCase().replace("_", "-")}`}
              src={item.imageUrl}
              alt=""
              decoding="async"
              key={`${displayedRoomTheme.key}-${item.imageUrl}-${index}`}
            />
          ))}
        </div>
        <header className="pet-room-hud">
          <button
            className={`pet-sound-toggle${soundEnabled ? " is-enabled" : " is-muted"}`}
            type="button"
            aria-label={soundEnabled ? "关闭星宠小屋音效" : "开启星宠小屋音效"}
            aria-pressed={soundEnabled}
            title={soundEnabled ? "关闭音效" : "开启音效"}
            onClick={toggleSound}
          >
            <img src={soundToggleIcon} alt="" aria-hidden="true" />
          </button>
          <div className="pet-star-balance" aria-label={`当前有 ${state.wallet.starBalance} 颗星`}><span>★</span><div><small>我的星星</small><strong>{state.wallet.starBalance}</strong></div></div>
        </header>

        <section className="pet-status-card" aria-label="星宠状态">
          <div className="pet-status-card__title"><div><small>成长阶段</small><strong>{state.pet.growthStage === "BABY" ? "幼年伙伴" : state.pet.growthStage === "GROWING" ? "成长伙伴" : "成熟伙伴"}</strong></div><span>Lv.{state.pet.level}</span></div>
          <div className="pet-growth-progress" aria-label={`${mascot.name}的成长进度 ${Math.round(levelProgress)}%`}>
            <div><strong>{mascot.name}的成长进度</strong><span>{Math.round(levelProgress)}%</span></div>
            <i><b style={{ width: `${levelProgress}%` }} /></i>
          </div>
          <Meter label="饱食度" value={state.pet.satiety} tone="#f59a55" />
          <Meter label="饮水状态" value={state.pet.hydration} tone="#55b9d6" />
          <div className="pet-spend-note">今日已使用 <strong>{state.wallet.dailySpent}</strong> 颗星{state.wallet.dailySpendLimitStars !== null && <> / {state.wallet.dailySpendLimitStars}</>}</div>
        </section>

        <button className="pet-map-entry" type="button" onClick={() => onNavigate("map")} aria-label="打开星际航图">
          <span className="pet-map-entry__sky" aria-hidden="true">
            <img src={PLANET_BY_KEY.EARTH.image} alt="" />
            <img src={PLANET_BY_KEY.SATURN.image} alt="" />
            <i /><i /><i />
          </span>
          <span className="pet-map-entry__copy"><small>探索宇宙</small><strong>星际航图</strong><em>看看点亮了哪些星球</em></span>
          <span className="pet-map-entry__arrow" aria-hidden="true">›</span>
        </button>

        <aside className="pet-action-rail" aria-label="星宠操作">
          <button className="pet-action-button pet-action-button--travel" type="button" disabled={Boolean(trip) || !state.travelEnabled || Boolean(busy) || Boolean(careAnimation)} onClick={() => setTravelOpen(true)}>
            <span className="pet-action-icon pet-action-icon--travel" aria-hidden="true">✦</span><div><strong>准备旅行</strong><small>{state.travelEnabled ? "去看看远方" : "旅行已关闭"}</small></div>
          </button>
          <button className="pet-action-button pet-action-button--feed" type="button" disabled={Boolean(trip) || Boolean(busy) || Boolean(careAnimation)} onClick={() => requestCare("feed")}>
            <span className="pet-action-icon pet-action-icon--snack" aria-hidden="true"><i /></span><div><strong>{busy === "feed" ? "准备点心…" : careAnimation?.kind === "feed" ? "正在吃点心" : "喂点心"}</strong><small>使用 {state.careOptions.feed.costStars} 颗星</small></div>
          </button>
          <button className="pet-action-button pet-action-button--drink" type="button" disabled={Boolean(trip) || Boolean(busy) || Boolean(careAnimation)} onClick={() => requestCare("drink")}>
            <span className="pet-action-icon pet-action-icon--water" aria-hidden="true"><i /></span><div><strong>{busy === "drink" ? "准备清水…" : careAnimation?.kind === "drink" ? "正在喝水" : "喂水"}</strong><small>使用 {state.careOptions.drink.costStars} 颗星</small></div>
          </button>
          <button
            className="pet-action-button pet-action-button--decorate"
            type="button"
            disabled={Boolean(trip) || Boolean(busy) || Boolean(careAnimation)}
            onClick={() => {
              setThemePreviewKey(equippedRoomTheme.key);
              setThemeShopOpen(true);
            }}
          >
            <span className="pet-action-icon pet-action-icon--decorate" aria-hidden="true"><img src={ROOM_DECOR_ENTRY_IMAGE} alt="" /></span><div><strong>布置小屋</strong><small>{equippedRoomTheme.name}</small></div>
          </button>
          <button className="pet-action-button pet-action-button--album" type="button" disabled={Boolean(trip) || Boolean(busy) || Boolean(careAnimation)} onClick={() => setAlbumOpen(true)}>
            <span className="pet-action-icon pet-action-icon--album" aria-hidden="true"><i /></span><div><strong>明信片册</strong><small>收藏 {state.postcards.length} 张</small></div>
          </button>
        </aside>

        {roomNotice && <div className="pet-room-notice" key={roomNotice.id} role="status" aria-live="polite">{roomNotice.message}</div>}
        {trip?.status === "TRAVELING" ? (
          <div className="pet-traveling-scene">
            <div className="pet-traveling-orbit"><span>✦</span><span>✦</span><span>✦</span></div>
            <img src={moodImage} alt={`${mascot.name}正在旅行`} />
            <h1>{mascot.name}出发旅行啦</h1>
            <p>回来时会带一张神秘明信片</p>
            <time>{formatCountdown(trip.returnsAt, now)}</time>
          </div>
        ) : trip?.status === "RETURNED" ? (
          <div className="pet-return-scene">
            <div className="pet-return-envelope-wrap">
              <i className="pet-return-spark pet-return-spark--one" />
              <i className="pet-return-spark pet-return-spark--two" />
              <img className="pet-return-envelope" src={returnEnvelope} alt="一封装着旅行明信片的信" />
              <img className="pet-return-mascot" src={celebrateMascotImage} alt={`${mascot.name}旅行归来`} />
            </div>
            <p className="pet-return-eyebrow">旅行邮差送来了一封信</p>
            <h1>{mascot.name}带着明信片回来啦</h1>
            <button className="pet-return-open" type="button" disabled={busy === "reveal"} onClick={() => void reveal()}><span aria-hidden="true"><i /></span>{busy === "reveal" ? "正在拆开…" : "拆开明信片"}</button>
          </div>
        ) : (
          <>
            <div className={`pet-main-figure pet-main-figure--${state.pet.growthStage.toLowerCase()}${dialogueSpeaking ? " pet-main-figure--speaking" : ""}`}>
              <span className="pet-main-figure__spark">✦</span>
              <button className="pet-main-figure__button" type="button" disabled={Boolean(careAnimation)} aria-label={`点击听${mascot.name}说话`} aria-pressed={dialogueSpeaking} onClick={speakPetDialogue}>
                <img src={moodImage} alt={`你的星宠${mascot.name}`} />
              </button>
              {careAnimation ? (
                <div className="pet-care-progress" key={careAnimation.startedAt}>
                  <strong>{careAnimation.kind === "feed" ? "正在享用点心" : "正在补充水分"}</strong>
                  <i><b /></i>
                </div>
              ) : <p key={selectedDialogue?.id}>{selectedDialogue?.text ?? PET_FALLBACK_DIALOGUES[roomDialogueContext(state)][0]}</p>}
            </div>
          </>
        )}
      </section>

      {careConfirmation && (
        <div className="pet-modal pet-care-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="pet-care-confirm-title">
          <button
            className="pet-modal__backdrop"
            type="button"
            aria-label="取消照顾星宠"
            disabled={busy === careConfirmation.kind}
            onClick={() => setCareConfirm(null)}
          />
          <section className={`pet-care-confirm pet-care-confirm--${careConfirmation.kind}`}>
            <div className={`pet-care-confirm__icon pet-care-confirm__icon--${careConfirmation.kind}`} aria-hidden="true">
              <span className={`pet-action-icon ${careConfirmation.kind === "feed" ? "pet-action-icon--snack" : "pet-action-icon--water"}`}><i /></span>
            </div>
            <h2 id="pet-care-confirm-title">{careConfirmation.title}</h2>
            <div className="pet-care-confirm__cost">
              <span><b>★</b> 需要消耗 <strong>{careConfirmation.costStars}</strong> 颗星</span>
            </div>
            {state.wallet.starBalance < careConfirmation.costStars && <div className="pet-care-confirm__warning">星星余额不足，暂时不能进行这次照顾</div>}
            <div className="pet-care-confirm__actions">
              <button type="button" disabled={busy === careConfirmation.kind} onClick={() => setCareConfirm(null)}>再等等</button>
              <button type="button" disabled={Boolean(busy) || state.wallet.starBalance < careConfirmation.costStars} onClick={() => void care(careConfirmation.kind)}>
                {busy === careConfirmation.kind ? "正在准备…" : careConfirmation.actionText}
              </button>
            </div>
          </section>
        </div>
      )}

      {travelOpen && (
        <div className="pet-modal" role="dialog" aria-modal="true" aria-label="选择旅行">
          <button className="pet-modal__backdrop" type="button" aria-label="关闭" onClick={() => setTravelOpen(false)} />
          <section className="pet-travel-sheet">
            <header><div><small>给星宠准备旅费</small><h2>这次去哪里，会是一个惊喜</h2></div><button type="button" onClick={() => setTravelOpen(false)} aria-label="关闭">×</button></header>
            {error && <div className="pet-inline-error" onClick={() => setError("")}>{error}</div>}
            <div className="pet-travel-options">
              {state.travelOptions.map((option) => {
                const copy = TIER_COPY[option.tier];
                return <button className={`pet-trip-option pet-trip-option--${option.tier.toLowerCase()}`} key={option.tier} type="button" disabled={Boolean(busy) || state.wallet.starBalance < option.costStars} onClick={() => void depart(option.tier)}><span className={`pet-trip-icon pet-trip-icon--${option.tier.toLowerCase()}`} aria-hidden="true"><i /><b /></span><strong>{copy.name}</strong><small>{copy.note}<em>{formatDuration(option.durationMinutes)}</em></small><b className="pet-trip-price">★ {option.costStars}</b></button>;
              })}
            </div>
          </section>
        </div>
      )}

      {albumOpen && (
        <div className="pet-modal" role="dialog" aria-modal="true" aria-label="明信片册">
          <button className="pet-modal__backdrop" type="button" aria-label="关闭" onClick={() => setAlbumOpen(false)} />
          <section className="pet-album">
            <header><div><small>{mascot.name}的旅行足迹</small><h2>明信片册</h2></div><button type="button" onClick={() => setAlbumOpen(false)} aria-label="关闭">×</button></header>
            {state.postcards.length ? <div className="pet-album__grid">{state.postcards.map((item) => <button type="button" key={item.id} onClick={() => setPostcard(item)}><img src={item.imageUrl} alt={item.destinationName} loading="lazy" decoding="async" /><span>{item.destinationName}</span><small>{item.city} · {item.country}</small></button>)}</div> : <div className="pet-album__empty"><span>✉</span><strong>还没有明信片</strong><p>准备一次旅行，星宠回来时会带来第一张收藏。</p></div>}
          </section>
        </div>
      )}
      {themeShopOpen && (
        <div className="pet-modal" role="dialog" aria-modal="true" aria-label="布置小屋">
          <button className="pet-modal__backdrop" type="button" aria-label="关闭" onClick={() => { setThemeShopOpen(false); setThemePreviewKey(null); }} />
          <article className="pet-theme-shop">
            <header className="pet-theme-shop__header">
              <div><small>用星星装点自己的空间</small><h2>布置小屋</h2></div>
              <div className="pet-theme-shop__balance"><span>★</span>{state.wallet.starBalance}</div>
              <button type="button" onClick={() => { setThemeShopOpen(false); setThemePreviewKey(null); }} aria-label="关闭">×</button>
            </header>
            <div className="pet-theme-shop__preview">
              <picture>
                <source media="(orientation: portrait)" srcSet={displayedRoomTheme.backgroundTabletUrl} />
                <img src={displayedRoomTheme.backgroundLandscapeUrl} alt={`${displayedRoomTheme.name}预览`} decoding="async" />
              </picture>
              <div><small>{displayedRoomTheme.isOwned ? "已经拥有" : "预览中"}</small><strong>{displayedRoomTheme.name}</strong><span>{displayedRoomTheme.description}</span></div>
            </div>
            <div className="pet-theme-shop__grid" role="list" aria-label="小屋背景列表">
              {roomThemes.map((theme) => (
                <button
                  className={`pet-theme-card${theme.key === displayedRoomTheme.key ? " is-selected" : ""}${theme.isEquipped ? " is-equipped" : ""}`}
                  type="button"
                  role="listitem"
                  onClick={() => setThemePreviewKey(theme.key)}
                  key={theme.key}
                >
                  <img src={theme.previewUrl} alt="" loading="lazy" decoding="async" />
                  <span><strong>{theme.name}</strong><small>{theme.isEquipped ? "使用中" : theme.isOwned ? "已拥有" : `★ ${theme.priceStars}`}</small></span>
                </button>
              ))}
            </div>
            <footer className="pet-theme-shop__footer">
              <div><strong>{displayedRoomTheme.name}</strong><span>{displayedRoomTheme.isOwned ? "永久拥有，可随时切换" : `需要 ${displayedRoomTheme.priceStars} 颗星永久解锁`}</span></div>
              <button
                type="button"
                disabled={displayedRoomTheme.isEquipped || Boolean(busy)}
                onClick={() => void applyRoomTheme(displayedRoomTheme)}
              >
                {busy?.includes(displayedRoomTheme.key)
                  ? "正在布置…"
                  : displayedRoomTheme.isEquipped
                    ? "正在使用"
                    : displayedRoomTheme.isOwned
                      ? "使用这个背景"
                      : `用 ${displayedRoomTheme.priceStars} 星解锁`}
              </button>
            </footer>
          </article>
        </div>
      )}
      {themePurchaseConfirm && (
        <div className="pet-modal pet-modal--theme-confirm" role="dialog" aria-modal="true" aria-label="确认解锁小屋背景">
          <button className="pet-modal__backdrop" type="button" aria-label="取消" onClick={() => setThemePurchaseConfirm(null)} />
          <article className="pet-theme-confirm">
            <img src={themePurchaseConfirm.previewUrl} alt={themePurchaseConfirm.name} />
            <small>永久收藏</small>
            <h2>确认解锁{themePurchaseConfirm.name}？</h2>
            <p>需要使用 <strong>★ {themePurchaseConfirm.priceStars}</strong>，解锁后可以一直使用。</p>
            <div>
              <button type="button" disabled={Boolean(busy)} onClick={() => setThemePurchaseConfirm(null)}>再想想</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => void purchaseRoomTheme(themePurchaseConfirm)}>{busy ? "正在解锁…" : "确认解锁"}</button>
            </div>
          </article>
        </div>
      )}
      {postcard && <Postcard trip={postcard} mascotImage={mascot.activityImages.travel} mascotName={mascot.name} soundEnabled={soundEnabled} onClose={() => setPostcard(null)} />}
      <ChildBottomNav active="pet" onNavigate={onNavigate} />
    </main>
  );
}
