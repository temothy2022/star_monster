import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  careForPet,
  getPetGrowth,
  revealPetTrip,
  startPetTrip,
  type PetGrowthState,
  type PetTravelTier,
  type PetTrip,
} from "../api/child-api";
import { useMascot } from "../mascots";

const TIER_COPY: Record<PetTravelTier, { name: string; note: string; icon: string }> = {
  NEARBY: { name: "附近散步", note: "很快回来", icon: "🧺" },
  CHINA: { name: "中国旅行", note: "发现山河故事", icon: "🧳" },
  WORLD: { name: "世界旅行", note: "认识远方风景", icon: "🌍" },
};

function actionKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
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

function Meter({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: string }) {
  return (
    <div className="pet-meter">
      <div className="pet-meter__label"><span>{icon} {label}</span><strong>{value}</strong></div>
      <div className="pet-meter__track"><i style={{ width: `${value}%`, background: tone }} /></div>
    </div>
  );
}

function Postcard({ trip, onClose }: { trip: PetTrip; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState(false);

  function speak() {
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setSpeaking(true);
    if (trip.audioUrl) {
      const audio = new Audio(trip.audioUrl);
      audioRef.current = audio;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => {
        setSpeaking(false);
        fallbackSpeak();
      };
      void audio.play().catch(fallbackSpeak);
      return;
    }
    fallbackSpeak();
  }

  function fallbackSpeak() {
    if (!window.speechSynthesis) {
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(
      `${trip.destinationName}。${trip.introduction}。你知道吗？${trip.funFact}`,
    );
    utterance.lang = "zh-CN";
    utterance.rate = 0.86;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  useEffect(() => () => {
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
  }, []);

  return (
    <div className="pet-modal" role="dialog" aria-modal="true" aria-label={`${trip.destinationName}旅行明信片`}>
      <button className="pet-modal__backdrop" type="button" aria-label="关闭" onClick={onClose} />
      <article className="pet-postcard">
        <button className="pet-postcard__close" type="button" onClick={onClose} aria-label="关闭明信片">×</button>
        <div className="pet-postcard__image-wrap">
          <img src={trip.imageUrl} alt={trip.destinationName} />
          <span>旅行明信片</span>
        </div>
        <div className="pet-postcard__content">
          <p className="pet-postcard__location">{trip.city} · {trip.country}</p>
          <h2>{trip.destinationName}</h2>
          <p>{trip.introduction}</p>
          <div className="pet-postcard__fact"><strong>有趣的小知识</strong>{trip.funFact}</div>
          <button className={`pet-audio-button${speaking ? " is-speaking" : ""}`} type="button" onClick={speak}>
            <span>{speaking ? "◼" : "▶"}</span>{speaking ? "正在讲给你听" : "听听这个地方"}
          </button>
        </div>
      </article>
    </div>
  );
}

export function PetGrowthPage({ onBack }: { onBack: () => void }) {
  const { mascot } = useMascot();
  const [state, setState] = useState<PetGrowthState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [travelOpen, setTravelOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [postcard, setPostcard] = useState<PetTrip | null>(null);
  const [now, setNow] = useState(Date.now());

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
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (state?.currentTrip?.status !== "TRAVELING") return;
    const timer = window.setInterval(() => void load(true), 10_000);
    return () => window.clearInterval(timer);
  }, [load, state?.currentTrip?.status]);
  useEffect(() => {
    const visible = () => document.visibilityState === "visible" && void load(true);
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [load]);

  const moodImage = useMemo(() => {
    if (!state) return mascot.images.neutral;
    if (busy === "feed") return mascot.activityImages.eating;
    if (busy === "drink") return mascot.activityImages.drinking;
    if (state.currentTrip?.status === "TRAVELING") return mascot.activityImages.travel;
    if (state.pet.satiety < 30 || state.pet.hydration < 30) return mascot.activityImages.hungry;
    if (state.currentTrip) return mascot.images.celebrate;
    if (state.pet.satiety > 85 && state.pet.hydration > 85) return mascot.images.celebrate;
    return mascot.images.neutral;
  }, [busy, mascot.activityImages, mascot.images, state]);

  async function care(kind: "feed" | "drink") {
    if (busy) return;
    setBusy(kind);
    try {
      setState(await careForPet(kind, actionKey(kind)));
      setError("");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "照顾星宠没有完成");
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

  if (!state) {
    return <main className="pet-growth-page pet-growth-page--loading"><div className="pet-loading"><i /><span>{error || "正在打开星宠小屋…"}</span><button type="button" onClick={() => void load()}>重新加载</button></div></main>;
  }

  const trip = state.currentTrip;
  const levelRange = state.pet.nextLevelExperience === null
    ? 1
    : Math.max(1, state.pet.nextLevelExperience - state.pet.currentLevelStart);
  const levelProgress = state.pet.nextLevelExperience === null
    ? 100
    : Math.min(100, Math.max(0, ((state.pet.experience - state.pet.currentLevelStart) / levelRange) * 100));

  return (
    <main className={`pet-growth-page pet-growth-page--${trip ? "travel" : "home"}`}>
      <header className="pet-growth-header">
        <button className="pet-back-button" type="button" onClick={onBack} aria-label="返回任务列表">‹ <span>返回</span></button>
        <div className="pet-level-card">
          <span>Lv.{state.pet.level}</span>
          <div><strong>{mascot.name}</strong><i><b style={{ width: `${levelProgress}%` }} /></i></div>
        </div>
        <div className="pet-star-balance"><span>★</span><strong>{state.wallet.starBalance}</strong></div>
      </header>

      <section className="pet-growth-stage">
        <div className="pet-room-backdrop" />
        {trip?.status === "TRAVELING" ? (
          <div className="pet-traveling-scene">
            <div className="pet-traveling-orbit"><span>✦</span><span>✦</span><span>✦</span></div>
            <img src={moodImage} alt={`${mascot.name}正在旅行`} />
            <div className="pet-suitcase">▣</div>
            <h1>{mascot.name}出发旅行啦</h1>
            <p>回来时会带一张神秘明信片</p>
            <time>{formatCountdown(trip.returnsAt, now)}</time>
          </div>
        ) : trip?.status === "RETURNED" ? (
          <div className="pet-return-scene">
            <div className="pet-return-card"><img src={trip.imageUrl} alt="神秘旅行明信片" /></div>
            <img className="pet-return-mascot" src={mascot.images.celebrate} alt={`${mascot.name}旅行归来`} />
            <h1>{mascot.name}回来啦！</h1>
            <button type="button" disabled={busy === "reveal"} onClick={() => void reveal()}>{busy === "reveal" ? "正在打开…" : "拆开明信片"}</button>
          </div>
        ) : (
          <>
            <div className={`pet-main-figure pet-main-figure--${state.pet.growthStage.toLowerCase()}`}>
              <span className="pet-main-figure__spark">✦</span>
              <img src={moodImage} alt={`你的星宠${mascot.name}`} />
              <p>{state.pet.satiety < 30 ? "肚子有一点饿啦" : state.pet.hydration < 30 ? "想喝一点水" : "今天想去哪里看看呢？"}</p>
            </div>
            <div className="pet-care-controls">
              <button type="button" disabled={Boolean(busy)} onClick={() => void care("feed")}>
                <span>🍎</span><strong>{busy === "feed" ? "准备中…" : "喂点心"}</strong><small>★ {state.careOptions.feed.costStars}</small>
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => void care("drink")}>
                <span>💧</span><strong>{busy === "drink" ? "准备中…" : "喂水"}</strong><small>★ {state.careOptions.drink.costStars}</small>
              </button>
            </div>
          </>
        )}
      </section>

      <aside className="pet-growth-panel">
        <div className="pet-growth-panel__title"><div><small>成长阶段</small><strong>{state.pet.growthStage === "BABY" ? "幼年伙伴" : state.pet.growthStage === "GROWING" ? "成长伙伴" : "成熟伙伴"}</strong></div><span>第 {state.pet.level} 级</span></div>
        <Meter label="饱食度" value={state.pet.satiety} tone="#f59a55" icon="●" />
        <Meter label="饮水状态" value={state.pet.hydration} tone="#55b9d6" icon="◆" />
        {error && <div className="pet-inline-error" onClick={() => setError("")}>{error}</div>}
        <div className="pet-primary-actions">
          <button type="button" disabled={Boolean(trip) || !state.travelEnabled} onClick={() => setTravelOpen(true)}><span>✈</span><div><strong>准备旅行</strong><small>{state.travelEnabled ? "选择旅费，目的地会是惊喜" : "家长暂时关闭了旅行"}</small></div></button>
          <button type="button" onClick={() => setAlbumOpen(true)}><span>▧</span><div><strong>明信片册</strong><small>已经收藏 {state.postcards.length} 张</small></div></button>
        </div>
        <div className="pet-spend-note">今天为星宠使用了 <strong>{state.wallet.dailySpent}</strong> 颗星{state.wallet.dailySpendLimitStars !== null && <>，上限 {state.wallet.dailySpendLimitStars} 颗</>}</div>
      </aside>

      {travelOpen && (
        <div className="pet-modal" role="dialog" aria-modal="true" aria-label="选择旅行">
          <button className="pet-modal__backdrop" type="button" aria-label="关闭" onClick={() => setTravelOpen(false)} />
          <section className="pet-travel-sheet">
            <header><div><small>给星宠准备旅费</small><h2>这次去哪里，会是一个惊喜</h2></div><button type="button" onClick={() => setTravelOpen(false)} aria-label="关闭">×</button></header>
            <div className="pet-travel-options">
              {state.travelOptions.map((option) => {
                const copy = TIER_COPY[option.tier];
                return <button key={option.tier} type="button" disabled={Boolean(busy) || state.wallet.starBalance < option.costStars} onClick={() => void depart(option.tier)}><span>{copy.icon}</span><strong>{copy.name}</strong><small>{copy.note} · {formatDuration(option.durationMinutes)}</small><b>★ {option.costStars}</b></button>;
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
            {state.postcards.length ? <div className="pet-album__grid">{state.postcards.map((item) => <button type="button" key={item.id} onClick={() => setPostcard(item)}><img src={item.imageUrl} alt={item.destinationName} /><span>{item.destinationName}</span><small>{item.city} · {item.country}</small></button>)}</div> : <div className="pet-album__empty"><span>✉</span><strong>还没有明信片</strong><p>准备一次旅行，星宠回来时会带来第一张收藏。</p></div>}
          </section>
        </div>
      )}
      {postcard && <Postcard trip={postcard} onClose={() => setPostcard(null)} />}
    </main>
  );
}
