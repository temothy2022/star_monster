import { useState } from "react";
import testGeneratedHanziImage from "@star-monsters/assets/images/hanzi/test-generated-shui.jpeg";
import defaultPoemImage from "@star-monsters/assets/images/poem/spring-dawn.webp";
import reviewCheckIcon from "@star-monsters/assets/icons/icon-check.svg";
import reviewHintIcon from "@star-monsters/assets/icons/untimed-task/help.svg";
import reviewRetryIcon from "@star-monsters/assets/icons/untimed-task/cancel.svg";
import reviewStarIcon from "@star-monsters/assets/icons/wishes/star.svg";
import soundSpeakerIcon from "@star-monsters/assets/icons/hanzi/sound-speaker.svg";
import { ChildControlIcon } from "../components/ChildControlIcon";
import { HanziTaskControls } from "../hanzi/HanziTaskControls";

type StaticNavigate = (
  route: "pages" | "hanzi-learning-v2" | "hanzi-review-v2" | "poem-learning-v2" | "poem-review-v2",
) => void;

const poemLines = [
  ["春", "眠", "不", "觉", "晓", "，"],
  ["处", "处", "闻", "啼", "鸟", "。"],
  ["夜", "来", "风", "雨", "声", "，"],
  ["花", "落", "知", "多", "少", "。"],
];

function StaticBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="hanzi-back-button" type="button" onClick={onClick} aria-label="返回页面清单">
      <ChildControlIcon kind="back" />
    </button>
  );
}

function AdaptiveFooter({ current, total }: { current: number; total: number }) {
  return (
    <footer className="adaptive-review-footer">
      <div className="adaptive-review-footer__progress">
        <span><img src={reviewStarIcon} alt="" aria-hidden="true" />{current} / {total}</span>
        <div><i style={{ width: `${(current / total) * 100}%` }} /></div>
      </div>
    </footer>
  );
}

