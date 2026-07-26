import { useEffect, useState } from "react";
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
import { useMascot } from "../mascots";
import { ChildBottomNav, type ChildRoute } from "../components/ChildBottomNav";
import { ChildDataState } from "../components/ChildDataState";
import sportsReward from "../assets/reward-categories/sports.png";
import gamesReward from "../assets/reward-categories/games.png";
import televisionReward from "../assets/reward-categories/television.png";
import toysReward from "../assets/reward-categories/toys.png";
import {
  ApiError,
  getChildFootprints,
  getChildWishes,
  redeemChildWish,
  type ChildWish,
  type FootprintResponse,
} from "../api/child-api";
import { useLiveRefresh } from "../hooks/useLiveRefresh";

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

type FootprintSpeech = {
  lines: [string, string];
  celebrating: boolean;
};

function selectSpeech(
  options: Array<[string, string]>,
  date: string,
  stars: number,
  taskCount: number,
) {
  const dateSeed = Array.from(date).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return options[(dateSeed + stars + taskCount) % options.length];
}

function getFootprintSpeech({
  date,
  stars,
  taskCount,
  isToday,
}: {
  date: string;
  stars: number;
  taskCount: number;
  isToday: boolean;
}): FootprintSpeech {
  if (taskCount === 0 && isToday) {
    return {
      lines: selectSpeech(
        [
          ["今天还没有足迹～", "完成任务就能点亮！"],
          ["今天的探险等你哦！", "迈出第一步吧～"],
          ["星星还在等你呢！", "选个任务出发吧～"],
        ],
        date,
        stars,
        taskCount,
      ),
      celebrating: false,
    };
  }

  if (taskCount === 0) {
    return {
      lines: selectSpeech(
        [
          ["这天暂时没有星星～", "新的探险继续加油！"],
          ["休息也是一种能量～", "准备好再出发吧！"],
          ["这页还没有足迹～", "下一次一定更闪亮！"],
        ],
        date,
        stars,
        taskCount,
      ),
      celebrating: false,
    };
  }

  if (stars >= 10) {
    return {
      lines: selectSpeech(
        [
          [`收获 ${stars} 颗星！`, "闪闪发光，太棒啦！"],
          [`足足有 ${stars} 颗星！`, "超级探险家就是你！"],
          ["这天能量大爆发！", `${stars} 颗星全部装进口袋！`],
        ],
        date,
        stars,
        taskCount,
      ),
      celebrating: true,
    };
  }

  if (taskCount >= 4) {
    return {
      lines: selectSpeech(
        [
          [`完成 ${taskCount} 个任务！`, "行动力满满的一天！"],
          ["一个接一个完成啦！", "坚持到底真了不起！"],
          [`留下 ${taskCount} 个足迹！`, "今天走了好远呢！"],
        ],
        date,
        stars,
        taskCount,
      ),
      celebrating: true,
    };
  }

  if (taskCount >= 2 || stars >= 5) {
    return {
      lines: selectSpeech(
        [
          [`完成 ${taskCount} 个任务！`, "认真坚持最了不起！"],
          [`收获 ${stars} 颗星！`, "每一步都很有力量！"],
          ["今天进步了好多！", "为你的坚持鼓掌～"],
          ["足迹越来越闪亮！", "这个节奏真不错～"],
        ],
        date,
        stars,
        taskCount,
      ),
      celebrating: true,
    };
  }

  return {
    lines: selectSpeech(
      [
        ["完成了一个任务！", "小小一步也很棒！"],
        [`得到 ${stars} 颗星！`, "认真完成值得表扬！"],
        ["留下今天的足迹啦！", "每次行动都有收获！"],
        ["看见你的努力啦！", "继续保持这个节奏～"],
      ],
      date,
      stars,
      taskCount,
    ),
    celebrating: false,
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
        <img src={wish.image} alt="" />
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
    void getChildWishes()
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
    };
  }, []);

  useLiveRefresh(
    async () => {
      try {
        setWishData(await getChildWishes());
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
                  ? "申请星愿"
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
      setError(reason instanceof Error ? reason.message : "申请没有完成，请再试一次");
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
            aria-label="取消申请星愿"
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
                使用 {selectedWish.display.cost} 颗星申请{selectedWish.display.title}？
              </h2>
              <p>太阳系航程不会后退。</p>
              {error && <p className="wish-confirm-error" role="alert">{error}</p>}
              <div className="wish-confirm-sheet__actions">
                <button type="button" disabled={submitting} onClick={() => setSelectedWish(null)}>取消</button>
                <button type="button" disabled={submitting} onClick={() => void confirmWish()}>
                  {submitting ? "申请中…" : "确认申请"}
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
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
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    void getChildFootprints(selectedDate)
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
    };
  }, [selectedDate]);

  useLiveRefresh(
    async () => {
      try {
        const result = await getChildFootprints(selectedDate);
        setFootprints(result);
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
        }
      }
    },
    { enabled: Boolean(footprints) },
  );

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
  const speech = getFootprintSpeech({
    date: activeDate ?? today,
    stars: activeStars,
    taskCount: displayedTasks.length,
    isToday: activeDate === today,
  });

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
          <aside className="footprints-mascot">
            <img
              src={
                speech.celebrating
                  ? mascot.images.celebrate
                  : mascot.images.neutral
              }
              alt={`星宠${mascot.name}`}
            />
            <div
              className="footprints-speech"
              key={speech.lines.join("|")}
              aria-label={speech.lines.join("，")}
              aria-live="polite"
            >
              <span />
              <p aria-hidden="true">
                {speech.lines[0]}
                <br />
                {speech.lines[1]}
              </p>
            </div>
          </aside>
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
              </div>
            </section>
          </div>
        </div>
      </section>
      <ChildBottomNav active="footprints" onNavigate={onNavigate} />
    </main>
  );
}
