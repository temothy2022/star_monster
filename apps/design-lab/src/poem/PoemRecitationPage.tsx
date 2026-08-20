import { useCallback, useEffect, useRef } from "react";
import speakerIcon from "@star-monsters/assets/icons/hanzi/sound-speaker.svg";
import poemImage from "@star-monsters/assets/images/poem/spring-dawn.webp";
import {
  createSpeechPlayback,
  SinglePendingPlaybackQueue,
} from "../audio/queued-playback";
import { ChildControlIcon } from "../components/ChildControlIcon";

type Navigate = (route: "pages") => void;

const poemLines = [
  ["春", "眠", "不", "觉", "晓", "，"],
  ["处", "处", "闻", "啼", "鸟", "。"],
  ["夜", "来", "风", "雨", "声", "，"],
  ["花", "落", "知", "多", "少", "。"],
];

const poemText = poemLines.map((line) => line.join("")).join("");

export function PoemRecitationPage({ onNavigate }: { onNavigate: Navigate }) {
  const playbackQueueRef = useRef<SinglePendingPlaybackQueue | null>(null);
  if (!playbackQueueRef.current) {
    playbackQueueRef.current = new SinglePendingPlaybackQueue();
  }
  useEffect(() => () => playbackQueueRef.current?.clear(), []);

  const speakPoem = useCallback(() => {
    playbackQueueRef.current?.enqueue(() =>
      createSpeechPlayback(poemText, { rate: 0.72, pitch: 1.05 }),
    );
  }, []);
  const handleComplete = useCallback(() => {
    playbackQueueRef.current?.clear();
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
          <ChildControlIcon kind="back" />
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
