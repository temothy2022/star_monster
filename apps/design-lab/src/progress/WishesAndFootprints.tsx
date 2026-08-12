import {
  useEffect,
  useRef,
  useState,
} from "react";
import balanceStar from "@star-monsters/assets/icons/wishes/balance-star.svg";
import costStar from "@star-monsters/assets/icons/wishes/cost-star.svg";
import redeemedCheck from "@star-monsters/assets/icons/wishes/redeemed-check.svg";
import requestSparkle from "@star-monsters/assets/icons/wishes/request-sparkle.svg";
import starIcon from "@star-monsters/assets/icons/wishes/star.svg";
import confirmStar from "@star-monsters/assets/icons/wishes/confirm-star.svg";
import footprintStar from "@star-monsters/assets/icons/footprints/star.svg";
import selectedPattern from "@star-monsters/assets/icons/footprints/selected-pattern.svg";
import detailPattern from "@star-monsters/assets/icons/footprints/detail-pattern.svg";
import triumphIcon from "@star-monsters/assets/icons/footprints/triumph.svg";
import readingIcon from "@star-monsters/assets/icons/footprints/task-reading.svg";
import mathIcon from "@star-monsters/assets/icons/footprints/task-math.svg";
import booksIcon from "@star-monsters/assets/icons/footprints/task-books.svg";
import { MASCOTS } from "../mascots";
import { PLANET_BY_KEY } from "../planets/planet-data";
import { ChildBottomNav, type ChildRoute } from "../components/ChildBottomNav";
import { ChildDataState } from "../components/ChildDataState";
import sportsReward from "@star-monsters/assets/images/reward-categories/sports.webp";
import gamesReward from "@star-monsters/assets/images/reward-categories/games.webp";
import televisionReward from "@star-monsters/assets/images/reward-categories/television.webp";
import toysReward from "@star-monsters/assets/images/reward-categories/toys.webp";
import challengeChatPaper from "@star-monsters/assets/images/challenge-letters/chat-paper.webp?no-inline";
import fallbackChallengeAvatar from "@star-monsters/assets/images/challenge-letters/xiaoyue-avatar.webp?no-inline";
import challengeInboxEntry from "@star-monsters/assets/images/challenge-letters/inbox-entry.webp?no-inline";
import {
  ApiError,
  getChildFootprints,
  getChallengeContacts,
  getChallengeConversation,
  getChildWishes,
  redeemChildWish,
  sendChallengeReply,
  startChallengeConversation,
  type ChallengeContact,
  type ChallengeConversation,
  type ChildWish,
  type FootprintResponse,
} from "../api/child-api";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { reportChildPageReady } from "../api/performance-telemetry";
import { LEADERBOARD_AVATARS } from "./leaderboard-avatars";
import { LEADERBOARD_FLAGS } from "./leaderboard-flags";

type RequestedWish = {
  id: string;
  title: string;
  cost: number;
  image: string;
  state:
    | "redeemed"
    | "processing"
    | "cooldown"
    | "soldout"
    | "available"
    | "insufficient";
  ruleText: string;
  actionText: string;
};

const CATEGORY_IMAGES: Record<ChildWish["category"], string> = {
  SPORTS: sportsReward,
  GAMES: gamesReward,
  TELEVISION: televisionReward,
  TOYS: toysReward,
};

function wishRuleText(wish: ChildWish) {
  if (wish.redemptionType === "ONE_TIME") return "仅可兑换一次";
  if (wish.redemptionType === "STOCK") {
    return `剩余 ${wish.stockRemaining ?? 0} 份`;
  }
  if (wish.recurrenceKind === "DAILY") return "每天可兑换一次";
  if (wish.recurrenceKind === "WEEKLY") return "每周可兑换一次";
  return `每 ${wish.recurrenceIntervalDays ?? 1} 天可兑换一次`;
}

