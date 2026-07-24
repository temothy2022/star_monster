import {
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  parentApi,
  type AiConfig,
  type AiSchedule,
  type Child,
  type RewardAudit,
  type SchedulePreference,
  type TaskAdvice,
  type TaskTemplate,
  type Wish,
} from "./api";

const DAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const CATEGORY_LABELS: Record<string, string> = {
  READING: "阅读",
  MATH: "数学",
  EXERCISE: "运动",
  CHORES: "家务",
  ORGANIZING: "整理",
  MUSIC: "音乐",
  CHINESE: "语文",
  ENGLISH: "英语",
  PE: "体育",
  OTHER: "其他",
};
const PRACTICE_LABELS: Record<string, string> = {
  GENERAL: "一般任务",
  NEW_CONTENT: "学习新内容",
  REVIEW: "复习巩固",
  MIXED: "新学与复习混合",
};
const PRINCIPLE_LABELS: Record<string, string> = {
  AUTONOMY_SUPPORT: "支持自主选择",
  CLEAR_ROUTINES: "稳定清晰的日常结构",
  AGE_APPROPRIATE_ATTENTION: "符合年龄的专注时长",
  POSITIVE_REINFORCEMENT: "积极强化",
  SPACING_AND_RETRIEVAL: "间隔与提取练习",
  EFFORT_OVER_PERFECTION: "重视努力而非完美",
  CHOICE_AND_PLAY: "选择与游戏",
};

