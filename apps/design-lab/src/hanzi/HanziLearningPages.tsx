import { useState } from "react";
import backIcon from "../assets/icon-arrow-left.svg";
import playIcon from "../assets/untimed-task/play.svg";
import testGeneratedHanziImage from "../assets/hanzi/test-generated-shui.jpeg";
import meaningNextIcon from "../assets/hanzi/meaning-next.svg";
import meaningSpeakerIcon from "../assets/hanzi/meaning-speaker.svg";
import shapeCounterIcon from "../assets/hanzi/shape-counter.svg";
import shapeNextIcon from "../assets/hanzi/shape-next.svg";
import soundCheckIcon from "../assets/hanzi/sound-check.svg";
import soundNextIcon from "../assets/hanzi/sound-next.svg";
import soundSpeakerIcon from "../assets/hanzi/sound-speaker.svg";
import soundStepEarIcon from "../assets/hanzi/sound-step-ear.svg";
import { HanziTaskControls } from "./HanziTaskControls";

type HanziRoute =
  | "hanzi-home"
  | "hanzi-review-front"
  | "hanzi-card-back"
  | "hanzi-know-feedback"
  | "hanzi-dont-know-feedback"
  | "hanzi-new-shape"
  | "hanzi-new-sound"
  | "hanzi-new-meaning"
  | "hanzi-listen-question"
  | "hanzi-listen-correct"
  | "hanzi-listen-wrong"
  | "hanzi-result";

type Navigate = (route: HanziRoute | "pages" | "tasks-partial") => void;

const stages = [
  { title: "先复习", duration: "约 3 分钟", body: "看看还记不记得", count: "12 个字", tone: "review" },
  { title: "认识新字", duration: "约 1 分钟", body: "看字形、听读音、想意思", count: "3 个字", tone: "new" },
  { title: "听句挑战", duration: "约 3 分钟", body: "听句子，选出正确的字", count: "3 道题", tone: "listen" },
];

const stepLabels = ["看字形", "听读音", "想意思"];

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="hanzi-back-button" type="button" onClick={onClick} aria-label="返回">
      <img src={backIcon} alt="" aria-hidden="true" />
    </button>
  );
}

