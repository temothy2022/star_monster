import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ApiError,
  careForPet,
  cleanPetWaste,
  getPetGrowth,
  openPetRedPacket,
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
import redPacketOpenSound from "@star-monsters/assets/audio/pet/red-packet-open.mp3";
import redPacketRainSound from "@star-monsters/assets/audio/pet/red-packet-rain.mp3";
import soundToggleIcon from "@star-monsters/assets/images/pet/sound-toggle.webp";
import redPacketEntryImage from "@star-monsters/assets/images/pet/red-packet-entry.webp";
import redPacketMainImage from "@star-monsters/assets/images/pet/red-packet-main.webp";
import petWasteImage from "@star-monsters/assets/images/pet/pet-waste.webp";
import petCleaningBroomImage from "@star-monsters/assets/images/pet/pet-cleaning-broom.webp";
import petCleaningDustpanImage from "@star-monsters/assets/images/pet/pet-cleaning-dustpan.webp";
import petActionTravelIcon from "@star-monsters/assets/images/pet/ui-icons/pet-action-travel.webp";
import petActionSnackIcon from "@star-monsters/assets/images/pet/ui-icons/pet-action-snack.webp";
import petActionWaterIcon from "@star-monsters/assets/images/pet/ui-icons/pet-action-water.webp";
import petActionAlbumIcon from "@star-monsters/assets/images/pet/ui-icons/pet-action-album.webp";
import petActionWishIcon from "@star-monsters/assets/images/pet/ui-icons/pet-action-wish.webp";
import petTripNearbyIcon from "@star-monsters/assets/images/pet/ui-icons/pet-trip-nearby.webp";
import petTripChinaIcon from "@star-monsters/assets/images/pet/ui-icons/pet-trip-china.webp";
import petTripWorldIcon from "@star-monsters/assets/images/pet/ui-icons/pet-trip-world.webp";
import {
  clearWebMediaSession,
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

const TRIP_ICON_BY_TIER: Record<PetTravelTier, string> = {
  NEARBY: petTripNearbyIcon,
  CHINA: petTripChinaIcon,
  WORLD: petTripWorldIcon,
};

const CARE_ANIMATION_MS = 3_000;
const WASTE_CLEANING_ANIMATION_MS = 2_600;
const ROOM_NOTICE_MS = 2_000;
const PET_DIALOGUE_VISIBLE_MS = 4_000;
const PET_DIALOGUE_FIRST_DELAY_MIN_MS = 4_000;
const PET_DIALOGUE_FIRST_DELAY_MAX_MS = 7_000;
const PET_DIALOGUE_INTERVAL_MIN_MS = 30_000;
const PET_DIALOGUE_INTERVAL_MAX_MS = 60_000;
const PET_SOUND_STORAGE_KEY = "star-monsters:pet-sound-enabled";
const PET_ENTRY_SOUND_DATE_KEY = "star-monsters:pet-entry-sound-date";
const PET_ROOM_LAYOUT_STORAGE_KEY = "star-monsters:pet-room-layout:v1";
const ROOM_DECOR_ENTRY_IMAGE = "/pet-assets/v1/ui/room-decor-entry.webp";
const PET_LAYOUT_LONG_PRESS_MS = 520;
const RED_PACKET_RAIN_MS = 3_200;
type CareKind = "feed" | "drink";
type PetWaste = NonNullable<PetGrowthState["waste"]["active"]>;
type RoomNotice = { id: number; message: string };
type RedPacketStage = "rain" | "ready" | "opening" | "revealed";
type RedPacketReward = { packetId: string; stars: number; sourceLevel: number };
type PetLayoutModule = "status" | "map" | "actions";
type PetLayoutOrientation = "landscape" | "portrait";
type PetLayoutPosition = { x: number; y: number };
type PetLayoutPreset = Record<PetLayoutModule, PetLayoutPosition>;
type StoredPetRoomLayouts = {
  version: 1;
  landscape?: PetLayoutPreset;
  portrait?: PetLayoutPreset;
};

const RED_PACKET_RAIN_ITEMS = Array.from({ length: 64 }, (_, index) => ({
  left: `${(index * 37 + 7) % 101}%`,
  delay: `${-((index * 0.17) % 3.8)}s`,
  duration: `${2.25 + (index % 7) * 0.27}s`,
  scale: `${0.32 + (index % 6) * 0.16}`,
  rotate: `${(index % 2 === 0 ? 1 : -1) * (20 + (index % 7) * 13)}deg`,
  sway: `${(index % 2 === 0 ? 1 : -1) * (18 + (index % 5) * 12)}px`,
  opacity: `${0.6 + (index % 4) * 0.12}`,
}));

const RED_PACKET_LIGHT_ITEMS = Array.from({ length: 24 }, (_, index) => ({
  left: `${(index * 43 + 11) % 100}%`,
  top: `${(index * 29 + 13) % 94}%`,
  delay: `${(index % 8) * -0.19}s`,
  scale: `${0.55 + (index % 5) * 0.22}`,
}));

const RED_PACKET_BURST_ITEMS = Array.from({ length: 22 }, (_, index) => ({
  angle: `${(360 / 22) * index}deg`,
  distance: `${116 + (index % 5) * 24}px`,
  delay: `${(index % 4) * 0.035}s`,
}));
type PetLayoutViewport = {
  enabled: boolean;
  orientation: PetLayoutOrientation;
};
type PetLayoutDragSession = {
  module: PetLayoutModule;
  pointerId: number;
  startX: number;
  startY: number;
  target: HTMLElement;
  activated: boolean;
  timer: number;
};

const EMPTY_PET_ROOM_LAYOUTS: StoredPetRoomLayouts = { version: 1 };

function isLayoutPosition(value: unknown): value is PetLayoutPosition {
  if (!value || typeof value !== "object") return false;
  const position = value as Partial<PetLayoutPosition>;
  return typeof position.x === "number"
    && Number.isFinite(position.x)
    && position.x >= 0
    && position.x <= 1
    && typeof position.y === "number"
    && Number.isFinite(position.y)
    && position.y >= 0
    && position.y <= 1;
}

function isLayoutPreset(value: unknown): value is PetLayoutPreset {
  if (!value || typeof value !== "object") return false;
  const preset = value as Partial<PetLayoutPreset>;
  return isLayoutPosition(preset.status)
    && isLayoutPosition(preset.map)
    && isLayoutPosition(preset.actions);
}

function readStoredPetRoomLayouts(): StoredPetRoomLayouts {
  try {
    const raw = window.localStorage.getItem(PET_ROOM_LAYOUT_STORAGE_KEY);
    if (!raw) return EMPTY_PET_ROOM_LAYOUTS;
    const parsed = JSON.parse(raw) as Partial<StoredPetRoomLayouts>;
    return {
      version: 1,
      ...(isLayoutPreset(parsed.landscape) ? { landscape: parsed.landscape } : {}),
      ...(isLayoutPreset(parsed.portrait) ? { portrait: parsed.portrait } : {}),
    };
  } catch {
    return EMPTY_PET_ROOM_LAYOUTS;
  }
}

function writeStoredPetRoomLayouts(layouts: StoredPetRoomLayouts) {
  try {
    window.localStorage.setItem(PET_ROOM_LAYOUT_STORAGE_KEY, JSON.stringify(layouts));
    return true;
  } catch {
    return false;
  }
}

function getPetLayoutViewport(): PetLayoutViewport {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const hasTouch = window.matchMedia("(pointer: coarse)").matches
    || navigator.maxTouchPoints > 0;
  return {
    enabled: Math.min(width, height) >= 600 && Math.max(width, height) >= 700 && hasTouch,
    orientation: width >= height ? "landscape" : "portrait",
  };
}

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
  mascotMotion: "IDLE",
  mascotAnimationUrl: null,
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
  PET_NEEDS_CARE: ["肚肚和水杯空啦，先照顾我吧！"],
  PET_HUNGRY: ["肚肚咕咕叫，给我一点点心吧！"],
  PET_THIRSTY: ["跑累啦，我想喝一口清凉的水。"],
  PET_TASK_START: ["新的一天开始啦，做完任务再回来！"],
  PET_TASK_PROGRESS: ["欢迎回来！按自己的节奏继续吧！"],
  PET_TASK_COMPLETE: ["今天辛苦啦，安心玩一会儿吧！"],
  PET_RELAX: ["今天没有新任务，一起轻松玩吧！"],
  PET_GENERAL: ["见到你真开心，来摸摸我吧！"],
};

