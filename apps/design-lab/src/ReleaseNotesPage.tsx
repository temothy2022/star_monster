import { useEffect, useState } from "react";
import { ChildControlIcon } from "./components/ChildControlIcon";

type ReleaseNotesPageProps = {
  onBack: () => void;
};

type ReleaseEntry = {
  version: string;
  commit: string | null;
  shortCommit: string;
  publishedAt: string;
  committedAt: string;
  title: string;
  changes: string[];
};

const fallbackChanges = [
  "优化手机端汉字学习启动页，避免固定高度造成内容和开始按钮被遮挡。",
  "手机首页恢复组件式桌面，保留成长记录、倒计时和任务进度等入口；任务页继续保持纯任务列表。",
  "未完成任务时，从上午开始也可以收到星宠的挑战来信；首次读取通知时立即生成并显示，不再等下一轮刷新。",
  "建立发布记录入口，展示当前构建版本和本次发布的功能摘要。",
];

function fallbackHistory(): ReleaseEntry[] {
  const version = import.meta.env.VITE_APP_VERSION?.trim() || "本地开发版";
  const now = new Date().toISOString();
  return [{
    version,
    commit: null,
    shortCommit: version.slice(0, 7),
    publishedAt: now,
    committedAt: now,
    title: "当前本地版本",
    changes: fallbackChanges,
  }];
}

function formatReleaseDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ReleaseNotesPage({ onBack }: ReleaseNotesPageProps) {
  const [history, setHistory] = useState<ReleaseEntry[]>(fallbackHistory);

  useEffect(() => {
    const controller = new AbortController();
    const url = `${import.meta.env.BASE_URL}release-history.json?t=${Date.now()}`;
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok
        ? response.json() as Promise<ReleaseEntry[]>
        : Promise.reject(new Error("release history unavailable")))
      .then((entries) => {
        if (Array.isArray(entries) && entries.length > 0) setHistory(entries);
      })
      .catch(() => {
        // 本地开发或旧版本没有历史文件时，继续展示内置回退记录。
      });
    return () => controller.abort();
  }, []);

  const [current, ...previous] = history;

  return (
    <main className="release-notes-page">
      <div className="release-notes-page__shell">
        <header className="release-notes-page__header">
          <button className="release-notes-page__back" type="button" onClick={onBack} aria-label="返回页面清单">
            <ChildControlIcon kind="back" />
          </button>
          <div>
            <p>STAR MONSTERS · RELEASE</p>
            <h1>发布记录</h1>
            <span>每次正式发布都会自动加入历史列表。</span>
          </div>
        </header>

        <section className="release-notes-page__current" aria-labelledby="release-current-title">
          <div className="release-notes-page__current-top">
            <div>
              <small>最近发布</small>
              <h2 id="release-current-title">{current.title}</h2>
            </div>
            <strong>{current.version}</strong>
          </div>
          <div className="release-notes-page__meta">
            <span>发布于 {formatReleaseDate(current.publishedAt)}</span>
            <span>提交 {current.shortCommit}</span>
          </div>
          <ul>
            {current.changes.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section className="release-notes-page__history" aria-labelledby="release-history-title">
          <div className="release-notes-page__section-heading">
            <div>
              <small>RELEASE HISTORY</small>
              <h2 id="release-history-title">历史发布</h2>
            </div>
            <span>{history.length} 次记录</span>
          </div>
          <div className="release-notes-page__timeline">
            {previous.length > 0 ? previous.map((entry) => (
              <article className="release-notes-page__entry" key={`${entry.commit ?? entry.version}-${entry.publishedAt}`}>
                <div className="release-notes-page__entry-marker" aria-hidden="true" />
                <div className="release-notes-page__entry-body">
                  <div className="release-notes-page__entry-top">
                    <div>
                      <h3>{entry.title}</h3>
                      <span>{formatReleaseDate(entry.publishedAt)}</span>
                    </div>
                    <strong>{entry.version}</strong>
                  </div>
                  <ul>
                    {entry.changes.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </article>
            )) : (
              <div className="release-notes-page__empty">这是第一次记录发布，后续版本会继续显示在这里。</div>
            )}
          </div>
        </section>

        <section className="release-notes-page__howto" aria-label="发布流程">
          <span>自动记录方式</span>
          <p>正式发布脚本会读取当前 Git 提交，生成版本文件和历史发布清单。重新打开页面清单即可看到最新记录。</p>
        </section>
      </div>
    </main>
  );
}
