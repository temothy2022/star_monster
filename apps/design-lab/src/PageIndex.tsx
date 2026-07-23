export type PageIndexRoute =
  | "login"
  | "step-1"
  | "step-2"
  | "step-3"
  | "step-4"
  | "tasks-partial"
  | "tasks-complete"
  | "tasks-empty"
  | "untimed-active"
  | "untimed-menu"
  | "untimed-abandon"
  | "untimed-complete"
  | "timed-active"
  | "timed-complete"
  | "timed-timeout"
  | "wishes-requested"
  | "footprints";

type PageGroup = {
  title: string;
  pages: Array<{ route: PageIndexRoute; name: string; note: string }>;
};

const groups: PageGroup[] = [
  {
    title: "A · 首次使用",
    pages: [
      { route: "login", name: "登录 · 探险代码", note: "8 位代码登录" },
      { route: "step-1", name: "Step 1 · 选择星宠", note: "伙伴选择卡片" },
      { route: "step-2", name: "Step 2 · 确认伙伴", note: "昵称与飞船" },
      { route: "step-3", name: "Step 3 · 任务介绍", note: "完成任务获得星星" },
      { route: "step-4", name: "Step 4 · 航程介绍", note: "星球航程" },
    ],
  },
  {
    title: "B · 任务列表",
    pages: [
      { route: "tasks-partial", name: "部分完成", note: "含未完成任务" },
      { route: "tasks-complete", name: "全部完成", note: "今日任务已完成" },
      { route: "tasks-empty", name: "没有任务", note: "空任务状态" },
    ],
  },
  {
    title: "不限时任务",
    pages: [
      { route: "untimed-active", name: "正在进行", note: "任务执行页" },
      { route: "untimed-menu", name: "更多菜单", note: "菜单弹层状态" },
      { route: "untimed-abandon", name: "放弃任务", note: "确认弹框状态" },
      { route: "untimed-complete", name: "任务完成", note: "完成庆祝页" },
    ],
  },
  {
    title: "限时任务",
    pages: [
      { route: "timed-active", name: "正在进行", note: "倒计时与加奖时间" },
      { route: "timed-complete", name: "任务完成", note: "速度奖励" },
      { route: "timed-timeout", name: "挑战超时", note: "竞速结果" },
    ],
  },
  {
    title: "星愿兑换",
    pages: [
      { route: "wishes-requested", name: "星愿兑换", note: "点击申请后在当前页打开底部确认弹层" },
    ],
  },
  {
    title: "足迹",
    pages: [
      { route: "footprints", name: "7 天足迹", note: "选择星期并查看单日详情" },
    ],
  },
];

const PARENT_APP_URL =
  import.meta.env.VITE_PARENT_APP_URL ?? "/parent/";
const SUPER_ADMIN_URL =
  import.meta.env.VITE_SUPER_ADMIN_URL ?? "/super/";

export function PageIndex({ onNavigate }: { onNavigate: (route: PageIndexRoute) => void }) {
  return (
    <main className="page-index">
      <header className="page-index__header">
        <p>STAR MONSTERS · DESIGN LAB</p>
        <h1>星宠成长基地</h1>
        <span>选择使用端，或继续查看孩子端的全部设计页面</span>
      </header>

      <section className="page-index__portals" aria-label="各端入口">
        <button type="button" onClick={() => onNavigate("login")}>
          <span className="page-index__portal-icon" aria-hidden="true">🚀</span>
          <span>
            <strong>孩子端</strong>
            <small>iPad 日常任务、星愿与足迹</small>
          </span>
          <b>进入 →</b>
        </button>
        <a href={PARENT_APP_URL}>
          <span className="page-index__portal-icon" aria-hidden="true">🏠</span>
          <span>
            <strong>家长端</strong>
            <small>任务、奖励、星星与孩子设置</small>
          </span>
          <b>进入 →</b>
        </a>
        <a href={SUPER_ADMIN_URL}>
          <span className="page-index__portal-icon" aria-hidden="true">🪐</span>
          <span>
            <strong>超级后台</strong>
            <small>家庭、账号、孩子与运营统计</small>
          </span>
          <b>进入 →</b>
        </a>
      </section>

      <div className="page-index__groups">
        {groups.map((group) => (
          <section className="page-index__group" key={group.title}>
            <h2>{group.title}</h2>
            <div className="page-index__grid">
              {group.pages.map((page, index) => (
                <button type="button" key={page.route} onClick={() => onNavigate(page.route)}>
                  <span className="page-index__number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="page-index__copy">
                    <strong>{page.name}</strong>
                    <small>{page.note}</small>
                  </span>
                  <span className="page-index__arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