function pickPetDialogue(
  dialogues: MascotDialogue[],
  context: PetDialogueContext,
  previousId?: string,
): MascotDialogue {
  if (dialogues.length > 0) {
    const available = dialogues.length > 1
      ? dialogues.filter((dialogue) => dialogue.id !== previousId)
      : dialogues;
    return available[Math.floor(Math.random() * available.length)]!;
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

function randomDelay(minimum: number, maximum: number) {
  return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
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
          <img className="pet-postcard__image-backdrop" src={trip.imageUrl} alt="" aria-hidden="true" decoding="async" />
          <div className="pet-postcard__paper">
            <div className="pet-postcard__photo">
              <img className="pet-postcard__destination" src={trip.imageUrl} alt={trip.destinationName} decoding="async" />
              <img className="pet-postcard__travel-mascot" src={mascotImage} alt={`${mascotName}在${trip.destinationName}旅行`} decoding="async" />
              <span>旅行明信片</span>
            </div>
            <div className="pet-postcard__paper-footer">
              <div><small>寄自</small><strong>{trip.city}</strong></div>
              <span className="pet-postcard__postmark" aria-hidden="true"><i /><i /><i /></span>
            </div>
          </div>
        </div>
        <div
          className="pet-postcard__content"
          role="region"
          aria-label={`${trip.destinationName}景点介绍，可上下滑动`}
          tabIndex={0}
        >
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
  const [wasteConfirm, setWasteConfirm] = useState<PetWaste | null>(null);
  const [wasteCleaning, setWasteCleaning] = useState<{ waste: PetWaste; startedAt: number } | null>(null);
  const [roomNotice, setRoomNotice] = useState<RoomNotice | null>(null);
  const [travelOpen, setTravelOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [themeShopOpen, setThemeShopOpen] = useState(false);
  const [themePreviewKey, setThemePreviewKey] = useState<string | null>(null);
  const [themePurchaseConfirm, setThemePurchaseConfirm] = useState<PetRoomTheme | null>(null);
  const [redPacketStage, setRedPacketStage] = useState<RedPacketStage | null>(null);
  const [redPacketReward, setRedPacketReward] = useState<RedPacketReward | null>(null);
  const [postcard, setPostcard] = useState<PetTrip | null>(null);
  const [selectedDialogue, setSelectedDialogue] = useState<MascotDialogue | null>(null);
  const [dialogueVisible, setDialogueVisible] = useState(false);
  const [dialogueDisplayToken, setDialogueDisplayToken] = useState(0);
  const [dialogueSpeaking, setDialogueSpeaking] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(initialPetSoundEnabled);
  const [now, setNow] = useState(Date.now());
  const [layoutViewport, setLayoutViewport] = useState(getPetLayoutViewport);
  const [storedRoomLayouts, setStoredRoomLayouts] = useState(readStoredPetRoomLayouts);
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [draftRoomLayout, setDraftRoomLayout] = useState<PetLayoutPreset | null>(null);
  const [pressedLayoutModule, setPressedLayoutModule] = useState<PetLayoutModule | null>(null);
  const [draggingLayoutModule, setDraggingLayoutModule] = useState<PetLayoutModule | null>(null);
  const careTimerRef = useRef<number | null>(null);
  const wasteCleaningTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const redPacketRainTimerRef = useRef<number | null>(null);
  const redPacketClaimKeyRef = useRef<string | null>(null);
  const dialogueAudioCacheRef = useRef(new Map<string, HTMLAudioElement>());
  const petSoundCacheRef = useRef(new Map<string, HTMLAudioElement>());
  const dialogueQueueRef = useRef<SinglePendingPlaybackQueue | null>(null);
  const petSoundQueueRef = useRef<SinglePendingPlaybackQueue | null>(null);
  const careSoundQueueRef = useRef<SinglePendingPlaybackQueue | null>(null);
  const entrySoundPlaybackRef = useRef<ReturnType<typeof createHtmlAudioPlayback> | null>(null);
  const redPacketRainAudioRef = useRef<HTMLAudioElement | null>(null);
  const redPacketRainPlaybackRef = useRef<ReturnType<typeof createHtmlAudioPlayback> | null>(null);
  const redPacketOpenAudioRef = useRef<HTMLAudioElement | null>(null);
  const redPacketOpenPlaybackRef = useRef<ReturnType<typeof createHtmlAudioPlayback> | null>(null);
  const soundRetryCleanupRef = useRef(new Set<() => void>());
  const postcardSoundTripIdRef = useRef<string | null>(null);
  const entryVisitHandledRef = useRef(false);
  const dialogueHasShownRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);
  const roomNoticeIdRef = useRef(0);
  const petStageRef = useRef<HTMLElement | null>(null);
  const layoutModuleRefs = useRef<Record<PetLayoutModule, HTMLElement | null>>({
    status: null,
    map: null,
    actions: null,
  });
  const draftRoomLayoutRef = useRef<PetLayoutPreset | null>(null);
  const layoutDragRef = useRef<PetLayoutDragSession | null>(null);
  const suppressLayoutClickUntilRef = useRef(0);
  const previousLayoutOrientationRef = useRef(layoutViewport.orientation);
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
  useEffect(() => {
    const updateLayoutViewport = () => {
      const next = getPetLayoutViewport();
      setLayoutViewport((current) => (
        current.enabled === next.enabled && current.orientation === next.orientation
          ? current
          : next
      ));
    };
    const viewport = window.visualViewport;
    window.addEventListener("resize", updateLayoutViewport);
    window.addEventListener("orientationchange", updateLayoutViewport);
    viewport?.addEventListener("resize", updateLayoutViewport);
    return () => {
      window.removeEventListener("resize", updateLayoutViewport);
      window.removeEventListener("orientationchange", updateLayoutViewport);
      viewport?.removeEventListener("resize", updateLayoutViewport);
    };
  }, []);
  useEffect(() => {
    if (layoutViewport.enabled) return;
    const drag = layoutDragRef.current;
    if (drag) window.clearTimeout(drag.timer);
    layoutDragRef.current = null;
    draftRoomLayoutRef.current = null;
    setLayoutEditing(false);
    setDraftRoomLayout(null);
    setPressedLayoutModule(null);
    setDraggingLayoutModule(null);
  }, [layoutViewport.enabled]);
  useEffect(() => {
    if (previousLayoutOrientationRef.current === layoutViewport.orientation) return;
    previousLayoutOrientationRef.current = layoutViewport.orientation;
    const drag = layoutDragRef.current;
    if (drag) window.clearTimeout(drag.timer);
    layoutDragRef.current = null;
    draftRoomLayoutRef.current = null;
    setLayoutEditing(false);
    setDraftRoomLayout(null);
    setPressedLayoutModule(null);
    setDraggingLayoutModule(null);
  }, [layoutViewport.orientation]);
  const stopEntrySound = useCallback(() => {
    entrySoundPlaybackRef.current?.cancel();
    entrySoundPlaybackRef.current = null;
  }, []);
  const stopRedPacketRainSound = useCallback(() => {
    redPacketRainPlaybackRef.current?.cancel();
    redPacketRainPlaybackRef.current = null;
    if (redPacketRainAudioRef.current) redPacketRainAudioRef.current.loop = false;
    clearWebMediaSession();
  }, []);
  const stopRedPacketOpenSound = useCallback(() => {
    redPacketOpenPlaybackRef.current?.cancel();
    redPacketOpenPlaybackRef.current = null;
    clearWebMediaSession();
  }, []);
  const playRedPacketRainSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    stopRedPacketRainSound();
    const audio = redPacketRainAudioRef.current ?? new Audio(redPacketRainSound);
    audio.preload = "auto";
    audio.loop = false;
    redPacketRainAudioRef.current = audio;
    const playback = createHtmlAudioPlayback(audio);
    redPacketRainPlaybackRef.current = playback;
    void playback.done.catch(() => undefined);
  }, [stopRedPacketRainSound]);
  const playRedPacketOpenSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    stopRedPacketOpenSound();
    const audio = redPacketOpenAudioRef.current ?? new Audio(redPacketOpenSound);
    audio.preload = "auto";
    redPacketOpenAudioRef.current = audio;
    const playback = createHtmlAudioPlayback(audio);
    redPacketOpenPlaybackRef.current = playback;
    void playback.done
      .catch(() => undefined)
      .finally(() => {
        if (redPacketOpenPlaybackRef.current === playback) redPacketOpenPlaybackRef.current = null;
        clearWebMediaSession();
      });
  }, [stopRedPacketOpenSound]);
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
    if (!state?.redPackets.availableCount) return;
    const rainAudio = redPacketRainAudioRef.current ?? new Audio(redPacketRainSound);
    const openAudio = redPacketOpenAudioRef.current ?? new Audio(redPacketOpenSound);
    rainAudio.preload = "auto";
    openAudio.preload = "auto";
    redPacketRainAudioRef.current = rainAudio;
    redPacketOpenAudioRef.current = openAudio;
    // Changing the claimed count updates this effect while the opening sound
    // is still playing. Calling load() here would reset that playback.
    if (rainAudio.paused) rainAudio.load();
    if (openAudio.paused) openAudio.load();
  }, [state?.redPackets.availableCount]);

  const dialogueContext = state ? roomDialogueContext(state) : null;
  const dialogueOptions = state?.dialogues ?? [];
  const dialogueSignature = dialogueContext
    ? `${dialogueContext}:${dialogueOptions.map((dialogue) => dialogue.id).join(",")}`
    : "";

  useEffect(() => {
    if (!dialogueContext) return;
    setSelectedDialogue((current) => {
      const remainsAvailable = current?.context === dialogueContext && (
        dialogueOptions.length === 0 || dialogueOptions.some((dialogue) => dialogue.id === current.id)
      );
      return remainsAvailable ? current : pickPetDialogue(dialogueOptions, dialogueContext);
    });
  }, [dialogueSignature]);

  useEffect(() => {
    if (!state || !dialogueContext || state.currentTrip || careAnimation || dialogueVisible) return;
    const delay = dialogueHasShownRef.current
      ? randomDelay(PET_DIALOGUE_INTERVAL_MIN_MS, PET_DIALOGUE_INTERVAL_MAX_MS)
      : randomDelay(PET_DIALOGUE_FIRST_DELAY_MIN_MS, PET_DIALOGUE_FIRST_DELAY_MAX_MS);
    const timer = window.setTimeout(() => {
      setSelectedDialogue((current) => pickPetDialogue(
        dialogueOptions,
        dialogueContext,
        current?.id,
      ));
      dialogueHasShownRef.current = true;
      setDialogueDisplayToken((current) => current + 1);
      setDialogueVisible(true);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [careAnimation, dialogueContext, dialogueSignature, dialogueVisible, state?.currentTrip?.id]);

  useEffect(() => {
    if (!dialogueVisible) return;
    const timer = window.setTimeout(() => setDialogueVisible(false), PET_DIALOGUE_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [dialogueDisplayToken, dialogueVisible]);

  useEffect(() => {
    if (!selectedDialogue?.audioUrl || dialogueAudioCacheRef.current.has(selectedDialogue.audioUrl)) return;
    const audio = new Audio(selectedDialogue.audioUrl);
    audio.preload = "auto";
    dialogueAudioCacheRef.current.set(selectedDialogue.audioUrl, audio);
  }, [selectedDialogue]);

  useEffect(() => () => {
    if (careTimerRef.current !== null) window.clearTimeout(careTimerRef.current);
    if (wasteCleaningTimerRef.current !== null) window.clearTimeout(wasteCleaningTimerRef.current);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    if (redPacketRainTimerRef.current !== null) window.clearTimeout(redPacketRainTimerRef.current);
    dialogueQueueRef.current?.clear();
    petSoundQueueRef.current?.clear();
    careSoundQueueRef.current?.clear();
    stopEntrySound();
    stopRedPacketRainSound();
    stopRedPacketOpenSound();
    soundRetryCleanupRef.current.forEach((cleanup) => cleanup());
    soundRetryCleanupRef.current.clear();
    const drag = layoutDragRef.current;
    if (drag) window.clearTimeout(drag.timer);
    layoutDragRef.current = null;
  }, [stopEntrySound, stopRedPacketOpenSound, stopRedPacketRainSound]);

  function speakPetDialogue() {
    if (!soundEnabledRef.current || !selectedDialogue || careAnimation) return;

    dialogueHasShownRef.current = true;
    setDialogueDisplayToken((current) => current + 1);
    setDialogueVisible(true);

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
      stopRedPacketRainSound();
      stopRedPacketOpenSound();
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

  function closeRedPacket() {
    if (redPacketStage === "opening") return;
    if (redPacketRainTimerRef.current !== null) window.clearTimeout(redPacketRainTimerRef.current);
    redPacketRainTimerRef.current = null;
    stopRedPacketRainSound();
    stopRedPacketOpenSound();
    if (redPacketReward) redPacketClaimKeyRef.current = null;
    setRedPacketStage(null);
    setRedPacketReward(null);
  }

  function startRedPacketFlow() {
    if (!state || state.redPackets.availableCount <= 0 || busy || redPacketStage) return;
    stopEntrySound();
    petSoundQueueRef.current?.clear();
    playRedPacketRainSound();
    setRedPacketReward(null);
    setRedPacketStage("rain");
    if (redPacketRainTimerRef.current !== null) window.clearTimeout(redPacketRainTimerRef.current);
    redPacketRainTimerRef.current = window.setTimeout(() => {
      setRedPacketStage("ready");
      redPacketRainTimerRef.current = null;
    }, RED_PACKET_RAIN_MS);
  }

  async function claimRedPacket() {
    if (!state || redPacketStage !== "ready" || busy) return;
    stopRedPacketRainSound();
    // Start within the tap gesture so Safari does not block the reward sound after the API returns.
    playRedPacketOpenSound();
    const claimKey = redPacketClaimKeyRef.current ?? actionKey("pet-red-packet");
    redPacketClaimKeyRef.current = claimKey;
    setBusy("red-packet");
    setRedPacketStage("opening");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const [result] = await Promise.all([
        openPetRedPacket(claimKey, controller.signal),
        new Promise((resolve) => window.setTimeout(resolve, 620)),
      ]);
      setState(result.state);
      setRedPacketReward(result.reward);
      redPacketClaimKeyRef.current = null;
      setRedPacketStage("revealed");
      setError("");
      navigator.vibrate?.([24, 35, 55]);
    } catch (reason) {
      stopRedPacketOpenSound();
      setRedPacketStage("ready");
      playRedPacketRainSound();
      showRoomNotice(reason instanceof ApiError ? reason.message : "红包暂时没有打开，请再试一次");
    } finally {
      window.clearTimeout(timeoutId);
      setBusy(null);
    }
  }

  function continueRedPackets() {
    if (!state || state.redPackets.availableCount <= 0) {
      closeRedPacket();
      return;
    }
    setRedPacketReward(null);
    redPacketClaimKeyRef.current = null;
    stopRedPacketOpenSound();
    playRedPacketRainSound();
    setRedPacketStage("rain");
    redPacketRainTimerRef.current = window.setTimeout(() => {
      setRedPacketStage("ready");
      redPacketRainTimerRef.current = null;
    }, RED_PACKET_RAIN_MS);
  }

  function captureCurrentRoomLayout(): PetLayoutPreset | null {
    const stage = petStageRef.current;
    if (!stage) return null;
    const stageRect = stage.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return null;

    const positions = {} as PetLayoutPreset;
    for (const module of ["status", "map", "actions"] as const) {
      const element = layoutModuleRefs.current[module];
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      positions[module] = {
        x: Math.min(1, Math.max(0, (rect.left + rect.width / 2 - stageRect.left) / stageRect.width)),
        y: Math.min(1, Math.max(0, (rect.top + rect.height / 2 - stageRect.top) / stageRect.height)),
      };
    }
    return positions;
  }

  function roomLayoutPosition(module: PetLayoutModule, clientX: number, clientY: number) {
    const stage = petStageRef.current;
    const element = layoutModuleRefs.current[module];
    if (!stage || !element) return null;

    const stageRect = stage.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const navTop = document.querySelector<HTMLElement>(".child-bottom-nav")
      ?.getBoundingClientRect().top ?? stageRect.bottom;
    const edgeGap = 12;
    const minX = stageRect.left + elementRect.width / 2 + edgeGap;
    const maxX = stageRect.right - elementRect.width / 2 - edgeGap;
    const minY = stageRect.top + elementRect.height / 2 + edgeGap;
    const maxY = Math.min(stageRect.bottom, navTop) - elementRect.height / 2 - edgeGap;
    const x = maxX > minX ? Math.min(maxX, Math.max(minX, clientX)) : stageRect.left + stageRect.width / 2;
    const y = maxY > minY ? Math.min(maxY, Math.max(minY, clientY)) : stageRect.top + stageRect.height / 2;
    return {
      x: Math.min(1, Math.max(0, (x - stageRect.left) / stageRect.width)),
      y: Math.min(1, Math.max(0, (y - stageRect.top) / stageRect.height)),
    };
  }

  function activateRoomLayoutDrag(session: PetLayoutDragSession) {
    try {
      session.target.setPointerCapture?.(session.pointerId);
    } catch {
      layoutDragRef.current = null;
      setPressedLayoutModule(null);
      return;
    }
    const baseline = draftRoomLayoutRef.current ?? captureCurrentRoomLayout();
    if (!baseline) return;
    draftRoomLayoutRef.current = baseline;
    setDraftRoomLayout(baseline);
    setLayoutEditing(true);
    setPressedLayoutModule(null);
    setDraggingLayoutModule(session.module);
    session.activated = true;
    navigator.vibrate?.(18);
  }

  function beginRoomLayoutDrag(module: PetLayoutModule, event: ReactPointerEvent<HTMLElement>) {
    if (!layoutViewport.enabled || state?.currentTrip || event.button !== 0) return;
    const previous = layoutDragRef.current;
    if (previous) window.clearTimeout(previous.timer);

    const session: PetLayoutDragSession = {
      module,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target: event.currentTarget,
      activated: false,
      timer: 0,
    };
    layoutDragRef.current = session;
    setPressedLayoutModule(module);

    if (layoutEditing) {
      event.preventDefault();
      activateRoomLayoutDrag(session);
      return;
    }
    session.timer = window.setTimeout(() => {
      if (layoutDragRef.current !== session) return;
      activateRoomLayoutDrag(session);
    }, PET_LAYOUT_LONG_PRESS_MS);
  }

  function moveRoomLayoutModule(event: ReactPointerEvent<HTMLElement>) {
    const session = layoutDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!session.activated) {
      const moved = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      if (moved > 12) {
        window.clearTimeout(session.timer);
        layoutDragRef.current = null;
        setPressedLayoutModule(null);
      }
      return;
    }

    event.preventDefault();
    const position = roomLayoutPosition(session.module, event.clientX, event.clientY);
    const current = draftRoomLayoutRef.current;
    if (!position || !current) return;
    const next = { ...current, [session.module]: position };
    draftRoomLayoutRef.current = next;
    setDraftRoomLayout(next);
  }

  function leaveRoomLayoutModule(event: ReactPointerEvent<HTMLElement>) {
    const session = layoutDragRef.current;
    if (!session || session.pointerId !== event.pointerId || session.activated) return;
    window.clearTimeout(session.timer);
    layoutDragRef.current = null;
    setPressedLayoutModule(null);
  }

  function finishRoomLayoutDrag(event: ReactPointerEvent<HTMLElement>) {
    const session = layoutDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    window.clearTimeout(session.timer);
    if (session.activated) {
      event.preventDefault();
      suppressLayoutClickUntilRef.current = performance.now() + 420;
    }
    if (session.target.hasPointerCapture?.(session.pointerId)) {
      session.target.releasePointerCapture(session.pointerId);
    }
    layoutDragRef.current = null;
    setPressedLayoutModule(null);
    setDraggingLayoutModule(null);
  }

  function blockRoomLayoutClick(event: ReactMouseEvent<HTMLElement>) {
    if (!layoutEditing && performance.now() >= suppressLayoutClickUntilRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function saveRoomLayout() {
    const preset = draftRoomLayoutRef.current;
    if (!preset) return;
    const next = {
      ...storedRoomLayouts,
      version: 1 as const,
      [layoutViewport.orientation]: preset,
    };
    const saved = writeStoredPetRoomLayouts(next);
    setStoredRoomLayouts(next);
    draftRoomLayoutRef.current = null;
    setDraftRoomLayout(null);
    setLayoutEditing(false);
    showRoomNotice(saved ? "小屋布置已经保存" : "当前浏览器无法保存布置");
  }

  function cancelRoomLayout() {
    draftRoomLayoutRef.current = null;
    setDraftRoomLayout(null);
    setLayoutEditing(false);
    setPressedLayoutModule(null);
    setDraggingLayoutModule(null);
  }

  function resetRoomLayout() {
    const next = { ...storedRoomLayouts };
    delete next[layoutViewport.orientation];
    const saved = writeStoredPetRoomLayouts(next);
    setStoredRoomLayouts(next);
    draftRoomLayoutRef.current = null;
    setDraftRoomLayout(null);
    setLayoutEditing(false);
    showRoomNotice(saved ? "已经恢复默认布置" : "当前浏览器无法保存布置");
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

  async function cleanWaste() {
    if (!state || !wasteConfirm || busy || wasteCleaning) return;
    const waste = wasteConfirm;
    setBusy("waste");
    try {
      const result = await cleanPetWaste(waste.id, actionKey("pet-waste"));
      setState(result);
      setWasteConfirm(null);
      setError("");
      const startedAt = Date.now();
      setWasteCleaning({ waste, startedAt });
      if (wasteCleaningTimerRef.current !== null) window.clearTimeout(wasteCleaningTimerRef.current);
      wasteCleaningTimerRef.current = window.setTimeout(() => {
        setWasteCleaning(null);
        showRoomNotice("小屋清理干净啦！");
        wasteCleaningTimerRef.current = null;
      }, WASTE_CLEANING_ANIMATION_MS);
    } catch (reason) {
      setWasteConfirm(null);
      showRoomNotice(reason instanceof ApiError ? reason.message : "小屋暂时没有清理成功");
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
  const visibleWaste = wasteCleaning?.waste ?? state.waste.active;
  const canShowRoomMascotAnimation = displayedRoomTheme.isOwned
    && !careAnimation
    && !wasteCleaning
    && !trip
    && state.pet.satiety >= 30
    && state.pet.hydration >= 30;
  const roomMascotMotion = canShowRoomMascotAnimation
    ? displayedRoomTheme.mascotMotion
    : "IDLE";
  const roomMascotImage = canShowRoomMascotAnimation && displayedRoomTheme.mascotAnimationUrl
    ? displayedRoomTheme.mascotAnimationUrl
    : roomMascotMotion === "IDLE"
      ? moodImage
      : uploadedNeutralImage ?? mascot.images.neutral;
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
  const activeRoomLayout = layoutViewport.enabled
    ? (layoutEditing ? draftRoomLayout : storedRoomLayouts[layoutViewport.orientation])
    : undefined;

  function roomLayoutModuleClass(base: string, module: PetLayoutModule) {
    return [
      base,
      "pet-layout-module",
      layoutViewport.enabled ? "is-layout-available" : "",
      activeRoomLayout?.[module] ? "is-layout-positioned" : "",
      layoutEditing ? "is-layout-editing" : "",
      pressedLayoutModule === module ? "is-long-pressing" : "",
      draggingLayoutModule === module ? "is-dragging" : "",
    ].filter(Boolean).join(" ");
  }

  function roomLayoutModuleStyle(module: PetLayoutModule): CSSProperties | undefined {
    const position = activeRoomLayout?.[module];
    if (!position) return undefined;
    return {
      left: `${position.x * 100}%`,
      top: `${position.y * 100}%`,
      right: "auto",
      bottom: "auto",
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <main
      className={`pet-growth-page pet-growth-page--${trip ? "travel" : "home"}${layoutEditing ? " is-room-layout-editing" : ""}`}
      onPointerDownCapture={stopEntrySound}
    >
      <section className="pet-growth-stage" ref={petStageRef}>
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

        {state.redPackets.availableCount > 0 && !trip && !careAnimation && !layoutEditing && (
          <button className="pet-red-packet-entry" type="button" disabled={Boolean(busy)} onClick={startRedPacketFlow} aria-label={`有 ${state.redPackets.availableCount} 个星宠红包可以打开`}>
            <span><img src={redPacketEntryImage} alt="" aria-hidden="true" /></span>
            <strong>升级红包</strong>
            <b>{state.redPackets.availableCount}</b>
          </button>
        )}

        <section
          className={roomLayoutModuleClass("pet-status-card", "status")}
          style={roomLayoutModuleStyle("status")}
          ref={(element) => { layoutModuleRefs.current.status = element; }}
          aria-label="星宠状态"
          onPointerDown={(event) => beginRoomLayoutDrag("status", event)}
          onPointerMove={moveRoomLayoutModule}
          onPointerLeave={leaveRoomLayoutModule}
          onPointerUp={finishRoomLayoutDrag}
          onPointerCancel={finishRoomLayoutDrag}
          onClickCapture={blockRoomLayoutClick}
        >
          <div className="pet-status-card__title"><div><small>成长阶段</small><strong>{state.pet.growthStage === "BABY" ? "幼年伙伴" : state.pet.growthStage === "GROWING" ? "成长伙伴" : "成熟伙伴"}</strong></div><span>Lv.{state.pet.level}</span></div>
          <div className="pet-growth-progress" aria-label={`${mascot.name}的成长进度 ${Math.round(levelProgress)}%`}>
            <div><strong>{mascot.name}的成长进度</strong><span>{Math.round(levelProgress)}%</span></div>
            <i><b style={{ width: `${levelProgress}%` }} /></i>
          </div>
          <Meter label="饱食度" value={state.pet.satiety} tone="#f59a55" />
          <Meter label="饮水状态" value={state.pet.hydration} tone="#55b9d6" />
          <div className="pet-spend-note">今日已使用 <strong>{state.wallet.dailySpent}</strong> 颗星{state.wallet.dailySpendLimitStars !== null && <> / {state.wallet.dailySpendLimitStars}</>}</div>
        </section>

        <button
          className={roomLayoutModuleClass("pet-map-entry", "map")}
          style={roomLayoutModuleStyle("map")}
          ref={(element) => { layoutModuleRefs.current.map = element; }}
          type="button"
          onClick={() => onNavigate("map")}
          onClickCapture={blockRoomLayoutClick}
          onPointerDown={(event) => beginRoomLayoutDrag("map", event)}
          onPointerMove={moveRoomLayoutModule}
          onPointerLeave={leaveRoomLayoutModule}
          onPointerUp={finishRoomLayoutDrag}
          onPointerCancel={finishRoomLayoutDrag}
          aria-label="打开星际航图"
        >
          <span className="pet-map-entry__sky" aria-hidden="true">
            <img src={PLANET_BY_KEY.EARTH.image} alt="" />
            <img src={PLANET_BY_KEY.SATURN.image} alt="" />
            <i /><i /><i />
          </span>
          <span className="pet-map-entry__copy">
            <small>探索宇宙</small>
            <strong><span className="pet-map-entry__desktop-label">星际航图</span><span className="pet-map-entry__mobile-label">航图</span></strong>
            <em>看看点亮了哪些星球</em>
          </span>
          <span className="pet-map-entry__arrow" aria-hidden="true">›</span>
        </button>

        {visibleWaste && !trip && (
          <button
            className={`pet-waste pet-waste--position-${visibleWaste.positionSeed % 4}${wasteCleaning ? " is-cleaning" : ""}`}
            type="button"
            disabled={Boolean(wasteCleaning) || Boolean(busy)}
            aria-label={wasteCleaning ? "正在清理星宠粑粑" : "发现星宠粑粑，点击清理"}
            onClick={() => setWasteConfirm(visibleWaste)}
          >
            <span className="pet-waste__odor" aria-hidden="true"><i /><i /><i /></span>
            <img className="pet-waste__pile" src={petWasteImage} alt="" />
            {wasteCleaning && (
              <span className="pet-waste__tools" aria-hidden="true">
                <img className="pet-waste__dustpan" src={petCleaningDustpanImage} alt="" />
                <img className="pet-waste__broom" src={petCleaningBroomImage} alt="" />
              </span>
            )}
          </button>
        )}

        <aside
          className={roomLayoutModuleClass("pet-action-rail", "actions")}
          style={roomLayoutModuleStyle("actions")}
          ref={(element) => { layoutModuleRefs.current.actions = element; }}
          aria-label="星宠操作"
          onPointerDown={(event) => beginRoomLayoutDrag("actions", event)}
          onPointerMove={moveRoomLayoutModule}
          onPointerLeave={leaveRoomLayoutModule}
          onPointerUp={finishRoomLayoutDrag}
          onPointerCancel={finishRoomLayoutDrag}
          onClickCapture={blockRoomLayoutClick}
        >
          <button className="pet-action-button pet-action-button--travel" type="button" disabled={Boolean(trip) || !state.travelEnabled || Boolean(busy) || Boolean(careAnimation) || Boolean(wasteCleaning)} onClick={() => setTravelOpen(true)}>
            <span className="pet-action-icon pet-action-icon--travel" aria-hidden="true"><img src={petActionTravelIcon} alt="" /></span><div><strong>准备旅行</strong><small>{state.travelEnabled ? "去看看远方" : "旅行已关闭"}</small></div>
          </button>
          <button className="pet-action-button pet-action-button--feed" type="button" disabled={Boolean(trip) || Boolean(busy) || Boolean(careAnimation) || Boolean(wasteCleaning)} onClick={() => requestCare("feed")}>
            <span className="pet-action-icon pet-action-icon--snack" aria-hidden="true"><img src={petActionSnackIcon} alt="" /></span><div><strong>{busy === "feed" ? "准备点心…" : careAnimation?.kind === "feed" ? "正在吃点心" : "喂点心"}</strong><small>使用 {state.careOptions.feed.costStars} 颗星</small></div>
          </button>
          <button className="pet-action-button pet-action-button--drink" type="button" disabled={Boolean(trip) || Boolean(busy) || Boolean(careAnimation) || Boolean(wasteCleaning)} onClick={() => requestCare("drink")}>
            <span className="pet-action-icon pet-action-icon--water" aria-hidden="true"><img src={petActionWaterIcon} alt="" /></span><div><strong>{busy === "drink" ? "准备清水…" : careAnimation?.kind === "drink" ? "正在喝水" : "喂水"}</strong><small>使用 {state.careOptions.drink.costStars} 颗星</small></div>
          </button>
          <button
            className="pet-action-button pet-action-button--decorate"
            type="button"
            disabled={Boolean(trip) || Boolean(busy) || Boolean(careAnimation) || Boolean(wasteCleaning)}
            onClick={() => {
              setThemePreviewKey(equippedRoomTheme.key);
              setThemeShopOpen(true);
            }}
          >
            <span className="pet-action-icon pet-action-icon--decorate" aria-hidden="true"><img src={ROOM_DECOR_ENTRY_IMAGE} alt="" /></span><div><strong>布置小屋</strong><small>{equippedRoomTheme.name}</small></div>
          </button>
          <button className="pet-action-button pet-action-button--album" type="button" disabled={Boolean(trip) || Boolean(busy) || Boolean(careAnimation) || Boolean(wasteCleaning)} onClick={() => setAlbumOpen(true)}>
            <span className="pet-action-icon pet-action-icon--album" aria-hidden="true"><img src={petActionAlbumIcon} alt="" /></span><div><strong>明信片册</strong><small>收藏 {state.postcards.length} 张</small></div>
          </button>
          <button className="pet-action-button pet-action-button--wish" type="button" disabled={Boolean(trip) || Boolean(busy) || Boolean(careAnimation) || Boolean(wasteCleaning)} onClick={() => onNavigate("wishes-requested")}>
            <span className="pet-action-icon pet-action-icon--wish" aria-hidden="true"><img src={petActionWishIcon} alt="" /></span><div><strong>星愿</strong><small>兑换小愿望</small></div>
          </button>
        </aside>

        {layoutEditing && (
          <div className="pet-layout-toolbar" role="status" aria-live="polite">
            <span><i aria-hidden="true" />拖动模块，布置你的星宠小屋</span>
            <div>
              <button type="button" onClick={cancelRoomLayout}>取消</button>
              <button type="button" onClick={resetRoomLayout}>恢复默认</button>
              <button className="pet-layout-toolbar__save" type="button" onClick={saveRoomLayout}>保存布置</button>
            </div>
          </div>
        )}

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
            <div className={`pet-main-figure pet-main-figure--${state.pet.growthStage.toLowerCase()} pet-main-figure--motion-${roomMascotMotion.toLowerCase().replaceAll("_", "-")}${dialogueSpeaking ? " pet-main-figure--speaking" : ""}`}>
              <span className="pet-main-figure__spark">✦</span>
              <button className="pet-main-figure__button" type="button" disabled={Boolean(careAnimation)} aria-label={`点击听${mascot.name}说话`} aria-pressed={dialogueSpeaking} onClick={speakPetDialogue}>
                <img src={roomMascotImage} alt={`你的星宠${mascot.name}`} />
              </button>
              {careAnimation ? (
                <div className="pet-care-progress" key={careAnimation.startedAt}>
                  <strong>{careAnimation.kind === "feed" ? "正在享用点心" : "正在补充水分"}</strong>
                  <i><b /></i>
                </div>
              ) : dialogueVisible && (
                <p key={`${selectedDialogue?.id ?? "fallback"}-${dialogueDisplayToken}`}>
                  {selectedDialogue?.text ?? PET_FALLBACK_DIALOGUES[roomDialogueContext(state)][0]}
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {redPacketStage && (
        <div className={`pet-red-packet-modal is-${redPacketStage}`} role="dialog" aria-modal="true" aria-label="星宠升级红包">
          <div className="pet-red-packet-modal__backdrop" aria-hidden="true" />
          <div className="pet-red-packet-light-show" aria-hidden="true">
            <i className="pet-red-packet-light-show__ring" />
            <i className="pet-red-packet-light-show__ring pet-red-packet-light-show__ring--outer" />
            {RED_PACKET_LIGHT_ITEMS.map((item, index) => (
              <b key={index} style={{
                "--red-packet-light-left": item.left,
                "--red-packet-light-top": item.top,
                "--red-packet-light-delay": item.delay,
                "--red-packet-light-scale": item.scale,
              } as CSSProperties} />
            ))}
          </div>
          <div className="pet-red-packet-rain" aria-hidden="true">
            {RED_PACKET_RAIN_ITEMS.map((item, index) => (
              <img
                src={redPacketEntryImage}
                alt=""
                key={index}
                style={{
                  "--red-packet-left": item.left,
                  "--red-packet-delay": item.delay,
                  "--red-packet-duration": item.duration,
                  "--red-packet-scale": item.scale,
                  "--red-packet-rotate": item.rotate,
                  "--red-packet-sway": item.sway,
                  "--red-packet-opacity": item.opacity,
                } as CSSProperties}
              />
            ))}
          </div>
          {redPacketStage !== "opening" && (
            <button className="pet-red-packet-modal__close" type="button" aria-label="关闭红包" onClick={closeRedPacket}>×</button>
          )}
          <section className="pet-red-packet-stage" aria-live="polite">
            {redPacketStage === "rain" && (
              <div className="pet-red-packet-arriving"><span>★</span><strong>升级惊喜正在降落</strong></div>
            )}
            {(redPacketStage === "ready" || redPacketStage === "opening") && (
              <button className="pet-red-packet-main" type="button" disabled={redPacketStage === "opening"} onClick={() => void claimRedPacket()}>
                <span className="pet-red-packet-main__halo" aria-hidden="true" />
                <img src={redPacketMainImage} alt="一个闪闪发光的星宠红包" />
                <strong>{redPacketStage === "opening" ? "惊喜马上出现" : "点一下，拆开惊喜"}</strong>
              </button>
            )}
            {redPacketStage === "revealed" && redPacketReward && (
              <div className="pet-red-packet-reward">
                <div className="pet-red-packet-reward__burst" aria-hidden="true">
                  {RED_PACKET_BURST_ITEMS.map((item, index) => (
                    <i key={index} style={{
                      "--burst-angle": item.angle,
                      "--burst-distance": item.distance,
                      "--burst-delay": item.delay,
                    } as CSSProperties}>★</i>
                  ))}
                </div>
                <div className="pet-red-packet-reward__crown" aria-hidden="true"><span>★</span></div>
                <h2>红包开出</h2>
                <div className="pet-red-packet-reward__stars"><b>+</b><strong>{redPacketReward.stars}</strong><span>颗星</span></div>
                <button type="button" onClick={continueRedPackets}>{state.redPackets.availableCount > 0 ? "再开一个" : "收下星星"}</button>
              </div>
            )}
          </section>
        </div>
      )}

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
              <span className={`pet-action-icon ${careConfirmation.kind === "feed" ? "pet-action-icon--snack" : "pet-action-icon--water"}`}><img src={careConfirmation.kind === "feed" ? petActionSnackIcon : petActionWaterIcon} alt="" /></span>
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

      {wasteConfirm && (
        <div className="pet-modal pet-waste-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="pet-waste-confirm-title">
          <button className="pet-modal__backdrop" type="button" aria-label="暂时不清理" disabled={busy === "waste"} onClick={() => setWasteConfirm(null)} />
          <section className="pet-waste-confirm">
            <div className="pet-waste-confirm__scene" aria-hidden="true">
              <img src={petWasteImage} alt="" />
              <span><i /><i /><i /></span>
            </div>
            <small>小屋清洁任务</small>
            <h2 id="pet-waste-confirm-title">帮{mascot.name}把小屋打扫干净吗？</h2>
            <p>扫走粑粑，小屋马上恢复清清爽爽。</p>
            <div className="pet-waste-confirm__cost"><b>★</b><span>需要 <strong>{wasteConfirm.costStars}</strong> 颗星</span></div>
            {state.wallet.starBalance < wasteConfirm.costStars && <div className="pet-care-confirm__warning">星星余额不足，暂时不能清理</div>}
            <div className="pet-care-confirm__actions">
              <button type="button" disabled={busy === "waste"} onClick={() => setWasteConfirm(null)}>等一会儿</button>
              <button type="button" disabled={Boolean(busy) || state.wallet.starBalance < wasteConfirm.costStars} onClick={() => void cleanWaste()}>{busy === "waste" ? "正在准备工具…" : "一起打扫"}</button>
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
                return <button className={`pet-trip-option pet-trip-option--${option.tier.toLowerCase()}`} key={option.tier} type="button" disabled={Boolean(busy) || state.wallet.starBalance < option.costStars} onClick={() => void depart(option.tier)}><span className={`pet-trip-icon pet-trip-icon--${option.tier.toLowerCase()}`} aria-hidden="true"><img src={TRIP_ICON_BY_TIER[option.tier]} alt="" /></span><strong>{copy.name}</strong><small>{copy.note}<em>{formatDuration(option.durationMinutes)}</em></small><b className="pet-trip-price">★ {option.costStars}</b></button>;
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