function HanziProgressHeader({
  title,
  counter,
  progress,
  onBack,
}: {
  title: string;
  counter?: string;
  progress?: number;
  onBack: () => void;
}) {
  return (
    <header className="hanzi-flow-header">
      <div className="hanzi-flow-header__top">
        <BackButton onClick={onBack} />
        <h1>{title}</h1>
        <span>{counter}</span>
      </div>
      {typeof progress === "number" ? (
        <div className="hanzi-progress-track" aria-label="学习进度">
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
    </header>
  );
}

function StepIndicators({ active }: { active: number }) {
  return (
    <div className="hanzi-step-indicators" aria-label="认识新字步骤">
      {stepLabels.map((label, index) => (
        <div
          className={[
            "hanzi-step-pill",
            index === active ? "hanzi-step-pill--active" : "",
            index < active ? "hanzi-step-pill--done" : "",
          ].filter(Boolean).join(" ")}
          key={label}
        >
          <b>{index + 1}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function NewWordHeader({
  progress,
  onBack,
}: {
  progress: number;
  onBack: () => void;
}) {
  return (
    <header className="hanzi-new-word-header">
      <div className="hanzi-new-word-header__top">
        <BackButton onClick={onBack} />
        <h1>认识新字</h1>
        <div className="hanzi-new-word-counter">
          <img src={shapeCounterIcon} alt="" aria-hidden="true" />
          <span>第 1 / 3 个字</span>
        </div>
      </div>
      <div className="hanzi-new-word-progress" aria-label="认识新字进度">
        <span style={{ width: `${progress}%` }} />
      </div>
    </header>
  );
}

function ShapeStepIndicators() {
  return (
    <div className="hanzi-shape-steps" aria-label="认识新字步骤">
      {stepLabels.map((label, index) => (
        <div
          className={index === 0 ? "hanzi-shape-step hanzi-shape-step--active" : "hanzi-shape-step"}
          key={label}
        >
          <b>{index + 1}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function SoundStepIndicators() {
  return (
    <div className="hanzi-sound-steps" aria-label="认识新字步骤">
      <div className="hanzi-sound-step hanzi-sound-step--done">
        <b><img src={soundCheckIcon} alt="" aria-hidden="true" /></b>
        <span>看字形</span>
      </div>
      <i aria-hidden="true" />
      <div className="hanzi-sound-step hanzi-sound-step--active">
        <b><img src={soundStepEarIcon} alt="" aria-hidden="true" /></b>
        <span>听读音</span>
      </div>
      <i aria-hidden="true" />
      <div className="hanzi-sound-step">
        <b>3</b>
        <span>想意思</span>
      </div>
    </div>
  );
}

function NewWordNextButton({
  icon,
  onClick,
}: {
  icon: string;
  onClick: () => void;
}) {
  return (
    <footer className="hanzi-new-word-footer">
      <button type="button" onClick={onClick}>
        下一步
        <img src={icon} alt="" aria-hidden="true" />
      </button>
    </footer>
  );
}

function PlayIcon() {
  return <img className="hanzi-play-icon" src={playIcon} alt="" aria-hidden="true" />;
}

function HanziCharacter({ value = "山", compact = false }: { value?: string; compact?: boolean }) {
  return (
    <div className={["hanzi-character-box", compact ? "hanzi-character-box--compact" : ""].filter(Boolean).join(" ")}>
      <span>{value}</span>
    </div>
  );
}

function HanziCardBackFace() {
  return (
    <>
      <HanziCharacter />
      <span className="hanzi-flip-cue" aria-hidden="true">↻</span>
      <div className="hanzi-meaning-illustration">
        <img src={testGeneratedHanziImage} alt="汉字含义测试图" />
      </div>
      <div className="hanzi-card-back__bottom">
        <strong>高高的大山</strong>
        <span><PlayIcon />听一听</span>
      </div>
    </>
  );
}

export function HanziLearningHome({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <main className="hanzi-page hanzi-page--home">
      <header className="hanzi-home-header">
        <span className="hanzi-header-spacer" aria-hidden="true" />
        <h1>汉字学习</h1>
        <div className="hanzi-time-chip">
          <span aria-hidden="true">◷</span>
          约 7 分钟
        </div>
      </header>
      <HanziTaskControls onAbandon={() => onNavigate("tasks-partial")} />

      <section className="hanzi-stage-list" aria-label="学习流程">
        {stages.map((stage, index) => (
          <article className={`hanzi-stage-card hanzi-stage-card--${stage.tone}`} key={stage.title}>
            <div className="hanzi-stage-card__icon" aria-hidden="true">
              {index + 1}
            </div>
            <div className="hanzi-stage-card__copy">
              <div>
                <h2>{stage.title}</h2>
                <strong>{stage.duration}</strong>
              </div>
              <p>{stage.body}</p>
              <small>{stage.count}</small>
            </div>
          </article>
        ))}
      </section>

      <footer className="hanzi-bottom-action">
        <button type="button" onClick={() => onNavigate("hanzi-review-front")}>
          开始学习
          <span aria-hidden="true">→</span>
        </button>
      </footer>
    </main>
  );
}

export function HanziReviewFront({
  onNavigate,
  initialFlipped = false,
}: {
  onNavigate: Navigate;
  initialFlipped?: boolean;
}) {
  const [flipped, setFlipped] = useState(initialFlipped);
  const [showKnownToast, setShowKnownToast] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(3);

  function handleKnown() {
    setShowKnownToast(true);
    window.setTimeout(() => {
      setShowKnownToast(false);
      setFlipped(false);
      setReviewIndex((current) => (current >= 12 ? 1 : current + 1));
    }, 700);
  }

  return (
    <main className="hanzi-page hanzi-page--review">
      <HanziProgressHeader title="复习" counter={`第 ${reviewIndex} / 12 个字`} progress={(reviewIndex / 12) * 100} onBack={() => onNavigate("hanzi-home")} />
      <HanziTaskControls onAbandon={() => onNavigate("tasks-partial")} />
      <section className="hanzi-review-canvas">
        <button
          className={["hanzi-review-card", flipped ? "hanzi-review-card--flipped" : ""].filter(Boolean).join(" ")}
          type="button"
          onClick={() => setFlipped((current) => !current)}
          aria-label={flipped ? "翻回卡片正面" : "翻到卡片背面"}
        >
          <div
            className="hanzi-review-card__face hanzi-review-card__face--front"
            aria-hidden={flipped}
          >
            <HanziCharacter />
            <span className="hanzi-hint-chip">点一下看看</span>
            <p>认识这个字吗？</p>
          </div>
          <div
            className="hanzi-review-card__face hanzi-review-card__face--back"
            aria-hidden={!flipped}
          >
            <HanziCardBackFace />
          </div>
        </button>
        <div className="hanzi-review-actions">
          <button type="button" onClick={() => onNavigate("hanzi-dont-know-feedback")}>还不认识</button>
          <button type="button" onClick={handleKnown}>认识</button>
        </div>
      </section>
      {showKnownToast ? <KnownFeedbackToast /> : null}
    </main>
  );
}

export function HanziCardBack({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <HanziReviewFront onNavigate={onNavigate} initialFlipped />
  );
}

export function HanziKnowFeedback({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <main className="hanzi-page hanzi-page--feedback-only">
      <button className="hanzi-feedback-toast hanzi-feedback-toast--success" type="button" onClick={() => onNavigate("hanzi-review-front")}>
        <span aria-hidden="true">✓</span>
        真棒！记得真清楚！
      </button>
    </main>
  );
}

export function HanziDontKnowFeedback({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <main className="hanzi-page hanzi-page--coach">
      <HanziProgressHeader title="" progress={40} onBack={() => onNavigate("hanzi-review-front")} />
      <HanziTaskControls onAbandon={() => onNavigate("tasks-partial")} />
      <section className="hanzi-coach-card">
        <span className="hanzi-coach-card__spark" aria-hidden="true">✦</span>
        <h1>没关系，我们再认识一次！</h1>
        <HanziCharacter value="猫" compact />
        <button className="hanzi-coach-audio" type="button">
          <PlayIcon />
          听一听
        </button>
      </section>
      <footer className="hanzi-bottom-action">
        <button type="button" onClick={() => onNavigate("hanzi-new-shape")}>认识了</button>
      </footer>
    </main>
  );
}

function KnownFeedbackToast() {
  return (
    <div className="hanzi-known-toast-layer" aria-live="polite">
      <div className="hanzi-feedback-toast hanzi-feedback-toast--success">
        <span aria-hidden="true">✓</span>
        真棒！记得真清楚！
      </div>
    </div>
  );
}

export function HanziNewShape({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <main className="hanzi-page hanzi-page--new hanzi-page--new-shape">
      <NewWordHeader progress={33.33} onBack={() => onNavigate("hanzi-review-front")} />
      <HanziTaskControls onAbandon={() => onNavigate("tasks-partial")} />
      <ShapeStepIndicators />
      <section className="hanzi-shape-card">
        <div className="hanzi-shape-card__content">
          <HanziCharacter />
          <div className="hanzi-shape-mnemonic">
            <div className="hanzi-shape-mnemonic__image">
              <img src={testGeneratedHanziImage} alt="汉字含义测试图" />
            </div>
            <p>像三座山峰连在一起</p>
          </div>
        </div>
      </section>
      <NewWordNextButton icon={shapeNextIcon} onClick={() => onNavigate("hanzi-new-sound")} />
    </main>
  );
}

export function HanziNewSound({ onNavigate }: { onNavigate: Navigate }) {
  const [playbackKey, setPlaybackKey] = useState(0);

  return (
    <main className="hanzi-page hanzi-page--sound">
      <NewWordHeader progress={62.95} onBack={() => onNavigate("hanzi-new-shape")} />
      <HanziTaskControls onAbandon={() => onNavigate("tasks-partial")} />
      <SoundStepIndicators />
      <section className="hanzi-sound-card">
        <HanziCharacter />
        <button
          className="hanzi-audio-orb"
          type="button"
          aria-label="播放读音"
          onClick={() => setPlaybackKey((value) => value + 1)}
        >
          {playbackKey > 0 ? <span className="hanzi-audio-orb__pulse" key={playbackKey} aria-hidden="true" /> : null}
          <img src={soundSpeakerIcon} alt="" aria-hidden="true" />
        </button>
      </section>
      <NewWordNextButton icon={soundNextIcon} onClick={() => onNavigate("hanzi-new-meaning")} />
    </main>
  );
}

export function HanziNewMeaning({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <main className="hanzi-page hanzi-page--meaning">
      <NewWordHeader progress={100} onBack={() => onNavigate("hanzi-new-sound")} />
      <HanziTaskControls onAbandon={() => onNavigate("tasks-partial")} />
      <section className="hanzi-meaning-canvas">
        <div className="hanzi-meaning-core">
          <div className="hanzi-meaning-figure">
            <img src={testGeneratedHanziImage} alt="汉字含义测试图" />
          </div>
          <div className="hanzi-meaning-panel">
            <div className="hanzi-meaning-panel__character">
              <strong>山</strong>
              <span>高高的大山</span>
            </div>
            <div className="hanzi-meaning-vocabulary">
              {["山顶", "山水", "高山"].map((word) => (
                <button type="button" key={word}>
                  <span>{word}</span>
                  <img src={meaningSpeakerIcon} alt="" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
      <NewWordNextButton icon={meaningNextIcon} onClick={() => onNavigate("hanzi-listen-question")} />
    </main>
  );
}

function ListenSentenceCard({ filled }: { filled?: string }) {
  return (
    <section className="hanzi-listen-sentence" aria-label="句子">
      <p>我们一起爬上了高</p>
      <span className={filled ? "hanzi-listen-blank hanzi-listen-blank--filled" : "hanzi-listen-blank"}>
        {filled ?? "?"}
      </span>
    </section>
  );
}

function ListenOptions({
  selected,
  correct,
  onSelect,
}: {
  selected?: string;
  correct?: string;
  onSelect?: (value: string) => void;
}) {
  const options = ["山", "水", "月"];
  return (
    <div className="hanzi-listen-options" aria-label="汉字选项">
      {options.map((option) => (
        <button
          className={[
            selected === option ? "hanzi-listen-option--selected" : "",
            correct === option ? "hanzi-listen-option--correct" : "",
          ].filter(Boolean).join(" ")}
          key={option}
          type="button"
          onClick={() => onSelect?.(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function HanziListenQuestion({
  onNavigate,
  initialCorrect = false,
}: {
  onNavigate: Navigate;
  initialCorrect?: boolean;
}) {
  const [isCorrect, setIsCorrect] = useState(initialCorrect);

  const handleSelect = (value: string) => {
    if (value === "山") {
      setIsCorrect(true);
      return;
    }
    onNavigate("hanzi-listen-wrong");
  };

  return (
    <main className={`hanzi-page hanzi-page--listen-challenge${isCorrect ? " hanzi-page--listen-correct" : ""}`}>
      <BackButton onClick={() => onNavigate("hanzi-new-meaning")} />
      <HanziTaskControls onAbandon={() => onNavigate("tasks-partial")} />
      {isCorrect ? (
        <div className="hanzi-feedback-toast hanzi-feedback-toast--listen" role="status">
          <span aria-hidden="true">✓</span>
          真棒！回答正确！
        </div>
      ) : null}
      <section className={`hanzi-listen-shell${isCorrect ? " hanzi-listen-shell--answered" : ""}`}>
        {!isCorrect ? <header className="hanzi-listen-title">
          <button className="hanzi-listen-play" type="button" aria-label="播放句子">
            <PlayIcon />
          </button>
          <div>
            <h1>听句挑战</h1>
            <p>选出正确的字，放进句子里</p>
          </div>
        </header> : null}
        <ListenSentenceCard filled={isCorrect ? "山" : undefined} />
        <ListenOptions
          selected={isCorrect ? "山" : undefined}
          correct={isCorrect ? "山" : undefined}
          onSelect={isCorrect ? undefined : handleSelect}
        />
      </section>
      {isCorrect ? (
        <button className="hanzi-listen-next" type="button" onClick={() => onNavigate("hanzi-result")}>
          继续 <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </main>
  );
}

export function HanziListenCorrect({ onNavigate }: { onNavigate: Navigate }) {
  return <HanziListenQuestion onNavigate={onNavigate} initialCorrect />;
}

export function HanziListenWrong({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <main className="hanzi-page hanzi-page--listen-wrong">
      <BackButton onClick={() => onNavigate("hanzi-listen-question")} />
      <HanziTaskControls onAbandon={() => onNavigate("tasks-partial")} />
      <section className="hanzi-listen-wrong__content">
        <ListenSentenceCard filled="水" />
        <ListenOptions selected="水" correct="山" />
        <div className="hanzi-listen-feedback">
          <span aria-hidden="true">i</span>
          正确答案是「山」，我们记住它啦！
        </div>
      </section>
      <button className="hanzi-listen-next" type="button" onClick={() => onNavigate("hanzi-result")}>
        继续 <span aria-hidden="true">→</span>
      </button>
    </main>
  );
}

export function HanziLearningResult({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <main className="hanzi-page hanzi-page--result">
      <HanziTaskControls onAbandon={() => onNavigate("tasks-partial")} />
      <header className="hanzi-result-header">
        <div className="hanzi-result-medal" aria-hidden="true">✓</div>
        <div>
          <h1>今天的汉字学习完成啦！</h1>
          <p>今天认识了好多汉字朋友！</p>
        </div>
      </header>
      <section className="hanzi-result-grid" aria-label="学习结果">
        <article>
          <h2>今天复习</h2>
          <p><span>认识</span><strong>10 个</strong></p>
          <p><span>再见几次</span><strong>2 个</strong></p>
        </article>
        <article>
          <h2>今天新学</h2>
          <p>认识了 3 个新朋友</p>
          <div className="hanzi-result-characters" aria-hidden="true">
            <b>山</b><b>水</b><b>月</b>
          </div>
        </article>
        <article>
          <h2>听句挑战</h2>
          <div
            className="hanzi-score-ring"
            style={{ background: "conic-gradient(#4da8e8 240deg, #e7f2ff 0deg)" }}
          >
            <div className="hanzi-score-ring__value"><strong>2</strong><span>/ 3</span></div>
          </div>
        </article>
      </section>
      <footer className="hanzi-result-footer">
        <p>这些汉字会在合适的时候再回来见你，见得越多，记得越牢。</p>
        <button type="button" onClick={() => onNavigate("tasks-partial")}>完成任务</button>
      </footer>
    </main>
  );
}