function AdaptiveButton({
  tone,
  icon,
  children,
  onClick,
}: {
  tone: "success" | "danger" | "effort" | "hinted";
  icon?: string;
  children: string;
  onClick?: () => void;
}) {
  return (
    <button className={`adaptive-review-button adaptive-review-button--${tone}`} type="button" onClick={onClick}>
      {icon ? <img src={icon} alt="" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function HanziLearningStaticPage({ onNavigate }: { onNavigate: StaticNavigate }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const stepClass = step === 0 ? "hanzi-page--new-shape" : step === 1 ? "hanzi-page--sound" : "hanzi-page--meaning";

  return (
    <main className={`hanzi-page hanzi-page--runtime-new hanzi-page--new ${stepClass}`}>
      <header className="hanzi-new-word-header">
        <div className="hanzi-new-word-header__top">
          <StaticBackButton onClick={() => onNavigate("pages")} />
          <h1>认识新字</h1>
          <div className="hanzi-new-word-counter"><span>第 1 / 3 个字</span></div>
        </div>
        <div className="hanzi-new-word-progress"><span style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>
      </header>
      <HanziTaskControls onAbandon={() => onNavigate("pages")} experienceName="汉字学习" />

      {step === 0 ? (
        <>
          <div className="hanzi-shape-steps" aria-label="认识新字步骤">
            <div className="hanzi-shape-step hanzi-shape-step--active"><b>1</b><span>看字形</span></div>
            <div className="hanzi-shape-step"><b>2</b><span>听读音</span></div>
            <div className="hanzi-shape-step"><b>3</b><span>想意思</span></div>
          </div>
          <section className="hanzi-shape-card">
            <div className="hanzi-shape-card__content">
              <div className="hanzi-character-box"><span>桥</span></div>
              <div className="hanzi-shape-mnemonic">
                <div className="hanzi-shape-mnemonic__image"><img src={testGeneratedHanziImage} alt="桥的含义联想图" /></div>
                <p>想一想，这个字像什么？</p>
              </div>
            </div>
          </section>
        </>
      ) : step === 1 ? (
        <section className="hanzi-sound-card">
          <div className="hanzi-character-box"><span>桥</span></div>
          <button className="hanzi-audio-orb" type="button" aria-label="播放桥的读音">
            <img src={soundSpeakerIcon} alt="" aria-hidden="true" />
          </button>
        </section>
      ) : (
        <section className="hanzi-meaning-canvas">
          <div className="hanzi-meaning-core">
            <div className="hanzi-meaning-figure"><img src={testGeneratedHanziImage} alt="桥的含义联想图" /></div>
            <div className="hanzi-meaning-panel">
              <div className="hanzi-meaning-panel__character"><strong>桥</strong></div>
              <p>连接两边、方便人和车通过的建筑。</p>
            </div>
          </div>
        </section>
      )}

      <footer className="hanzi-new-word-footer">
        <button type="button" onClick={() => step === 2 ? onNavigate("hanzi-review-v2") : setStep((value) => (value + 1) as 1 | 2)}>
          {step === 2 ? "进入下一步" : "下一步"}
          <ChildControlIcon kind="next" />
        </button>
      </footer>
    </main>
  );
}

export function HanziReviewStaticPage({ onNavigate }: { onNavigate: StaticNavigate }) {
  const [mode, setMode] = useState<"initial" | "rating" | "hint">("initial");

  return (
    <main className={`hanzi-page hanzi-page--review-adaptive${mode === "hint" ? " is-hint-visible" : ""}`}>
      <header className="adaptive-review-header">
        <StaticBackButton onClick={() => onNavigate("pages")} />
        <h1>星宠成长基地</h1>
        <span className="adaptive-review-header__balance"><img src={reviewStarIcon} alt="" aria-hidden="true" />90</span>
      </header>
      <HanziTaskControls onAbandon={() => onNavigate("pages")} experienceName="汉字复习" />
      <section className="adaptive-hanzi-review" aria-label="复习汉字桥">
        <div className="adaptive-hanzi-review__character-pane">
          <div className="hanzi-character-box"><span>桥</span></div>
          {mode === "initial" ? (
            <div className="adaptive-review-actions adaptive-review-actions--primary">
              <AdaptiveButton tone="success" icon={reviewCheckIcon} onClick={() => setMode("rating")}>我想到了</AdaptiveButton>
              <AdaptiveButton tone="danger" icon={reviewHintIcon} onClick={() => setMode("hint")}>给我提示</AdaptiveButton>
            </div>
          ) : mode === "rating" ? (
            <div className="adaptive-review-actions adaptive-review-actions--primary">
              <AdaptiveButton tone="effort" onClick={() => onNavigate("pages")}>想了一会儿</AdaptiveButton>
              <AdaptiveButton tone="success" icon={reviewCheckIcon} onClick={() => onNavigate("pages")}>一下就想起</AdaptiveButton>
            </div>
          ) : null}
        </div>
        <div className="adaptive-hanzi-review__hint-pane" aria-hidden={mode !== "hint"}>
          {mode === "hint" ? (
            <>
              <h2>提示</h2>
              <img className="adaptive-hanzi-review__hint-image" src={testGeneratedHanziImage} alt="桥的含义联想图" />
              <div className="adaptive-hanzi-review__audio-actions">
                <button className="adaptive-review-play" type="button" aria-label="播放汉字和词语"><img src={soundSpeakerIcon} alt="" aria-hidden="true" /></button>
                <button className="adaptive-review-play" type="button" aria-label="播放例句"><img src={soundSpeakerIcon} alt="" aria-hidden="true" /></button>
              </div>
              <div className="adaptive-review-actions adaptive-review-actions--hint-result">
                <AdaptiveButton tone="success" icon={reviewCheckIcon} onClick={() => onNavigate("pages")}>提示后想起</AdaptiveButton>
                <AdaptiveButton tone="danger" icon={reviewRetryIcon} onClick={() => onNavigate("pages")}>还要再学</AdaptiveButton>
              </div>
            </>
          ) : <span className="adaptive-hanzi-review__empty" />}
        </div>
      </section>
      <AdaptiveFooter current={3} total={12} />
    </main>
  );
}

function PoemLines({ concealed = false }: { concealed?: boolean }) {
  return (
    <div className="adaptive-poem-review__grid" aria-label="古诗内容">
      {poemLines.map((line, lineIndex) => (
        <div className="adaptive-poem-review__line" key={line.join("")}>
          {line.map((character, characterIndex) => /[，。]/.test(character) ? (
            <span className="adaptive-poem-review__punctuation" key={`${character}-${characterIndex}`}>{character}</span>
          ) : (
            <span className={`adaptive-poem-review__character${concealed && lineIndex > 0 ? "" : " is-visible"}`} key={`${character}-${characterIndex}`}>
              {concealed && lineIndex > 0 ? "" : character}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function PoemStaticShell({
  title,
  children,
  onNavigate,
}: {
  title: string;
  children: React.ReactNode;
  onNavigate: StaticNavigate;
}) {
  return (
    <main className="poem-page poem-page--adaptive-review">
      <header className="adaptive-review-header">
        <button className="poem-page__back" type="button" onClick={() => onNavigate("pages")} aria-label="返回页面清单">
          <ChildControlIcon kind="back" />
        </button>
        <h1>{title}</h1>
        <span className="adaptive-review-header__balance"><img src={reviewStarIcon} alt="" aria-hidden="true" />90</span>
      </header>
      <HanziTaskControls onAbandon={() => onNavigate("pages")} experienceName={title} />
      {children}
    </main>
  );
}

export function PoemLearningStaticPage({ onNavigate }: { onNavigate: StaticNavigate }) {
  const [step, setStep] = useState<0 | 1>(0);
  return (
    <PoemStaticShell title="古诗学习" onNavigate={onNavigate}>
      <section className="adaptive-poem-review" aria-label="学习古诗春晓">
        <div className="adaptive-poem-review__image-pane"><img src={defaultPoemImage} alt="春晓配图" /></div>
        <div className="adaptive-poem-review__content-pane">
          <div className="adaptive-poem-review__heading"><h2>春晓</h2><span>唐 · 孟浩然</span></div>
          <PoemLines concealed={step === 0} />
          <div className="adaptive-review-actions adaptive-poem-review__initial-actions">
            <AdaptiveButton tone="success" icon={soundSpeakerIcon}>听一听</AdaptiveButton>
            <AdaptiveButton tone="effort" onClick={() => setStep(1)}>{step === 0 ? "开始背诵" : "已看懂"}</AdaptiveButton>
          </div>
        </div>
      </section>
      <AdaptiveFooter current={1} total={1} />
    </PoemStaticShell>
  );
}

export function PoemReviewStaticPage({ onNavigate }: { onNavigate: StaticNavigate }) {
  const [mode, setMode] = useState<"initial" | "rating">("initial");
  return (
    <PoemStaticShell title="古诗复习" onNavigate={onNavigate}>
      <section className="adaptive-poem-review" aria-label="复习古诗春晓">
        <div className="adaptive-poem-review__image-pane"><img src={defaultPoemImage} alt="春晓配图" /></div>
        <div className="adaptive-poem-review__content-pane">
          <div className="adaptive-poem-review__heading"><h2>春晓</h2><span>唐 · 孟浩然</span></div>
          <PoemLines concealed={mode === "initial"} />
          {mode === "initial" ? (
            <div className="adaptive-review-actions adaptive-poem-review__initial-actions">
              <AdaptiveButton tone="success" icon={reviewCheckIcon} onClick={() => setMode("rating")}>我能背</AdaptiveButton>
              <AdaptiveButton tone="danger" icon={reviewHintIcon} onClick={() => setMode("rating")}>提示一句</AdaptiveButton>
            </div>
          ) : (
            <div className="adaptive-poem-review__rating-actions">
              <AdaptiveButton tone="success" icon={reviewCheckIcon} onClick={() => onNavigate("pages")}>很顺利</AdaptiveButton>
              <AdaptiveButton tone="effort" onClick={() => onNavigate("pages")}>想了一会儿</AdaptiveButton>
              <AdaptiveButton tone="hinted" icon={reviewHintIcon} onClick={() => onNavigate("pages")}>提示后完成</AdaptiveButton>
              <AdaptiveButton tone="danger" icon={reviewRetryIcon} onClick={() => onNavigate("pages")}>还要复习</AdaptiveButton>
            </div>
          )}
        </div>
      </section>
      <AdaptiveFooter current={1} total={3} />
    </PoemStaticShell>
  );
}