function Card({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-panel ai-card">
      <header className="admin-panel__header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="ai-card__subtitle">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

function Message({
  kind = "info",
  children,
}: {
  kind?: "info" | "error" | "success";
  children: ReactNode;
}) {
  return <div className={`admin-notice admin-notice--${kind}`}>{children}</div>;
}

function BusyButton({
  busy,
  busyText,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy: boolean;
  busyText: string;
}) {
  return (
    <button {...props} disabled={busy || props.disabled}>
      {busy ? busyText : children}
    </button>
  );
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

type DaySlot = {
  enabled: boolean;
  start: string;
  end: string;
};

function slotsFromPreference(preference: SchedulePreference): DaySlot[] {
  return DAY_LABELS.map((_, weekday) => {
    const slot = preference.slots.find((item) => item.weekday === weekday);
    return {
      enabled: Boolean(slot),
      start: slot ? minutesToTime(slot.startMinute) : weekday === 0 || weekday === 6 ? "10:00" : "18:00",
      end: slot ? minutesToTime(slot.endMinute) : weekday === 0 || weekday === 6 ? "11:00" : "19:00",
    };
  });
}

function Principles({ items }: { items: string[] }) {
  return (
    <div className="ai-principles">
      {items.map((item) => (
        <span key={item}>{PRINCIPLE_LABELS[item] ?? item}</span>
      ))}
    </div>
  );
}

function AiConfiguration() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState<AiConfig["model"]>("deepseek-v4-flash");
  const [models, setModels] = useState<Array<{ id: string; ownedBy: string }>>([]);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState<"save" | "test" | "models" | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    void parentApi
      .aiConfig()
      .then(({ config: loaded }) => {
        setConfig(loaded);
        setModel(loaded.model);
        setEnabled(loaded.enabled || !loaded.configured);
        if (loaded.configured) {
          void loadModels(false);
        }
      })
      .catch((reason) =>
        setMessage({
          kind: "error",
          text: reason instanceof Error ? reason.message : "读取 AI 配置失败",
        }),
      );
  }, []);

  async function loadModels(showMessage = true) {
    setBusy("models");
    if (showMessage) setMessage(null);
    try {
      const result = await parentApi.aiModels();
      setModels(result.models);
      if (showMessage) {
        setMessage({ kind: "success", text: `已从 DeepSeek 获取 ${result.models.length} 个可用模型。` });
      }
    } catch (reason) {
      if (showMessage) {
        setMessage({
          kind: "error",
          text: reason instanceof Error ? reason.message : "模型列表读取失败",
        });
      }
    } finally {
      setBusy(null);
    }
  }

  const modelOptions = Array.from(new Set([
    model,
    ...models.map((item) => item.id),
    "deepseek-v4-flash",
    "deepseek-v4-pro",
  ])).filter(Boolean);

  function modelLabel(id: string) {
    if (id === "deepseek-v4-flash") return "deepseek-v4-flash（速度优先）";
    if (id === "deepseek-v4-pro") return "deepseek-v4-pro（能力优先）";
    if (id === "deepseek-chat" || id === "deepseek-reasoner") {
      return `${id}（旧兼容别名）`;
    }
    return id;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setMessage(null);
    try {
      const result = await parentApi.saveAiConfig({
        ...(apiKey ? { apiKey } : {}),
        model,
        enabled,
      });
      setConfig(result.config);
      setApiKey("");
      setMessage({ kind: "success", text: "密钥已加密保存。建议再进行一次连接测试。" });
      void loadModels(false);
    } catch (reason) {
      setMessage({
        kind: "error",
        text: reason instanceof Error ? reason.message : "保存失败",
      });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setMessage(null);
    try {
      const result = await parentApi.testAiConfig();
      setMessage({
        kind: "success",
        text: `${result.message}，当前模型：${result.model}`,
      });
    } catch (reason) {
      setMessage({
        kind: "error",
        text: reason instanceof Error ? reason.message : "连接测试失败",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="DeepSeek 密钥保险箱"
      subtitle="密钥使用 AES-256-GCM 加密后保存在服务端，页面和日志都不会回显完整密钥。"
    >
      <form className="admin-form" onSubmit={save}>
        <label className="field-span">
          {config?.configured
            ? `替换密钥（当前末四位 ${config.apiKeyLastFour}）`
            : "DeepSeek API Key"}
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            required={!config?.configured}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={config?.configured ? "留空则保留当前密钥" : "sk-..."}
          />
        </label>
        <label>
          模型
          <select value={model} onChange={(event) => setModel(event.target.value as AiConfig["model"])}>
            {modelOptions.map((id) => (
              <option key={id} value={id}>{modelLabel(id)}</option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          启用 AI 功能
        </label>
        {message && (
          <div className="field-span">
            <Message kind={message.kind}>{message.text}</Message>
          </div>
        )}
        <div className="form-actions field-span">
          <BusyButton type="button" className="ghost-button" busy={busy === "models"} busyText="读取中…" disabled={!config?.configured} onClick={() => void loadModels()}>
            刷新模型
          </BusyButton>
          <BusyButton type="button" className="ghost-button" busy={busy === "test"} busyText="连接中…" disabled={!config?.configured} onClick={() => void test()}>
            测试连接
          </BusyButton>
          <BusyButton className="primary-button" busy={busy === "save"} busyText="保存中…">
            保存配置
          </BusyButton>
        </div>
      </form>
      <p className="ai-privacy-note">
        调用时不会发送孩子登录码、设备、IP 或家庭名称。你在任务描述中输入的文字会发送给 DeepSeek 进行分析但不会保存在本站建议记录中，请不要填写真实姓名、学校、地址等身份信息。
      </p>
    </Card>
  );
}

function TaskAdvisor({ child }: { child: Child }) {
  const [description, setDescription] = useState("");
  const [outcome, setOutcome] = useState("");
  const [constraints, setConstraints] = useState("");
  const [result, setResult] = useState<{ id: string; advice: TaskAdvice } | null>(null);
  const [busy, setBusy] = useState<"generate" | "apply" | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    setResult(null);
    setApplied(false);
    setError("");
  }, [child.id]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy("generate");
    setError("");
    setApplied(false);
    try {
      const generated = await parentApi.taskAdvice(child.id, {
        description,
        ...(outcome ? { desiredOutcome: outcome } : {}),
        ...(constraints ? { constraints } : {}),
      });
      setResult({ id: generated.recommendationId, advice: generated.advice });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务建议生成失败");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!result) return;
    setBusy("apply");
    setError("");
    try {
      await parentApi.applyTaskAdvice(child.id, result.id);
      setApplied(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建任务失败");
    } finally {
      setBusy(null);
    }
  }

  const proposal = result?.advice.proposal;
  return (
    <Card
      title="自然语言任务顾问"
      subtitle="描述真实情境，AI 会判断是否适合做成任务，并给出频率、时长、星星和执行方式。"
    >
      <form className="ai-request-form" onSubmit={generate}>
        <label>
          你想解决什么情况？
          <textarea
            required
            minLength={10}
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="例如：孩子最近开始学习 RAZ，我希望建立稳定习惯，但不想让他因为奖励只追求读完。现在能独立跟读，每本大约 8 分钟。"
          />
        </label>
        <div className="admin-form">
          <label>
            希望看到的变化（可选）
            <input value={outcome} maxLength={1000} onChange={(event) => setOutcome(event.target.value)} placeholder="例如：愿意主动选一本并完成指读" />
          </label>
          <label>
            家庭限制（可选）
            <input value={constraints} maxLength={2000} onChange={(event) => setConstraints(event.target.value)} placeholder="例如：工作日只有晚饭后 30 分钟" />
          </label>
        </div>
        <div className="form-actions">
          <BusyButton className="primary-button" busy={busy === "generate"} busyText="正在分析…">
            生成任务草案
          </BusyButton>
        </div>
      </form>
      {error && <Message kind="error">{error}</Message>}
      {result && proposal && (
        <div className="ai-result">
          <div className="ai-result__headline">
            <div>
              <span>AI 草案 · 置信度 {result.advice.confidence}</span>
              <h3>{proposal.title}</h3>
              <p>{result.advice.summary}</p>
            </div>
            <div className="ai-star-chip">★ {proposal.baseStars}</div>
          </div>
          <div className="ai-proposal-grid">
            <div><span>孩子听到的目标</span><strong>{proposal.childFriendlyGoal}</strong></div>
            <div><span>分类与时长</span><strong>{CATEGORY_LABELS[proposal.category] ?? proposal.category} · {proposal.estimatedMinutes} 分钟</strong></div>
            <div><span>出现方式</span><strong>{proposal.scheduleKind === "DAILY" ? "每天" : proposal.scheduleKind === "WORKDAYS" ? "工作日" : proposal.scheduleKind === "ONE_TIME" ? `一次性 ${proposal.oneTimeDate ?? ""}` : proposal.weekdays.map((day) => DAY_LABELS[day]).join("、")}{proposal.repeatableDaily ? " · 当天可重复领取" : ""}</strong></div>
            <div><span>学习方式</span><strong>{PRACTICE_LABELS[proposal.learningPracticeKind]}</strong></div>
          </div>
          <div className="ai-result__columns">
            <div><h4>完成标准</h4><ul>{proposal.successCriteria.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h4>家长怎么支持</h4><ul>{proposal.parentInstructions.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h4>为什么这样设置</h4><ul>{result.advice.rationale.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>
          {result.advice.needsParentDecision.length > 0 && (
            <Message>应用前请确认：{result.advice.needsParentDecision.join("；")}</Message>
          )}
          {result.advice.cautions.length > 0 && (
            <div className="ai-cautions">{result.advice.cautions.map((item) => <p key={item}>提醒：{item}</p>)}</div>
          )}
          <Principles items={result.advice.evidencePrinciples} />
          {applied ? (
            <Message kind="success">已创建任务。你仍可以到“任务管理”继续编辑。</Message>
          ) : (
            <div className="form-actions">
              <BusyButton type="button" className="primary-button" busy={busy === "apply"} busyText="正在创建…" onClick={() => void apply()}>
                家长确认并创建任务
              </BusyButton>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function RewardAuditor({ child }: { child: Child }) {
  const [audit, setAudit] = useState<RewardAudit | null>(null);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAudit(null);
    void Promise.all([parentApi.templates(child.id), parentApi.wishes(child.id)]).then(([taskResult, wishResult]) => {
      setTemplates(taskResult.templates);
      setWishes(wishResult.wishes);
    });
  }, [child.id]);

  const names = useMemo(
    () =>
      new Map([
        ...templates.map((item) => [item.id, item.title] as const),
        ...wishes.map((item) => [item.id, item.title] as const),
      ]),
    [templates, wishes],
  );

  async function runAudit() {
    setBusy(true);
    setError("");
    try {
      setAudit((await parentApi.rewardAudit(child.id)).audit);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "评估失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="星星与兑换校准"
      subtitle="同时检查任务投入、完成频率、提前奖励和星愿价格，避免太容易、太遥远或奖励失衡。"
      actions={
        <BusyButton type="button" className="primary-button" busy={busy} busyText="正在评估…" onClick={() => void runAudit()}>
          一键评估
        </BusyButton>
      }
    >
      {error && <Message kind="error">{error}</Message>}
      {!audit && <div className="ai-empty">点击“一键评估”，AI 会读取当前任务、近 30 天完成情况和星愿价格，但不会自动修改任何数据。</div>}
      {audit && (
        <div className="ai-result">
          <div className="ai-audit-summary">
            <div className="ai-score"><strong>{audit.score}</strong><span>/ 100</span></div>
            <div><h3>{audit.verdict === "BALANCED" ? "整体平衡" : audit.verdict === "NEEDS_SMALL_CHANGES" ? "建议小幅调整" : "建议重新校准"}</h3><p>{audit.summary}</p></div>
            <div className="ai-weekly-stars"><span>预计每周</span><strong>★ {audit.estimatedWeeklyStars.likely}</strong><small>{audit.estimatedWeeklyStars.minimum}–{audit.estimatedWeeklyStars.maximum}</small></div>
          </div>
          <div className="ai-findings">
            {audit.findings.map((finding, index) => (
              <article key={`${finding.targetId}-${index}`} className={`ai-finding ai-finding--${finding.severity.toLowerCase()}`}>
                <span>{finding.severity === "ADJUST" ? "建议调整" : finding.severity === "WATCH" ? "继续观察" : "说明"}</span>
                <h4>{finding.title}{finding.targetId ? ` · ${names.get(finding.targetId) ?? "当前项目"}` : ""}</h4>
                <p>{finding.observation}</p>
                <strong>{finding.recommendation}</strong>
                {finding.suggestedStars !== null && <small>建议值：★ {finding.suggestedStars}</small>}
              </article>
            ))}
          </div>
          <Principles items={audit.evidencePrinciples} />
          <p className="ai-disclaimer">{audit.disclaimer}</p>
        </div>
      )}
    </Card>
  );
}

function SmartScheduler({ child }: { child: Child }) {
  const [preference, setPreference] = useState<Omit<SchedulePreference, "slots">>({
    maxDailyMinutes: 40,
    maxConsecutiveMinutes: 15,
    minimumBreakMinutes: 5,
  });
  const [daySlots, setDaySlots] = useState<DaySlot[]>(() =>
    DAY_LABELS.map((_, weekday) => ({
      enabled: weekday >= 1 && weekday <= 5,
      start: "18:00",
      end: "19:00",
    })),
  );
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [result, setResult] = useState<{ id: string; schedule: AiSchedule } | null>(null);
  const [busy, setBusy] = useState<"save" | "generate" | "apply" | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    setResult(null);
    setApplied(false);
    setMessage(null);
    void Promise.all([
      parentApi.schedulePreference(child.id),
      parentApi.templates(child.id),
    ]).then(([preferenceResult, templateResult]) => {
      const loaded = preferenceResult.preference;
      setPreference({
        maxDailyMinutes: loaded.maxDailyMinutes,
        maxConsecutiveMinutes: loaded.maxConsecutiveMinutes,
        minimumBreakMinutes: loaded.minimumBreakMinutes,
      });
      if (loaded.slots.length) setDaySlots(slotsFromPreference(loaded));
      setTemplates(templateResult.templates);
    });
  }, [child.id]);

  const templateNames = useMemo(
    () => new Map(templates.map((item) => [item.id, item.title])),
    [templates],
  );
  const eligible = templates.filter((item) => item.isEnabled && item.aiSchedulingEnabled);

  function payload(): SchedulePreference {
    return {
      ...preference,
      slots: daySlots.flatMap((slot, weekday) =>
        slot.enabled
          ? [
              {
                weekday,
                startMinute: timeToMinutes(slot.start),
                endMinute: timeToMinutes(slot.end),
              },
            ]
          : [],
      ),
    };
  }

  async function savePreferences(showSuccess = true) {
    await parentApi.saveSchedulePreference(child.id, payload());
    if (showSuccess) {
      setMessage({ kind: "success", text: "可用时间和专注上限已保存" });
    }
  }

  async function save() {
    setBusy("save");
    setMessage(null);
    try {
      await savePreferences();
    } catch (reason) {
      setMessage({ kind: "error", text: reason instanceof Error ? reason.message : "保存失败" });
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setBusy("generate");
    setMessage(null);
    setApplied(false);
    try {
      await savePreferences(false);
      const generated = await parentApi.generateSchedule(child.id);
      setResult({ id: generated.recommendationId, schedule: generated.schedule });
    } catch (reason) {
      setMessage({ kind: "error", text: reason instanceof Error ? reason.message : "排班失败" });
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!result) return;
    setBusy("apply");
    setMessage(null);
    try {
      await parentApi.applySchedule(child.id, result.id);
      setApplied(true);
      setMessage({ kind: "success", text: "本周节奏已应用到任务模板，后续每日任务会按新星期生成。" });
    } catch (reason) {
      setMessage({ kind: "error", text: reason instanceof Error ? reason.message : "应用失败" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="智能排班"
      subtitle="先设置孩子真正可用的时间，再让 AI 在不超时、不重叠、有休息的前提下安排学习与复习。"
    >
      <div className="ai-schedule-layout">
        <div>
          <h3 className="ai-subheading">每周可用时间</h3>
          <div className="availability-grid">
            {DAY_LABELS.map((label, weekday) => {
              const slot = daySlots[weekday]!;
              return (
                <div key={label} className={slot.enabled ? "availability-row active" : "availability-row"}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={slot.enabled}
                      onChange={(event) =>
                        setDaySlots((current) =>
                          current.map((item, index) =>
                            index === weekday ? { ...item, enabled: event.target.checked } : item,
                          ),
                        )
                      }
                    />
                    {label}
                  </label>
                  <input type="time" disabled={!slot.enabled} value={slot.start} onChange={(event) => setDaySlots((current) => current.map((item, index) => index === weekday ? { ...item, start: event.target.value } : item))} />
                  <span>至</span>
                  <input type="time" disabled={!slot.enabled} value={slot.end} onChange={(event) => setDaySlots((current) => current.map((item, index) => index === weekday ? { ...item, end: event.target.value } : item))} />
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <h3 className="ai-subheading">负荷边界</h3>
          <div className="admin-form">
            <label>每天任务上限（分钟）<input type="number" min={5} max={180} value={preference.maxDailyMinutes} onChange={(event) => setPreference({ ...preference, maxDailyMinutes: Number(event.target.value) })} /></label>
            <label>单次连续上限（分钟）<input type="number" min={5} max={60} value={preference.maxConsecutiveMinutes} onChange={(event) => setPreference({ ...preference, maxConsecutiveMinutes: Number(event.target.value) })} /></label>
            <label>任务间休息（分钟）<input type="number" min={0} max={60} value={preference.minimumBreakMinutes} onChange={(event) => setPreference({ ...preference, minimumBreakMinutes: Number(event.target.value) })} /></label>
          </div>
          <h3 className="ai-subheading">参与排班的任务（{eligible.length}）</h3>
          <div className="ai-task-chips">
            {eligible.map((item) => <span key={item.id}>{item.title} · {item.targetSessionsPerWeek ?? "待定"} 次/周</span>)}
            {!eligible.length && <p>请先到“任务管理”勾选“参与 AI 智能排班”。</p>}
          </div>
          <div className="form-actions ai-schedule-actions">
            <BusyButton type="button" className="ghost-button" busy={busy === "save"} busyText="保存中…" onClick={() => void save()}>
              仅保存时间
            </BusyButton>
            <BusyButton type="button" className="primary-button" busy={busy === "generate"} busyText="正在排班…" disabled={!eligible.length} onClick={() => void generate()}>
              生成一周排班
            </BusyButton>
          </div>
        </div>
      </div>
      {message && <Message kind={message.kind}>{message.text}</Message>}
      {result && (
        <div className="ai-result">
          <h3>{result.schedule.summary}</h3>
          <div className="week-plan">
            {DAY_LABELS.map((label, weekday) => {
              const sessions = result.schedule.weekPlan
                .filter((item) => item.weekday === weekday)
                .sort((a, b) => a.startMinute - b.startMinute);
              return (
                <section key={label}>
                  <h4>{label}</h4>
                  {sessions.map((session, index) => (
                    <article key={`${session.templateId}-${index}`}>
                      <time>{minutesToTime(session.startMinute)}</time>
                      <strong>{templateNames.get(session.templateId) ?? "任务"}</strong>
                      <span>{session.durationMinutes} 分钟 · {PRACTICE_LABELS[session.sessionType]}</span>
                      <small>{session.note}</small>
                    </article>
                  ))}
                  {!sessions.length && <p>留白 / 自由安排</p>}
                </section>
              );
            })}
          </div>
          {result.schedule.parentTips.length > 0 && (
            <div className="ai-result__columns"><div><h4>执行建议</h4><ul>{result.schedule.parentTips.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
          )}
          {result.schedule.warnings.length > 0 && <div className="ai-cautions">{result.schedule.warnings.map((item) => <p key={item}>提醒：{item}</p>)}</div>}
          <Principles items={result.schedule.evidencePrinciples} />
          {!applied && (
            <div className="form-actions">
              <BusyButton type="button" className="primary-button" busy={busy === "apply"} busyText="应用中…" onClick={() => void apply()}>
                家长确认并应用排班
              </BusyButton>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function AiAssistant({ child }: { child: Child }) {
  return (
    <div className="admin-stack ai-assistant">
      <div className="ai-hero">
        <div>
          <span>AI PARENTING COPILOT</span>
          <h2>让 AI 帮你做判断，把决定权留给家长</h2>
          <p>所有建议都经过结构化校验；模型不能直接扣星、改价或创建任务。</p>
        </div>
        <div className="ai-hero__mark">✦</div>
      </div>
      <AiConfiguration />
      <TaskAdvisor child={child} />
      <RewardAuditor child={child} />
      <SmartScheduler child={child} />
      <Message>
        本功能提供育儿与教育决策支持，不用于诊断发育、心理、语言或健康问题。若你对孩子的发展或情绪有持续担忧，请咨询儿科医生或合格专业人员。
      </Message>
    </div>
  );
}
