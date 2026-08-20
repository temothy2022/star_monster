import { ChildControlIcon } from "./components/ChildControlIcon";

type ReleaseNotesPageProps = {
  onBack: () => void;
};

const releaseItems = [
  "优化手机端汉字学习启动页，避免固定高度造成内容和开始按钮被遮挡。",
  "手机首页恢复组件式桌面，保留成长记录、倒计时和任务进度等入口；任务页继续保持纯任务列表。",
  "未完成任务时，从上午开始也可以收到星宠的挑战来信；首次读取通知时立即生成并显示，不再等下一轮刷新。",
  "建立发布记录入口，展示当前构建版本和本次发布的功能摘要。",
];

export function ReleaseNotesPage({ onBack }: ReleaseNotesPageProps) {
  const version = import.meta.env.VITE_APP_VERSION?.trim() || "本地开发版";

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
            <span>每次正式发布后，在这里查看版本和功能变化。</span>
          </div>
        </header>

        <section className="release-notes-page__current" aria-labelledby="release-current-title">
          <div className="release-notes-page__current-top">
            <div>
              <small>当前构建</small>
              <h2 id="release-current-title">孩子端体验优化</h2>
            </div>
            <strong>{version}</strong>
          </div>
          <div className="release-notes-page__meta">
            <span>发布于 2026-08-20</span>
            <span>版本号随正式发布自动更新</span>
          </div>
          <ul>
            {releaseItems.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section className="release-notes-page__howto" aria-label="发布流程">
          <span>发布流程</span>
          <p>提交代码后执行正式发布命令，系统会把 Git 提交号写入四个前端的版本文件，并在下一次打开时自动检查更新。</p>
        </section>
      </div>
    </main>
  );
}
