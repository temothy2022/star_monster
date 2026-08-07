import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import balanceStar from "../assets/wishes/balance-star.svg";
import costStar from "../assets/wishes/cost-star.svg";
import redeemedCheck from "../assets/wishes/redeemed-check.svg";
import requestSparkle from "../assets/wishes/request-sparkle.svg";
import starIcon from "../assets/wishes/star.svg";
import confirmStar from "../assets/wishes/confirm-star.svg";
import footprintStar from "../assets/footprints/star.svg";
import selectedPattern from "../assets/footprints/selected-pattern.svg";
import detailPattern from "../assets/footprints/detail-pattern.svg";
import triumphIcon from "../assets/footprints/triumph.svg";
import readingIcon from "../assets/footprints/task-reading.svg";
import mathIcon from "../assets/footprints/task-math.svg";
import booksIcon from "../assets/footprints/task-books.svg";
import chinaFlag from "../assets/footprints/flags/china.webp?no-inline";
import japanFlag from "../assets/footprints/flags/japan.webp?no-inline";
import koreaFlag from "../assets/footprints/flags/korea.webp?no-inline";
import singaporeFlag from "../assets/footprints/flags/singapore.webp?no-inline";
import unitedKingdomFlag from "../assets/footprints/flags/united-kingdom.webp?no-inline";
import franceFlag from "../assets/footprints/flags/france.webp?no-inline";
import germanyFlag from "../assets/footprints/flags/germany.webp?no-inline";
import italyFlag from "../assets/footprints/flags/italy.webp?no-inline";
import canadaFlag from "../assets/footprints/flags/canada.webp?no-inline";
import australiaFlag from "../assets/footprints/flags/australia.webp?no-inline";
import brazilFlag from "../assets/footprints/flags/brazil.webp?no-inline";
import unitedStatesFlag from "../assets/footprints/flags/united-states.webp?no-inline";
import { MASCOTS, useMascot } from "../mascots";
import { ChildBottomNav, type ChildRoute } from "../components/ChildBottomNav";
import { ChildDataState } from "../components/ChildDataState";
import sportsReward from "../assets/reward-categories/sports.webp";
import gamesReward from "../assets/reward-categories/games.webp";
import televisionReward from "../assets/reward-categories/television.webp";
import toysReward from "../assets/reward-categories/toys.webp";
import {
  ApiError,
  getChildFootprints,
  getChildWishes,
  redeemChildWish,
  type ChildWish,
  type ChildLeaderboard,
  type ChildLeaderboardEntry,
  type FootprintResponse,
} from "../api/child-api";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { reportChildPageReady } from "../api/performance-telemetry";

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

type FootprintSpeech = {
  messages: string[];
  celebrating: boolean;
};

const FLAG_IMAGES: Record<ChildLeaderboardEntry["flagKey"], string> = {
  CHINA: chinaFlag,
  JAPAN: japanFlag,
  KOREA: koreaFlag,
  SINGAPORE: singaporeFlag,
  UNITED_KINGDOM: unitedKingdomFlag,
  FRANCE: franceFlag,
  GERMANY: germanyFlag,
  ITALY: italyFlag,
  CANADA: canadaFlag,
  AUSTRALIA: australiaFlag,
  BRAZIL: brazilFlag,
  UNITED_STATES: unitedStatesFlag,
};

const EMPTY_CHILD_LEADERBOARD: ChildLeaderboard = {
  entries: [],
  self: null,
};

