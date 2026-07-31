import { useCallback } from "react";
import backIcon from "../assets/icon-arrow-left.svg";
import speakerIcon from "../assets/hanzi/sound-speaker.svg";
import poemImage from "../assets/poem/spring-dawn.webp";

type Navigate = (route: "pages") => void;

const poemLines = [
  ["春", "眠", "不", "觉", "晓", "，"],
  ["处", "处", "闻", "啼", "鸟", "。"],
  ["夜", "来", "风", "雨", "声", "，"],
  ["花", "落", "知", "多", "少", "。"],
];

const poemText = poemLines.map((line) => line.join("")).join("");

function speakPoem() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(poemText);
  utterance.lang = "zh-CN";
  utterance.rate = 0.72;
  utterance.pitch = 1.05;
  window.speechSynthesis.speak(utterance);
}

export function PoemRecitationPage({ onNavigate }: { onNavigate: Navigate }) {
  const handleComplete = useCallback(() => {
    window.speechSynthesis?.cancel();
    onNavigate("pages");
  }, [onNavigate]);

  return (
    <main className="poem-page">
      <header className="poem-page__header">
        <button
          className="poem-page__back"
          type="button"
          aria-label="返回页面索引"
          onClick={() => onNavigate("pages")}
        >
          <img src={backIcon} alt="" aria-hidden="true" />
        </button>
        <h1>古诗学习</h1>
      </header>

      <section className="poem-page__main" aria-label="古诗背诵">
        <div className="poem-page__illustration-column">
          <div className="poem-page__poem-heading">
            <h2>《春晓》</h2>
            <span>唐代 · 孟浩然</span>
          </div>
          <div className="poem-page__image-frame">
            <img src={poemImage} alt="春晓插画" decoding="async" />
          </div>
        </div>

        <div className="poem-page__recitation-column">
          <button
            className="poem-page__listen"
            type="button"
            aria-label="播放春晓"
            onClick={speakPoem}
          >
            <img src={speakerIcon} alt="" aria-hidden="true" />
          </button>

          <div className="poem-page__lines" aria-label="春晓诗句">
            {poemLines.map((line, lineIndex) => (
              <div className="poem-page__line" key={`${line.join("")}-${lineIndex}`}>
                {line.map((character, characterIndex) =>
                  /[，。]/.test(character) ? (
                    <span className="poem-page__punctuation" key={`${character}-${characterIndex}`}>
                      {character}
                    </span>
                  ) : (
                    <span className="poem-page__character" key={`${character}-${characterIndex}`}>
                      {character}
                    </span>
                  ),
                )}
              </div>
            ))}
          </div>

          <button className="poem-page__complete" type="button" onClick={handleComplete}>
            完成
          </button>
        </div>
      </section>
    </main>
  );
}
