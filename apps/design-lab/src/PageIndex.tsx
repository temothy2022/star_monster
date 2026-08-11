export type PageIndexRoute =
  | "login"
  | "step-1"
  | "step-2"
  | "step-3"
  | "step-4"
  | "home"
  | "tasks"
  | "tasks-partial"
  | "tasks-dashboard"
  | "tasks-complete"
  | "tasks-empty"
  | "untimed-active"
  | "untimed-menu"
  | "untimed-abandon"
  | "untimed-complete"
  | "timed-active"
  | "timed-complete"
  | "timed-timeout"
  | "map"
  | "wishes-requested"
  | "footprints"
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
  | "hanzi-result"
  | "math-preview"
  | "math-print"
  | "poem-recitation";

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
      { route: "home", name: "首页 · 组件桌面", note: "当前正式首页，支持组件布局" },
      { route: "tasks", name: "任务 · 独立列表", note: "分类筛选与列表内滚动" },
      { route: "tasks-dashboard", name: "兼容入口 · 旧桌面路由", note: "保留用于回退与旧链接" },
      { route: "tasks-partial", name: "旧版任务列表", note: "保留用于快速回退" },
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
    title: "航图",
    pages: [
      { route: "map", name: "星际航图", note: "八颗星球、点亮门槛与加成奖励" },
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
  {
    title: "汉字学习",
    pages: [
      { route: "hanzi-home", name: "学习首页", note: "复习、新字、听句挑战入口" },
      { route: "hanzi-review-front", name: "复习卡片正面", note: "汉字识别与认识/不认识按钮" },
      { route: "hanzi-card-back", name: "复习卡片背面", note: "含释义图、词义与听一听" },
      { route: "hanzi-know-feedback", name: "认识反馈", note: "绿色鼓励提示" },
      { route: "hanzi-dont-know-feedback", name: "不认识反馈", note: "重新认识引导页" },
      { route: "hanzi-new-shape", name: "认识新字 · 看字形", note: "三步学习第 1 步" },
      { route: "hanzi-new-sound", name: "认识新字 · 听读音", note: "三步学习第 2 步" },
      { route: "hanzi-new-meaning", name: "认识新字 · 想意思", note: "三步学习第 3 步" },
      { route: "hanzi-listen-question", name: "听句挑战 · 未作答", note: "播放句子并选择正确汉字" },
      { route: "hanzi-listen-wrong", name: "听句挑战 · 回答错误", note: "正确答案提示与继续按钮" },
      { route: "hanzi-result", name: "学习结果", note: "复习、新学、听句挑战统计" },
    ],
  },
  {
    title: "数学练习",
    pages: [
      { route: "math-preview", name: "数学题型设计室", note: "按8个能力大类逐题查看、换题与 iPad 触控作答" },
      { route: "math-print", name: "A4 练习卷生成器", note: "公开访问，按题型和数量生成可打印 PDF" },
    ],
  },
  {
    title: "古诗学习",
    pages: [
      { route: "poem-recitation", name: "古诗背诵", note: "《春晓》诗句与朗读" },
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
            <small>iPad 日常任务、航图、星愿与足迹</small>
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