function getFootprintSpeech({
  stars,
  taskCount,
  isToday,
  leaderboard,
  period,
}: {
  stars: number;
  taskCount: number;
  isToday: boolean;
  leaderboard: ChildLeaderboard;
  period: LeaderboardPeriod;
}): FootprintSpeech {
  const messages: string[] = [];
  const self = leaderboard.self;

  if (taskCount === 0 && isToday) {
    messages.push(
      "今天的第一颗星，还在等你出发！",
      "先完成一个小任务，排名就会动起来啦。",
      "不用一次做很多，先迈出第一步吧！",
      "星星雷达已经打开，等你点亮今天！",
      "挑一个最容易开始的任务，我们马上行动。",
      "今天的足迹还是空白，一颗星就能让它发光！",
    );
  }

  if (taskCount === 0) {
    messages.push(
      "这一天暂时没有足迹，新的探险继续加油！",
      "休息也是补充能量，准备好再出发吧。",
      "这页还没有星星，下一次一定更闪亮！",
    );
  }

  if (taskCount > 0) {
    messages.push(
      `已经完成 ${taskCount} 个任务，收获 ${stars} 颗星！`,
      `今天留下了 ${taskCount} 个认真行动的足迹。`,
      `每完成一次，星星能量就增加一点！`,
      `看得见的进步，就是这 ${stars} 颗星。`,
    );
  }

  if (stars >= 10 || taskCount >= 4) {
    messages.push(
      `能量大爆发，${stars} 颗星全部装进口袋！`,
      "一个接一个完成，今天的行动力满满！",
      "坚持到这里很了不起，给自己鼓掌吧！",
      "足迹越来越亮，你的努力都被看见啦。",
    );
  }

  if (self?.rank === 1) {
    messages.push(
      period === "daily" ? "你现在是今日领航员，继续稳稳向前！" : "你正在领跑本周榜，坚持特别有力量！",
      "第一名不是终点，把今天的计划认真完成吧。",
      "你站在榜首啦，稳定完成比冲得快更重要。",
      "领航员也要一步一步走，保持自己的节奏！",
    );
  } else if (self && self.rank <= 3) {
    messages.push(
      `冲进前三啦，你现在是第 ${self.rank} 名！`,
      "离榜首很近了，认真完成下一个任务吧。",
      "前三名的星光真亮，保持这个好节奏！",
      `第 ${self.rank} 名正在发光，每一步都算数。`,
    );
  } else if (self && self.starsToNextRank <= 3) {
    messages.push(
      `再得 ${self.starsToNextRank} 颗星，就有机会前进一名！`,
      "前面的伙伴已经不远了，先完成眼前这一项。",
      "排名马上会动起来，认真完成比着急更重要。",
      "只差一点点啦，选一个合适的任务继续吧！",
    );
  } else if (self) {
    messages.push(
      `你现在排第 ${self.rank} 名，每颗星都能推动排名。`,
      `距离前一名还差 ${self.starsToNextRank} 颗星，慢慢追上去！`,
      "不用和别人比速度，只要比刚才的自己多走一步。",
      "把今天该做的事情完成，排名自然会向前。",
    );
  }

  return {
    messages: Array.from(new Set(messages)),
    celebrating: stars >= 8 || taskCount >= 3 || (self?.rank ?? 99) <= 3,
  };
}

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

const FLOATING_MASCOT_POSITION_KEY = "star-monsters:footprints-mascot-position";

function clampMascotPosition(position: { x: number; y: number }) {
  const size = window.innerWidth <= 600 ? 76 : 112;
  const bottomSpace = window.innerWidth <= 600 ? 104 : 116;
  const pageWidth = Math.min(window.innerWidth, 1280);
  const pageLeft = Math.max(0, (window.innerWidth - pageWidth) / 2);
  return {
    x: Math.min(
      Math.max(pageLeft + 10, position.x),
      Math.max(pageLeft + 10, pageLeft + pageWidth - size - 10),
    ),
    y: Math.min(
      Math.max(70, position.y),
      Math.max(70, window.innerHeight - size - bottomSpace),
    ),
  };
}

function initialMascotPosition() {
  try {
    const stored = window.localStorage.getItem(FLOATING_MASCOT_POSITION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { x?: unknown; y?: unknown };
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return clampMascotPosition({ x: parsed.x, y: parsed.y });
      }
    }
  } catch {
    // A saved drag position is optional; invalid local data falls back safely.
  }
  const pageWidth = Math.min(window.innerWidth, 1280);
  const pageLeft = Math.max(0, (window.innerWidth - pageWidth) / 2);
  return clampMascotPosition({
    x: pageLeft + pageWidth - 144,
    y: window.innerHeight - 264,
  });
}