function nextDateText(date: string | null) {
  if (!date) return "下个周期可兑换";
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日可兑换`;
}

type LeaderboardPeriod = "daily" | "weekly";

function RequestedWishCard({
  wish,
  onRequest,
}: {
  wish: RequestedWish;
  onRequest: () => void;
}) {
  return (
    <article className={`requested-wish-card requested-wish-card--${wish.state}`}>
      <div className="requested-wish-card__image">
        <img src={wish.image} alt="" loading="lazy" decoding="async" />
      </div>
      <div className="requested-wish-card__body">
        <div>
          <h2>{wish.title}</h2>
          <p><img src={costStar} alt="星星" />{wish.cost} 星星</p>
          <small className="requested-wish-card__rule">{wish.ruleText}</small>
        </div>
        {wish.state === "redeemed" ? (
          <div className="requested-wish-card__redeemed" aria-label="已兑换">
            <span />
            <strong><img src={redeemedCheck} alt="" />已兑换</strong>
          </div>
        ) : (
          <button
            type="button"
            className="requested-wish-card__button"
            disabled={wish.state !== "available"}
            onClick={wish.state === "available" ? onRequest : undefined}
          >
            <img src={requestSparkle} alt="" />
            <span>{wish.actionText}</span>
          </button>
        )}
      </div>
    </article>
  );
}

export function WishesRequested({
  onNavigate,
}: {
  onNavigate: (route: ChildRoute) => void;
}) {
  const [wishData, setWishData] = useState<{
    starBalance: number;
    wishes: ChildWish[];
  } | null>(null);
  const [selectedWish, setSelectedWish] = useState<{
    display: RequestedWish;
    apiWish: ChildWish;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void getChildWishes(controller.signal)
      .then((result) => {
        if (!cancelled) setWishData(result);
      })
      .catch((reason) => {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
          return;
        }
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "星愿暂时无法读取");
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useLiveRefresh(
    async (signal) => {
      try {
        setWishData(await getChildWishes(signal));
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
        }
      }
    },
    {
      enabled: Boolean(wishData) && !selectedWish && !submitting,
    },
  );

  useEffect(() => {
    if (wishData) {
      reportChildPageReady("wishes-requested", "/api/child/wishes");
    }
  }, [wishData]);

  const displayedWishes: RequestedWish[] =
    wishData?.wishes.map((wish) => ({
      id: wish.id,
      title: wish.title,
      cost: wish.costStars,
      image: CATEGORY_IMAGES[wish.category],
      ruleText: wishRuleText(wish),
      state:
        wish.unavailableReason === "ALREADY_COMPLETED"
          ? "redeemed"
          : wish.unavailableReason === "ALREADY_REQUESTED"
            ? "processing"
            : wish.unavailableReason === "COOLDOWN"
              ? "cooldown"
              : wish.unavailableReason === "OUT_OF_STOCK"
                ? "soldout"
          : wish.canRedeem
            ? "available"
            : "insufficient",
      actionText:
        wish.unavailableReason === "ALREADY_COMPLETED"
          ? "已兑换"
          : wish.unavailableReason === "ALREADY_REQUESTED"
            ? "兑换处理中"
            : wish.unavailableReason === "COOLDOWN"
              ? nextDateText(wish.nextEligibleDate)
              : wish.unavailableReason === "OUT_OF_STOCK"
                ? "已兑完"
                : wish.canRedeem
                  ? "兑换星愿"
                  : "余额不足",
    })) ?? [];

  async function confirmWish() {
    if (!selectedWish) return;
    setSubmitting(true);
    setError("");
    try {
      await redeemChildWish(selectedWish.apiWish.id);
      setWishData(await getChildWishes());
      setSelectedWish(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "兑换没有完成，请再试一次");
    } finally {
      setSubmitting(false);
    }
  }

  if (!wishData) {
    return (
      <main className="wishes-page wishes-page--requested">
        <ChildDataState
          error={Boolean(error)}
          message={error || "正在读取星愿…"}
        />
        <ChildBottomNav active="wish" onNavigate={onNavigate} />
      </main>
    );
  }

  return (
    <main className="wishes-page wishes-page--requested">
      <section className="requested-wishes-frame" aria-label="星愿兑换">
        <header className="requested-wishes-header">
          <div className="requested-wishes-balance">
            <img src={balanceStar} alt="星星" />
            <strong>当前余额 {wishData.starBalance}</strong>
          </div>
          <div className="requested-wishes-message">换星愿，航程不会后退</div>
        </header>
        <div className="requested-wishes-grid">
          {displayedWishes.length === 0 && (
            <div className="child-data-empty">还没有可兑换的星愿</div>
          )}
          {displayedWishes.map((wish) => (
            <RequestedWishCard
              wish={wish}
              key={wish.id}
              onRequest={() => {
                const apiWish = wishData.wishes.find((item) => item.id === wish.id);
                if (!apiWish) return;
                setError("");
                setSelectedWish({ display: wish, apiWish });
              }}
            />
          ))}
        </div>
      </section>
      <ChildBottomNav active="wish" onNavigate={onNavigate} />
      {selectedWish && (
        <>
          <button
            className="wish-confirm-backdrop"
            type="button"
            aria-label="取消兑换星愿"
            disabled={submitting}
            onClick={() => setSelectedWish(null)}
          />
          <section
            className="wish-confirm-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wish-confirm-title"
          >
            <div className="wish-confirm-sheet__content">
              <div className="wish-confirm-sheet__icon"><img src={confirmStar} alt="" /></div>
              <h2 id="wish-confirm-title">
                <span className="wish-confirm-sheet__title--desktop">
                  使用 {selectedWish.display.cost} 颗星兑换{selectedWish.display.title}？
                </span>
                <span className="wish-confirm-sheet__title--mobile">是否确认兑换？</span>
              </h2>
              <p className="wish-confirm-sheet__hint">太阳系航程不会后退。</p>
              {error && <p className="wish-confirm-error" role="alert">{error}</p>}
              <div className="wish-confirm-sheet__actions">
                <button type="button" disabled={submitting} onClick={() => setSelectedWish(null)}>取消</button>
                <button type="button" disabled={submitting} onClick={() => void confirmWish()}>
                  {submitting ? "兑换中…" : "确认兑换"}
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function FootprintLeaderboard({
  leaderboards,
  period,
  onPeriodChange,
  onPartnerSelect,
}: {
  leaderboards: FootprintResponse["leaderboards"];
  period: LeaderboardPeriod;
  onPeriodChange: (period: LeaderboardPeriod) => void;
  onPartnerSelect: (partner: { competitorId: string; displayName: string; avatarKey: string }) => void;
}) {
  const leaderboard = leaderboards[period];
  return (
    <aside className="footprints-leaderboard" aria-label="小朋友排行榜">
      <div className="footprints-leaderboard__tabs" aria-label="排行榜周期">
        <button
          type="button"
          className={period === "daily" ? "is-active" : ""}
          aria-pressed={period === "daily"}
          onClick={() => onPeriodChange("daily")}
        >
          今日榜
        </button>
        <button
          type="button"
          className={period === "weekly" ? "is-active" : ""}
          aria-pressed={period === "weekly"}
          onClick={() => onPeriodChange("weekly")}
        >
          本周榜
        </button>
      </div>

      <ol className="footprints-leaderboard__list">
        {leaderboard.entries.map((entry) => (
          <li
            className={`footprints-leaderboard__row${entry.isSelf ? " footprints-leaderboard__row--self" : ""}`}
            key={`${period}-${entry.competitorId ?? "self"}`}
          >
            <span className={`footprints-leaderboard__rank footprints-leaderboard__rank--${Math.min(entry.rank ?? 4, 4)}${entry.rank === null ? " footprints-leaderboard__rank--unlisted" : ""}`}>
              {entry.rank ?? "..."}
            </span>
            {entry.isSelf || !entry.competitorId || !entry.avatarKey ? <span className="footprints-leaderboard__avatar" aria-hidden="true">
              <img
                className="footprints-leaderboard__portrait"
                src={entry.avatarUrl ?? (entry.avatarKey ? LEADERBOARD_AVATARS[entry.avatarKey] : MASCOTS[entry.petType].images.neutral)}
                alt=""
                loading={entry.isSelf ? "eager" : "lazy"}
                decoding="async"
              />
              <img className="footprints-leaderboard__flag" src={LEADERBOARD_FLAGS[entry.flagKey]} alt="" loading="lazy" />
            </span> : <button type="button" className="footprints-leaderboard__avatar footprints-leaderboard__avatar--chat" aria-label={`给${entry.displayName}发消息`} onClick={() => onPartnerSelect({ competitorId: entry.competitorId!, displayName: entry.displayName, avatarKey: entry.avatarKey! })}><img className="footprints-leaderboard__portrait" src={entry.avatarUrl ?? LEADERBOARD_AVATARS[entry.avatarKey]} alt="" loading="lazy" decoding="async" /><img className="footprints-leaderboard__flag" src={LEADERBOARD_FLAGS[entry.flagKey]} alt="" loading="lazy" /></button>}
            <span className="footprints-leaderboard__name">
              <strong>{entry.displayName}</strong>
            </span>
            <span className="footprints-leaderboard__stars">
              <strong>{entry.stars}</strong>
              <img src={footprintStar} alt="星星" />
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function Footprints({
  onNavigate,
}: {
  onNavigate: (route: ChildRoute) => void;
}) {
  const [footprints, setFootprints] = useState<FootprintResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<LeaderboardPeriod>("daily");
  const [mobilePanel, setMobilePanel] = useState<"records" | "leaderboard">("records");
  const [error, setError] = useState("");
  const [challengeConversation, setChallengeConversation] = useState<ChallengeConversation | null>(null);
  const [challengeContacts, setChallengeContacts] = useState<ChallengeContact[]>([]);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [challengeInput, setChallengeInput] = useState("");
  const [challengeSending, setChallengeSending] = useState(false);
  const [challengeError, setChallengeError] = useState("");
  const challengeMessagesRef = useRef<HTMLDivElement | null>(null);

  async function openChallengeInbox(competitorId?: string) {
    setChallengeOpen(true); setChallengeError("");
    try {
      const result = await getChallengeConversation(competitorId);
      setChallengeContacts(result.contacts);
      setChallengeConversation(result.conversation);
    } catch (reason) {
      setChallengeError(reason instanceof Error ? reason.message : "来信暂时打不开");
    }
  }

  async function openLeaderboardPartner(partner: { competitorId: string; displayName: string; avatarKey: string }) {
    setChallengeOpen(true); setChallengeError("");
    try {
      const result = await startChallengeConversation(partner);
      setChallengeContacts(result.contacts);
      setChallengeConversation(result.conversation);
    } catch (reason) {
      setChallengeError(reason instanceof Error ? reason.message : "暂时不能联系这个伙伴");
    }
  }

  useEffect(() => {
    const messageList = challengeMessagesRef.current;
    if (!challengeOpen || !messageList) return;
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
  }, [challengeConversation?.messages.length, challengeOpen, challengeSending]);

  useEffect(() => {
    let competitorId = "";
    try {
      competitorId = window.sessionStorage.getItem("star-monsters-open-challenge-letter") ?? "";
      if (competitorId) window.sessionStorage.removeItem("star-monsters-open-challenge-letter");
    } catch { /* optional navigation intent */ }
    if (competitorId) void openChallengeInbox(competitorId);
  }, []);

  useEffect(() => {
    const nextVisibleAt = challengeConversation?.nextVisibleAt;
    if (!challengeOpen || !nextVisibleAt || !challengeConversation) return;
    const wait = Math.max(250, new Date(nextVisibleAt).getTime() - Date.now() + 250);
    const timer = window.setTimeout(() => {
      void getChallengeConversation(challengeConversation.partner.competitorId).then((result) => {
        setChallengeContacts(result.contacts);
        setChallengeConversation(result.conversation);
      }).catch(() => undefined);
    }, Math.min(wait, 61_000));
    return () => window.clearTimeout(timer);
  }, [challengeConversation, challengeOpen]);

  useEffect(() => {
    void getChallengeContacts().then(({ contacts }) => setChallengeContacts(contacts)).catch(() => undefined);
  }, []);

  async function submitChallengeReply(event: React.FormEvent) {
    event.preventDefault();
    const text = challengeInput.trim();
    if (!text || challengeSending || !challengeConversation) return;
    const competitorId = challengeConversation.partner.competitorId;
    const optimisticMessage = { id: `pending-${Date.now()}`, sender: "CHILD" as const, text, createdAt: new Date().toISOString() };
    setChallengeInput("");
    setChallengeConversation((current) => current ? {
      ...current,
      messages: [...current.messages, optimisticMessage],
      sentToday: current.sentToday + 1,
      remainingToday: Math.max(0, current.remainingToday - 1),
    } : current);
    setChallengeContacts((current) => current.map((contact) => contact.competitorId === competitorId
      ? { ...contact, latestMessage: text, latestAt: optimisticMessage.createdAt }
      : contact).sort((left, right) => new Date(right.latestAt).getTime() - new Date(left.latestAt).getTime()));
    setChallengeSending(true); setChallengeError("");
    try {
      const result = await sendChallengeReply(competitorId, text);
      setChallengeContacts(result.contacts);
      setChallengeConversation(result.conversation);
    } catch (reason) {
      setChallengeError(reason instanceof Error ? reason.message : "消息没有发出去");
      void getChallengeConversation(competitorId).then((result) => {
        setChallengeContacts(result.contacts);
        setChallengeConversation(result.conversation);
      }).catch(() => undefined);
    } finally { setChallengeSending(false); }
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setError("");
    void getChildFootprints(selectedDate, controller.signal)
      .then((result) => {
        if (!cancelled) {
          setFootprints(result);
          setSelectedDate(result.selectedDate);
        }
      })
      .catch((reason) => {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
          return;
        }
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "足迹暂时无法读取");
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedDate]);

  useLiveRefresh(
    async (signal) => {
      try {
        const result = await getChildFootprints(selectedDate, signal);
        setFootprints(result);
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
        }
      }
    },
    { enabled: Boolean(footprints) },
  );

  useEffect(() => {
    if (footprints) {
      reportChildPageReady("footprints", "/api/child/footprints");
    }
  }, [footprints]);

  const displayedDays = footprints
    ? footprints.days.map((item) => ({
        day: new Intl.DateTimeFormat("en", {
          weekday: "short",
          timeZone: "UTC",
        }).format(new Date(`${item.date}T00:00:00.000Z`)),
        stars: item.stars === null ? "-" : String(item.stars),
        date: item.date,
        muted: item.isFuture,
      }))
    : [];
  const displayedEntries = footprints
    ? [
        ...footprints.tasks.map((task) => ({
          id: task.completionId,
          title: task.title,
          reward: task.totalStars,
          earnedAt: task.completedAt,
          icon:
            task.category === "MATH"
              ? mathIcon
              : task.category === "CHORES" || task.category === "ORGANIZING"
                ? booksIcon
                : readingIcon,
          accent:
            task.category === "MATH"
              ? "coral"
              : task.category === "CHORES" || task.category === "ORGANIZING"
                ? "green"
                : "blue",
        })),
        ...footprints.rewards.map((reward) => ({
          id: reward.rewardId,
          title: reward.title,
          reward: reward.totalStars,
          earnedAt: reward.earnedAt,
          icon: reward.planet
            ? PLANET_BY_KEY[reward.planet].image
            : triumphIcon,
          accent: reward.type === "PLANET_BONUS" ? "purple" : "gold",
        })),
      ].sort((left, right) =>
        new Date(right.earnedAt).getTime() - new Date(left.earnedAt).getTime(),
      )
    : [];
  const activeDate = selectedDate ?? footprints?.selectedDate;
  const activeDay = displayedDays.find((item) =>
    item.date === activeDate,
  );
  const activeWeekday = activeDay
    ? new Intl.DateTimeFormat("en", {
        weekday: "long",
        timeZone: "UTC",
      }).format(new Date(`${activeDay.date}T00:00:00.000Z`))
    : "Today";
  if (!footprints) {
    return (
      <main className="footprints-page">
        <ChildDataState
          error={Boolean(error)}
          message={error || "正在读取足迹…"}
        />
        <ChildBottomNav active="footprints" onNavigate={onNavigate} />
      </main>
    );
  }

  return (
    <main className="footprints-page">
      <section className="footprints-main">
        <div className="footprints-mobile-tabs" aria-label="足迹内容">
          <button type="button" className={mobilePanel === "records" ? "is-active" : ""} aria-pressed={mobilePanel === "records"} onClick={() => setMobilePanel("records")}>得星记录</button>
          <button type="button" className={mobilePanel === "leaderboard" ? "is-active" : ""} aria-pressed={mobilePanel === "leaderboard"} onClick={() => setMobilePanel("leaderboard")}>小朋友榜</button>
        </div>
        <div className={`footprints-layout footprints-layout--${mobilePanel}`}>
          <FootprintLeaderboard
            leaderboards={footprints.leaderboards}
            period={leaderboardPeriod}
            onPeriodChange={setLeaderboardPeriod}
            onPartnerSelect={(partner) => void openLeaderboardPartner(partner)}
          />
          <div className="footprints-interactive">
            <button type="button" className="footprints-chat-entry" onClick={() => void openChallengeInbox()}>
              <span className="footprints-chat-entry__art"><img src={challengeInboxEntry} alt="" />{challengeContacts.some((contact) => contact.unreadCount > 0) && <i aria-label="有未读来信" />}</span>
              <span><strong>伙伴来信</strong><small>{challengeContacts.length ? `${challengeContacts.length} 位联系过的伙伴 · 点击排行榜头像也能发消息` : "点击排行榜中的对手头像开始聊天"}</small></span>
            </button>
            <div className="footprints-days" aria-label="最近七天星星记录">
              {displayedDays.map((item) => {
                const selected = item.date === activeDate;
                return (
                  <button
                    type="button"
                    key={item.date}
                    onClick={() => {
                      if (!item.muted) setSelectedDate(item.date);
                    }}
                    aria-pressed={selected}
                    className={[
                      "footprints-day",
                      selected ? "footprints-day--selected" : "",
                      item.muted ? "footprints-day--muted" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {selected && <img className="footprints-day__pattern" src={selectedPattern} alt="" />}
                    <span>{item.day}</span>
                    <strong>{item.stars}{item.stars !== "-" && <img src={selected ? starIcon : footprintStar} alt="星星" />}</strong>
                  </button>
                );
              })}
            </div>
            <section className="footprints-detail" aria-labelledby="footprints-detail-title">
              <img className="footprints-detail__pattern" src={detailPattern} alt="" />
              <h2 id="footprints-detail-title"><img src={triumphIcon} alt="" />{activeWeekday}&apos;s Triumphs</h2>
              <div className="footprints-task-list">
                {displayedEntries.map((task) => (
                  <article className="footprints-task" key={task.id}>
                    <div className="footprints-task__title">
                      <span className={`footprints-task__icon footprints-task__icon--${task.accent}`}>
                        <img src={task.icon} alt="" />
                      </span>
                      <p>{task.title}</p>
                    </div>
                    <div className="footprints-task__reward">
                      <strong>+{task.reward}</strong><img src={footprintStar} alt="星星" />
                    </div>
                  </article>
                ))}
                {displayedEntries.length === 0 && (
                  <div className="footprints-task-empty">
                    这一天还没有获得星星
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
      <ChildBottomNav active="footprints" onNavigate={onNavigate} />
      {challengeOpen && <><button type="button" className="challenge-chat-backdrop" aria-label="关闭挑战伙伴对话" onClick={() => setChallengeOpen(false)} /><section className="challenge-chat" role="dialog" aria-modal="true" aria-labelledby="challenge-chat-title" style={{ backgroundImage: `url(${challengeChatPaper})` }}><aside className="challenge-chat__contacts" aria-label="联系过的伙伴">{challengeContacts.map((contact) => <button type="button" key={contact.competitorId} className={challengeConversation?.partner.competitorId === contact.competitorId ? "is-active" : ""} onClick={() => void openChallengeInbox(contact.competitorId)} aria-label={`切换到${contact.displayName}`}><img src={LEADERBOARD_AVATARS[contact.avatarKey] ?? fallbackChallengeAvatar} alt="" />{contact.unreadCount > 0 && <i aria-label={`${contact.unreadCount} 条未读消息`} />}<small>{contact.displayName}</small></button>)}</aside>{challengeConversation ? <div className="challenge-chat__panel"><header><img src={LEADERBOARD_AVATARS[challengeConversation.partner.avatarKey] ?? fallbackChallengeAvatar} alt="" /><div><h2 id="challenge-chat-title">{challengeConversation.partner.displayName}</h2><span>{challengeConversation.partner.label}</span></div><button type="button" aria-label="关闭" onClick={() => setChallengeOpen(false)}>×</button></header><div className="challenge-chat__messages" ref={challengeMessagesRef} aria-live="polite">{challengeConversation.messages.map((message) => <div className={`challenge-chat__bubble challenge-chat__bubble--${message.sender === "CHILD" ? "child" : "partner"}`} key={message.id}>{message.text}</div>)}{(challengeSending || challengeConversation.nextVisibleAt) && <div className="challenge-chat__typing"><i /><i /><i /><span>伙伴稍后会回复你…</span></div>}</div><form onSubmit={(event) => void submitChallengeReply(event)}><div className="challenge-chat__limit">今天还能发送 {challengeConversation.remainingToday}/{challengeConversation.dailyLimit} 条</div><div className="challenge-chat__composer"><input value={challengeInput} onChange={(event) => setChallengeInput(event.target.value)} maxLength={60} disabled={challengeConversation.remainingToday === 0 || challengeSending} placeholder={challengeConversation.remainingToday === 0 ? "今天先聊到这里吧" : "写一句话回复…"} aria-label="回复你的挑战伙伴" /><button disabled={!challengeInput.trim() || challengeConversation.remainingToday === 0 || challengeSending}>{challengeSending ? "已发送" : "发送"}</button></div>{challengeError && <p role="alert">{challengeError}</p>}</form></div> : <div className="challenge-chat__empty"><button type="button" aria-label="关闭" onClick={() => setChallengeOpen(false)}>×</button><img src={challengeInboxEntry} alt="" /><h2 id="challenge-chat-title">还没有伙伴来信</h2><p>有新消息时，会在这里看到。</p>{challengeError && <p role="alert">{challengeError}</p>}</div>}</section></>}
    </main>
  );
}