function FloatingFootprintMascot({
  mascot,
  speech,
}: {
  mascot: {
    name: string;
    images: { neutral: string; celebrate: string };
  };
  speech: FootprintSpeech;
}) {
  const [position, setPosition] = useState(initialMascotPosition);
  const positionRef = useRef(position);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [speechVisible, setSpeechVisible] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const messageSignature = speech.messages.join("|");
  const message = speech.messages[messageIndex % Math.max(1, speech.messages.length)] ?? "一起出发吧！";

  useEffect(() => {
    const onResize = () => {
      const next = clampMascotPosition(positionRef.current);
      positionRef.current = next;
      setPosition(next);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let showTimer = 0;
    let hideTimer = 0;
    let cycle = 0;
    let cancelled = false;

    const revealAfter = (delay: number) => {
      showTimer = window.setTimeout(() => {
        if (cancelled) return;
        setMessageIndex(cycle % Math.max(1, speech.messages.length));
        cycle += 1;
        setSpeechVisible(true);
        hideTimer = window.setTimeout(() => {
          setSpeechVisible(false);
          revealAfter(13_000 + (cycle % 4) * 2_400);
        }, 5_400);
      }, delay);
    };

    revealAfter(800);
    return () => {
      cancelled = true;
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [messageSignature, speech.messages.length]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - positionRef.current.x,
      offsetY: event.clientY - positionRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setSpeechVisible(false);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const next = clampMascotPosition({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    });
    positionRef.current = next;
    setPosition(next);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      window.localStorage.setItem(
        FLOATING_MASCOT_POSITION_KEY,
        JSON.stringify(positionRef.current),
      );
    } catch {
      // Dragging must still work when Safari blocks local storage.
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className={[
        "footprints-floating-mascot",
        position.x > window.innerWidth / 2 ? "footprints-floating-mascot--right" : "",
        dragging ? "footprints-floating-mascot--dragging" : "",
      ].filter(Boolean).join(" ")}
      style={{
        "--footprint-mascot-x": `${position.x}px`,
        "--footprint-mascot-y": `${position.y}px`,
      } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      aria-label={`星宠${mascot.name}，可以拖动位置`}
    >
      <div
        className={`footprints-floating-speech${speechVisible && !dragging ? " footprints-floating-speech--visible" : ""}`}
        aria-live="polite"
        aria-hidden={!speechVisible || dragging}
      >
        <p aria-label={message}>
          {Array.from(message).map((character, index) => (
            <span
              aria-hidden="true"
              key={`${message}-${index}`}
              style={{ "--speech-character-index": index } as CSSProperties}
            >
              {character}
            </span>
          ))}
        </p>
      </div>
      <img
        src={speech.celebrating ? mascot.images.celebrate : mascot.images.neutral}
        alt=""
        decoding="async"
        draggable={false}
      />
    </div>
  );
}

function FootprintLeaderboard({
  leaderboards,
  period,
  onPeriodChange,
}: {
  leaderboards: FootprintResponse["leaderboards"];
  period: LeaderboardPeriod;
  onPeriodChange: (period: LeaderboardPeriod) => void;
}) {
  const leaderboard = leaderboards[period];
  return (
    <aside className="footprints-leaderboard" aria-labelledby="footprints-leaderboard-title">
      <header className="footprints-leaderboard__header">
        <h1 id="footprints-leaderboard-title">全球小朋友榜</h1>
      </header>

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
            key={`${period}-${entry.displayName}-${entry.flagKey}`}
          >
            <span className={`footprints-leaderboard__rank footprints-leaderboard__rank--${Math.min(entry.rank, 4)}`}>
              {entry.rank}
            </span>
            <span className="footprints-leaderboard__avatar" aria-hidden="true">
              <img className="footprints-leaderboard__pet" src={MASCOTS[entry.petType].images.neutral} alt="" />
              <img className="footprints-leaderboard__flag" src={FLAG_IMAGES[entry.flagKey]} alt="" loading="lazy" />
            </span>
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
  const { mascot } = useMascot();
  const [footprints, setFootprints] = useState<FootprintResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<LeaderboardPeriod>("daily");
  const [error, setError] = useState("");

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
  const displayedTasks = footprints
    ? footprints.tasks.map((task) => ({
        id: task.completionId,
        title: task.title,
        reward: task.totalStars,
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
      }))
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
  const activeStars =
    footprints?.days.find((day) => day.date === activeDate)?.stars ?? 0;
  const today = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date());
  const activeLeaderboard =
    footprints?.leaderboards[leaderboardPeriod] ?? EMPTY_CHILD_LEADERBOARD;
  const speech = useMemo(
    () => getFootprintSpeech({
      stars: activeStars,
      taskCount: displayedTasks.length,
      isToday: activeDate === today,
      leaderboard: activeLeaderboard,
      period: leaderboardPeriod,
    }),
    [
      activeDate,
      activeStars,
      activeLeaderboard,
      displayedTasks.length,
      leaderboardPeriod,
      today,
    ],
  );

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
        <div className="footprints-layout">
          <FootprintLeaderboard
            leaderboards={footprints.leaderboards}
            period={leaderboardPeriod}
            onPeriodChange={setLeaderboardPeriod}
          />
          <div className="footprints-interactive">
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
                {displayedTasks.map((task) => (
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
                {displayedTasks.length === 0 && (
                  <div className="footprints-task-empty">
                    这一天还没有完成任务
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
      <FloatingFootprintMascot mascot={mascot} speech={speech} />
      <ChildBottomNav active="footprints" onNavigate={onNavigate} />
    </main>
  );
}
