import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  MATH_QUESTION_CATEGORIES,
  getMathQuestionFamiliesByCategory,
  getMathQuestionTypesByCategory,
} from "@star-monsters/math-practice";
import {
  parentApi,
  type Child,
  type ClockLearningSettings,
  type MakeTenLearningStats,
  type MakeTenLearningSettings,
  type MathPracticeSettings,
  type HanziCharacterResource,
  type HanziLearningSettings,
  type PoemLearningSettings,
  type PoemResource,
} from "./api";
import {
  DEFAULT_MATH_PRACTICE_SETTINGS,
  MATH_PRACTICE_PRESETS,
  allocateEvenly,
  clampMathTotal,
  countAllocatedQuestions,
  normalizeLegacyMathTypeCounts,
  rebalanceTypeCounts,
} from "./math-practice-settings";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="admin-panel"><header className="admin-panel__header"><h2>{title}</h2></header>{children}</section>;
}

function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`admin-notice${error ? " admin-notice--error" : ""}`}>{children}</div>;
}

function AudioButton({
  label,
  url,
  fallbackText,
}: {
  label: string;
  url: string | null;
  fallbackText: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
  }, [url]);

  function toggle() {
    setError("");
    if (playing) {
      audioRef.current?.pause();
      audioRef.current = null;
      window.speechSynthesis?.cancel();
      setPlaying(false);
      return;
    }
    if (!url) {
      if (!window.speechSynthesis) {
        setError("当前浏览器不支持朗读");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(fallbackText);
      utterance.lang = "zh-CN";
      utterance.rate = 0.82;
      utterance.onend = () => setPlaying(false);
      utterance.onerror = () => { setPlaying(false); setError("暂时无法播放朗读"); };
      setPlaying(true);
      window.speechSynthesis.speak(utterance);
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => { audioRef.current = null; setPlaying(false); };
    audio.onerror = () => { audioRef.current = null; setPlaying(false); setError("音频加载失败"); };
    setPlaying(true);
    void audio.play().catch(() => { audioRef.current = null; setPlaying(false); setError("暂时无法播放音频"); });
  }

  return <span className="admin-audio-control"><button type="button" className="hanzi-audio-button" onClick={toggle}>{playing ? "停止" : label}</button>{error ? <small>{error}</small> : null}</span>;
}

const DEFAULT_HANZI_SETTINGS: HanziLearningSettings = {
  newCharactersPerDay: 3,
  reviewDailyLimit: 25,
  consolidationQuestionCount: 3,
  reviewTaskStars: 1,
};

export function ParentHanziLearning({ child }: { child: Child }) {
  const [settings, setSettings] = useState(DEFAULT_HANZI_SETTINGS);
  const [characters, setCharacters] = useState<HanziCharacterResource[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [schoolTargetCount, setSchoolTargetCount] = useState(0);
  const [schoolTargetText, setSchoolTargetText] = useState("");
  const [schoolTargetTextMessage, setSchoolTargetTextMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pageSize = 30;

  useEffect(() => {
    setLoading(true);
    setError("");
    void parentApi.hanziSettings(child.id)
      .then((result) => {
        setSettings(result.settings);
        setSchoolTargetCount(result.schoolTargetCount);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "汉字学习配置加载失败"))
      .finally(() => setLoading(false));
  }, [child.id]);

  useEffect(() => {
    setBusy(true);
    void parentApi.hanziCharacters(child.id, { q: searchQuery, page, pageSize })
      .then((result) => {
        setCharacters(result.characters);
        setTotal(result.total);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "基础字库加载失败"))
      .finally(() => setBusy(false));
  }, [child.id, page, searchQuery]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [child.id, page, searchQuery]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await parentApi.updateHanziSettings(child.id, settings);
      setSettings(result.settings);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  function search(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearchQuery(searchInput.trim());
  }

  async function toggleSchoolTarget(item: HanziCharacterResource) {
    setBusy(true);
    setError("");
    try {
      if (item.schoolTarget) {
        await parentApi.removeHanziSchoolTarget(child.id, item.id);
        setCharacters((current) => current.map((character) =>
          character.id === item.id ? { ...character, schoolTarget: null } : character,
        ));
        setSchoolTargetCount((count) => Math.max(0, count - 1));
      } else {
        const result = await parentApi.addHanziSchoolTarget(child.id, item.id);
        setCharacters((current) => current.map((character) =>
          character.id === item.id ? { ...character, schoolTarget: result.target } : character,
        ));
        setSchoolTargetCount((count) => count + 1);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "学校学习清单更新失败");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function togglePageSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = characters.length > 0 && characters.every((item) => next.has(item.id));
      characters.forEach((item) => { if (allSelected) next.delete(item.id); else next.add(item.id); });
      return next;
    });
  }

  async function batchUpdateSchoolTargets(action: "add" | "remove") {
    const ids = characters.filter((item) => selectedIds.has(item.id) && (action === "add" ? !item.schoolTarget : Boolean(item.schoolTarget))).map((item) => item.id);
    if (!ids.length) return;
    setBusy(true);
    setError("");
    try {
      const delta = action === "add"
        ? (await parentApi.addHanziSchoolTargets(child.id, ids)).addedCount
        : -(await parentApi.removeHanziSchoolTargets(child.id, ids)).removedCount;
      setCharacters((current) => current.map((item) => ids.includes(item.id) ? { ...item, schoolTarget: action === "add" ? { id: item.id, sortOrder: 0 } : null } : item));
      setSchoolTargetCount((count) => Math.max(0, count + delta));
      setSelectedIds(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "学校学习清单更新失败");
    } finally {
      setBusy(false);
    }
  }

  async function addSchoolTargetsFromText(event: FormEvent) {
    event.preventDefault();
    if (!schoolTargetText.trim()) return;
    setBusy(true);
    setError("");
    setSchoolTargetTextMessage("");
    try {
      const result = await parentApi.addHanziSchoolTargetsFromText(child.id, schoolTargetText);
      const refreshed = await parentApi.hanziCharacters(child.id, { q: searchQuery, page, pageSize });
      setCharacters(refreshed.characters);
      setTotal(refreshed.total);
      setSchoolTargetCount((count) => count + result.addedCount);
      setSchoolTargetText("");
      const details = [
        result.addedCount ? `已加入 ${result.addedCount} 个汉字` : "没有新增汉字",
        result.alreadyAddedCharacters.length ? `已在清单：${result.alreadyAddedCharacters.join("、")}` : "",
        result.missingCharacters.length ? `字库未找到：${result.missingCharacters.join("、")}` : "",
      ].filter(Boolean);
      setSchoolTargetTextMessage(details.join("；"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "学校学习清单更新失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-stack">
    <div className="admin-two-column">
      <Panel title="每日学习参数">
        {loading ? <div className="empty-state">正在读取设置…</div> : <form className="admin-form" onSubmit={save}>
          <label>每日新字数量<input type="number" min={1} max={10} value={settings.newCharactersPerDay} onChange={(event) => setSettings({ ...settings, newCharactersPerDay: Number(event.target.value) })} /></label>
          <label>每日复习上限<input type="number" min={1} max={50} value={settings.reviewDailyLimit} onChange={(event) => setSettings({ ...settings, reviewDailyLimit: Number(event.target.value) })} /></label>
          <label>听句挑战题数<input type="number" min={1} max={10} value={settings.consolidationQuestionCount} onChange={(event) => setSettings({ ...settings, consolidationQuestionCount: Number(event.target.value) })} /></label>
          <label>汉字复习任务星星<input type="number" min={1} max={999} value={settings.reviewTaskStars} onChange={(event) => setSettings({ ...settings, reviewTaskStars: Number(event.target.value) })} /></label>
          <div className="field-span admin-help">新字学习任务仍按任务配置中的星期出现；汉字复习任务根据到期汉字每天自动出现，不受学习日限制。</div>
          <div className="field-span admin-help">学习参数只影响当前孩子，不会修改共享汉字库。</div>
          <div className="form-actions field-span"><button className="primary-button" disabled={busy}>{busy ? "保存中…" : "保存设置"}</button></div>
        </form>}
      </Panel>
    </div>
    <Panel title={`基础汉字库（${total} 个）`}>
      <p className="admin-help">汉字库由超级后台统一维护。家长端可以搜索、查看和试听，不可编辑资源。</p>
      <div className="admin-notice">学校优先清单：已加入 {schoolTargetCount} 个。加入后，新汉字会优先按加入顺序学习；学过后仍会自动进入复习计划。</div>
      <form className="school-target-text-form" onSubmit={addSchoolTargetsFromText}>
        <label htmlFor="school-target-hanzi-input">按文字批量加入学校学习</label>
        <textarea
          id="school-target-hanzi-input"
          value={schoolTargetText}
          onChange={(event) => setSchoolTargetText(event.target.value)}
          placeholder="输入汉字即可，例如：春夏秋冬\n也支持空格、逗号或分行"
          rows={3}
          maxLength={1_000}
        />
        <div className="school-target-text-form__footer">
          <small>系统会自动去重；不在字库中的汉字会单独提示。</small>
          <button type="submit" className="primary-button" disabled={busy || !schoolTargetText.trim()}>{busy ? "加入中…" : "批量加入"}</button>
        </div>
        {schoolTargetTextMessage ? <div className="admin-notice" role="status">{schoolTargetTextMessage}</div> : null}
      </form>
      <form className="hanzi-library-search" onSubmit={search}><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索汉字、拼音、含义或例句" /><button type="submit">搜索</button>{searchQuery ? <button type="button" onClick={() => { setSearchInput(""); setSearchQuery(""); setPage(1); }}>清除</button> : null}</form>
      <div className="school-target-toolbar">
        <label><input type="checkbox" checked={characters.length > 0 && characters.every((item) => selectedIds.has(item.id))} onChange={togglePageSelection} />全选本页（{characters.length} 个）</label>
        <span>已选 {selectedIds.size} 个</span>
        <button type="button" className="primary-button" disabled={busy || !characters.some((item) => selectedIds.has(item.id) && !item.schoolTarget)} onClick={() => void batchUpdateSchoolTargets("add")}>批量加入学校学习</button>
        <button type="button" className="ghost-button" disabled={busy || !characters.some((item) => selectedIds.has(item.id) && item.schoolTarget)} onClick={() => void batchUpdateSchoolTargets("remove")}>批量移出学校清单</button>
      </div>
      {error ? <Notice error>{error}</Notice> : null}
      <div className="admin-list hanzi-library-list">
        {characters.map((item) => <article className="list-card" key={item.id}>
          <input type="checkbox" aria-label={`选择${item.character}`} checked={selectedIds.has(item.id)} onChange={() => toggleSelected(item.id)} />
          <div className="list-card__main"><div className="hanzi-admin-media">{item.imageKey !== "default-hanzi" ? <img src={item.imageKey} alt={`${item.character}配图`} loading="lazy" /> : <div className="hanzi-admin-glyph">{item.character}</div>}</div><div><h3>{item.character}（{item.internalPinyin}）· {item.meaning} {item.schoolTarget ? <span className="status status--pending">学校优先</span> : null}</h3><p>{item.words.join("、")}</p><small>{item.sentence.replace("__", item.character)}</small></div></div>
          <div className="hanzi-resource-actions"><AudioButton label="播放字音" url={item.characterAudioUrl} fallbackText={item.character} /><AudioButton label="播放例句" url={item.sentenceAudioUrl} fallbackText={item.sentence.replace("__", item.character)} /><button type="button" className={item.schoolTarget ? "ghost-button" : "primary-button"} disabled={busy} onClick={() => void toggleSchoolTarget(item)}>{item.schoolTarget ? "移出学校清单" : "加入学校学习"}</button></div>
        </article>)}
        {!characters.length && !busy ? <div className="empty-state">没有找到符合条件的汉字</div> : null}
        {busy && !characters.length ? <div className="empty-state">正在读取基础字库…</div> : null}
      </div>
      {total > pageSize ? <div className="hanzi-library-pagination"><button type="button" disabled={page <= 1 || busy} onClick={() => setPage((value) => value - 1)}>上一页</button><span>第 {page} / {Math.ceil(total / pageSize)} 页</span><button type="button" disabled={page >= Math.ceil(total / pageSize) || busy} onClick={() => setPage((value) => value + 1)}>下一页</button></div> : null}
    </Panel>
  </div>;
}

const DEFAULT_CLOCK_SETTINGS: ClockLearningSettings = {
  questionsPerDay: 5,
  minuteStep: 5,
};

export function ParentClockLearning({ child }: { child: Child }) {
  const [settings, setSettings] = useState(DEFAULT_CLOCK_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const result = await parentApi.clockSettings(child.id);
    setSettings(result.settings);
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    void load()
      .catch((reason) => setError(reason instanceof Error ? reason.message : "时钟学习设置加载失败"))
      .finally(() => setLoading(false));
  }, [child.id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await parentApi.updateClockSettings(child.id, settings);
      setSettings(result.settings);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "时钟学习设置保存失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-stack">
    <Panel title="时钟学习设置">
        {loading ? <div className="empty-state">正在读取设置…</div> : <form className="admin-form" onSubmit={save}>
          <label>每日题量<input type="number" min={1} max={20} value={settings.questionsPerDay} onChange={(event) => setSettings({ ...settings, questionsPerDay: Number(event.target.value) })} /></label>
          <div className="field-span">
            <span className="poem-settings-label">题目难度</span>
            <div className="clock-settings-choice" role="radiogroup" aria-label="时钟题目难度">
              <button type="button" role="radio" aria-checked={settings.minuteStep === 5} className={settings.minuteStep === 5 ? "active" : ""} onClick={() => setSettings({ ...settings, minuteStep: 5 })}><strong>5 分钟一级</strong><small>分针只出现 00、05、10…</small></button>
              <button type="button" role="radio" aria-checked={settings.minuteStep === 1} className={settings.minuteStep === 1 ? "active" : ""} onClick={() => setSettings({ ...settings, minuteStep: 1 })}><strong>精确到 1 分钟</strong><small>分针可以指向任意分钟</small></button>
            </div>
          </div>
          <div className="field-span admin-help">请在“任务配置”中新建“时钟学习任务”，这里的参数会用于孩子每次进入任务时出题。</div>
          <div className="form-actions field-span"><button className="primary-button" disabled={busy}>{busy ? "保存中…" : "保存设置"}</button></div>
        </form>}
        {error ? <Notice error>{error}</Notice> : null}
    </Panel>
  </div>;
}

const DEFAULT_MAKE_TEN_SETTINGS: MakeTenLearningSettings = {
  questionsPerDay: 20,
  secondsPerQuestion: 5,
  passAccuracyPercent: 80,
};

export function ParentMakeTenLearning({ child }: { child: Child }) {
  const [settings, setSettings] = useState(DEFAULT_MAKE_TEN_SETTINGS);
  const [stats, setStats] = useState<MakeTenLearningStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    void parentApi.makeTenSettings(child.id)
      .then((result) => {
        setSettings(result.settings);
        setStats(result.stats);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "凑十训练设置加载失败"))
      .finally(() => setLoading(false));
  }, [child.id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await parentApi.updateMakeTenSettings(child.id, settings);
      setSettings(result.settings);
      const refreshed = await parentApi.makeTenSettings(child.id);
      setSettings(refreshed.settings);
      setStats(refreshed.stats);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "凑十训练设置保存失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-stack">
    <Panel title="凑十训练设置">
      {loading ? <div className="empty-state">正在读取设置…</div> : <form className="admin-form" onSubmit={save}>
        <label>每日题量<input type="number" min={1} max={50} value={settings.questionsPerDay} onChange={(event) => setSettings({ ...settings, questionsPerDay: Number(event.target.value) })} /></label>
        <label>每题时间（秒）<input type="number" min={2} max={30} step={0.1} inputMode="decimal" value={settings.secondsPerQuestion} onChange={(event) => setSettings({ ...settings, secondsPerQuestion: Number(event.target.value) })} /></label>
        <label>达标正确率（%）<input type="number" min={1} max={100} value={settings.passAccuracyPercent} onChange={(event) => setSettings({ ...settings, passAccuracyPercent: Number(event.target.value) })} /></label>
        <div className="field-span admin-help">未在规定时间内作答或选错均计为错误；最终正确率低于达标值时，本次任务不获得星星。请在“任务配置”中新建“凑十训练任务”。</div>
        <div className="form-actions field-span"><button className="primary-button" disabled={busy}>{busy ? "保存中…" : "保存设置"}</button></div>
      </form>}
      {error ? <Notice error>{error}</Notice> : null}
    </Panel>
    <Panel title="各数字掌握情况">
      <p className="admin-help make-ten-adaptive-help">系统会综合正确率和有效答题时间自动调整出题概率。答得慢或容易答错的组合会更常出现，熟练组合仍会少量复习。</p>
      <div className="table-wrap responsive-card-table">
        <table className="make-ten-fact-table">
          <thead><tr><th>组合</th><th>答题数</th><th>正确率</th><th>平均用时</th><th>近期用时</th><th>训练策略</th></tr></thead>
          <tbody>
            {stats?.facts.map((fact) => (
              <tr key={fact.target}>
                <td data-label="组合"><strong>{fact.target} + {fact.answer} = 10</strong></td>
                <td data-label="答题数">{fact.attemptCount}</td>
                <td data-label="正确率">{fact.accuracy === null ? "—" : `${Math.round(fact.accuracy * 100)}%`}</td>
                <td data-label="平均用时">{fact.averageResponseMs === null ? "—" : `${(fact.averageResponseMs / 1000).toFixed(1)} 秒`}</td>
                <td data-label="近期用时">{fact.recentResponseMs === null ? "—" : `${(fact.recentResponseMs / 1000).toFixed(1)} 秒`}</td>
                <td data-label="训练策略"><span className={`make-ten-fact-priority make-ten-fact-priority--${fact.priority.level.toLowerCase()}`}>{fact.priority.label}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!stats ? <div className="empty-state">正在读取训练数据…</div> : null}
      </div>
    </Panel>
  </div>;
}

export function ParentMathPractice({ child }: { child: Child }) {
  const [settings, setSettings] = useState<MathPracticeSettings>(DEFAULT_MATH_PRACTICE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [search, setSearch] = useState("");
  const [expandedDomains, setExpandedDomains] = useState<string[]>([MATH_QUESTION_CATEGORIES[0].id]);
  const allocatedQuestions = countAllocatedQuestions(settings.typeCounts);
  const activeTypeCount = Object.values(settings.typeCounts).filter((count) => count > 0).length;
  const allocationValid = settings.totalQuestions > 0 && allocatedQuestions === settings.totalQuestions;
  const normalizedSearch = search.trim().toLocaleLowerCase("zh-CN");

  useEffect(() => {
    setLoading(true);
    setError("");
    void parentApi.mathPracticeSettings(child.id)
      .then((result) => setSettings({ ...DEFAULT_MATH_PRACTICE_SETTINGS, ...result.settings, typeCounts: normalizeLegacyMathTypeCounts(result.settings.typeCounts), arithmeticItemsPerQuestion: { ...DEFAULT_MATH_PRACTICE_SETTINGS.arithmeticItemsPerQuestion, ...(result.settings.arithmeticItemsPerQuestion ?? {}) } }))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "数学练习设置加载失败"))
      .finally(() => setLoading(false));
  }, [child.id]);

  function setTypeCount(typeId: string, nextCount: number) {
    setSavedMessage("");
    setSettings((current) => {
      const typeCounts = { ...current.typeCounts };
      const previousCount = typeCounts[typeId] ?? 0;
      const otherQuestions = countAllocatedQuestions(typeCounts) - previousCount;
      const count = Math.max(0, Math.min(100 - otherQuestions, Number.isFinite(nextCount) ? Math.round(nextCount) : 0));
      if (count > 0) typeCounts[typeId] = count;
      else delete typeCounts[typeId];
      return { ...current, totalQuestions: countAllocatedQuestions(typeCounts), typeCounts };
    });
  }

  function setTotalQuestions(nextTotalQuestions: number) {
    const totalQuestions = clampMathTotal(nextTotalQuestions);
    setSavedMessage("");
    setSettings((current) => ({
      ...current,
      totalQuestions,
      typeCounts: rebalanceTypeCounts(current.typeCounts, totalQuestions),
    }));
  }

  function setArithmeticItemsPerQuestion(typeId: string, nextValue: number) {
    setSavedMessage("");
    setSettings((current) => ({
      ...current,
      arithmeticItemsPerQuestion: {
        ...current.arithmeticItemsPerQuestion,
        [typeId]: Math.max(1, Math.min(20, Number.isFinite(nextValue) ? Math.round(nextValue) : 5)),
      },
    }));
  }

  function applyTypeSelection(typeIds: readonly string[]) {
    setSavedMessage("");
    setSettings((current) => ({ ...current, typeCounts: allocateEvenly(current.totalQuestions, typeIds) }));
  }

  function clearDomain(typeIds: readonly string[]) {
    setSavedMessage("");
    setSettings((current) => {
      const typeCounts = { ...current.typeCounts };
      typeIds.forEach((typeId) => delete typeCounts[typeId]);
      return { ...current, totalQuestions: countAllocatedQuestions(typeCounts), typeCounts };
    });
  }

  function toggleDomain(domainId: string) {
    setExpandedDomains((current) => current.includes(domainId)
      ? current.filter((id) => id !== domainId)
      : [...current, domainId]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!allocationValid) return;
    setBusy(true);
    setError("");
    setSavedMessage("");
    try {
      const result = await parentApi.updateMathPracticeSettings(child.id, settings);
      setSettings(result.settings);
      setSavedMessage("设置已保存");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "数学练习设置保存失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-stack">
    <Panel title="数学练习设置">
      {loading ? <div className="empty-state">正在读取设置…</div> : <form className="math-settings-form" onSubmit={save}>
        <div className="math-settings-intro">
          <div>
            <span>每次练习总题数</span>
            <input aria-label="每次练习总题数" type="number" min={1} max={100} value={settings.totalQuestions} onChange={(event) => setTotalQuestions(Number(event.target.value))} />
            <small>修改后会按当前配比自动换算</small>
          </div>
          <div className={allocationValid ? "is-valid" : "is-invalid"}>
            <span>当前配置</span>
            <strong>{allocatedQuestions} / {settings.totalQuestions}</strong>
            <small>{allocationValid ? `已启用 ${activeTypeCount} 种题型` : "请至少保留一种题型"}</small>
          </div>
          <p>这套配置由当前孩子的所有“数学练习”任务共用。任务配置页面只负责出现日期、奖励和重复领取规则。</p>
        </div>
        <section className="math-settings-presets" aria-labelledby="math-preset-title">
          <header>
            <div><h3 id="math-preset-title">快速方案</h3><p>选择后会按当前总题数自动平均分配，也可以继续微调。</p></div>
            <button type="button" onClick={() => { setSettings(DEFAULT_MATH_PRACTICE_SETTINGS); setSavedMessage(""); }}>恢复默认</button>
          </header>
          <div>
            {MATH_PRACTICE_PRESETS.map((preset) => (
              <button type="button" key={preset.id} onClick={() => applyTypeSelection(preset.typeIds)}>
                <strong>{preset.name}</strong><small>{preset.description}</small>
              </button>
            ))}
          </div>
        </section>
        <div className="math-settings-toolbar">
          <label htmlFor="math-type-search"><span>查找题型</span><input id="math-type-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入编号或名称，如 N09、排序" /></label>
          <div><strong>{activeTypeCount}</strong><span>种题型已启用</span><b>{allocatedQuestions} 道</b></div>
        </div>
        <div className="math-config__domains">
          {MATH_QUESTION_CATEGORIES.map((domain, domainIndex) => {
            const families = getMathQuestionFamiliesByCategory(domain.id);
            const questionTypes = getMathQuestionTypesByCategory(domain.id);
            const visibleFamilies = families.map((family) => ({
              ...family,
              types: questionTypes.filter((type) => family.typeIds.some((typeId) => typeId === type.id) && (!normalizedSearch || `${type.id} ${type.name} ${type.description} ${family.name}`.toLocaleLowerCase("zh-CN").includes(normalizedSearch))),
            })).filter((family) => family.types.length > 0);
            const visibleTypes = visibleFamilies.flatMap((family) => family.types);
            if (!visibleTypes.length) return null;
            const domainTotal = questionTypes.reduce((sum, type) => sum + (settings.typeCounts[type.id] ?? 0), 0);
            const isOpen = Boolean(normalizedSearch) || expandedDomains.includes(domain.id) || (domainIndex === 0 && !expandedDomains.length);
            return <details open={isOpen} key={domain.id}>
              <summary onClick={(event) => { event.preventDefault(); if (!normalizedSearch) toggleDomain(domain.id); }}><span>{domainIndex + 1}</span><strong>{domain.name}</strong><b>{domainTotal} 道</b></summary>
              <div>
                <div className="math-config__domain-actions">
                  <span>本组共 {questionTypes.length} 种题型</span>
                  <button type="button" onClick={() => applyTypeSelection(questionTypes.map((type) => type.id))}>只练本组</button>
                  <button type="button" disabled={domainTotal === 0 || domainTotal === allocatedQuestions} onClick={() => clearDomain(questionTypes.map((type) => type.id))}>本组清零</button>
                </div>
                {visibleFamilies.map((family) => <section className="math-config__family" key={family.id}>
                  <header><strong>{family.name}</strong><small>{family.description}</small><span>{family.types.reduce((sum, type) => sum + (settings.typeCounts[type.id] ?? 0), 0)} 道</span></header>
                  {family.types.map((type) => {
                    const count = settings.typeCounts[type.id] ?? 0;
                    const arithmeticItems = type.domain === "C" ? (settings.arithmeticItemsPerQuestion[type.id] ?? 5) : null;
                    return <div className={`math-config__type${count > 0 ? " is-enabled" : ""}`} key={type.id}>
                      <span><b>{type.id}</b><span>{type.name}</span><small>{type.description} · 难度 {type.difficultyRange[0]}–{type.difficultyRange[1]}</small></span>
                      <div>
                        <button type="button" aria-label={`减少${type.name}`} disabled={count === 0} onClick={() => setTypeCount(type.id, count - 1)}>−</button>
                        <input aria-label={`${type.name}数量`} type="number" min={0} max={100 - allocatedQuestions + count} value={count} onChange={(event) => setTypeCount(type.id, Number(event.target.value))} />
                        <button type="button" aria-label={`增加${type.name}`} disabled={allocatedQuestions >= 100} onClick={() => setTypeCount(type.id, count + 1)}>＋</button>
                        {arithmeticItems !== null ? <label className="math-config__items-per-question"><span>每题小题</span><input aria-label={`${type.name}每题小题数`} type="number" min={1} max={20} value={arithmeticItems} onChange={(event) => setArithmeticItemsPerQuestion(type.id, Number(event.target.value))} /></label> : null}
                      </div>
                    </div>;
                  })}
                </section>)}
              </div>
            </details>;
          })}
        </div>
        {normalizedSearch && !MATH_QUESTION_CATEGORIES.some((domain) => getMathQuestionTypesByCategory(domain.id).some((type) => `${type.id} ${type.name} ${type.description}`.toLocaleLowerCase("zh-CN").includes(normalizedSearch))) ? <div className="empty-state">没有找到这个题型</div> : null}
        {error ? <Notice error>{error}</Notice> : null}
        <div className="math-settings-savebar">
          <div><strong>{allocatedQuestions} 道题 · {activeTypeCount} 种题型</strong><small>{allocationValid ? "配比已自动校准，可以直接保存" : "请先选择至少一种题型"}</small></div>
          {savedMessage ? <span role="status">{savedMessage}</span> : null}
          <button className="primary-button" disabled={busy || !allocationValid}>{busy ? "保存中…" : "保存数学练习设置"}</button>
        </div>
      </form>}
      {loading && error ? <Notice error>{error}</Notice> : null}
    </Panel>
  </div>;
}

const DEFAULT_POEM_SETTINGS: PoemLearningSettings = { enabled: false, learningWeekdays: [2, 4], learningTaskStars: 2, reviewTaskStars: 2 };
const POEM_WEEKDAYS = [{ value: 1, label: "周一" }, { value: 2, label: "周二" }, { value: 3, label: "周三" }, { value: 4, label: "周四" }, { value: 5, label: "周五" }, { value: 6, label: "周六" }, { value: 0, label: "周日" }];

export function ParentPoemLearning({ child }: { child: Child }) {
  const [settings, setSettings] = useState(DEFAULT_POEM_SETTINGS);
  const [poems, setPoems] = useState<PoemResource[]>([]);
  const [schoolTargetCount, setSchoolTargetCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState(0);
  const [busy, setBusy] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [error, setError] = useState("");

  async function loadSettings() {
    const result = await parentApi.poemSettings(child.id);
    setSettings(result.settings);
    setSchoolTargetCount(result.schoolTargetCount);
  }
  async function loadPoems(nextQuery = query, nextGrade = grade) {
    const result = await parentApi.poems(child.id, { q: nextQuery || undefined, grade: nextGrade || undefined });
    setPoems(result.poems);
  }
  useEffect(() => { setError(""); void Promise.all([loadSettings(), loadPoems("", 0)]).catch((reason) => setError(reason instanceof Error ? reason.message : "古诗学习配置加载失败")); }, [child.id]);
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, [child.id]);
  useEffect(() => { setSelectedIds(new Set()); }, [child.id, query, grade]);

  function toggleWeekday(value: number) {
    const learningWeekdays = settings.learningWeekdays.includes(value) ? settings.learningWeekdays.filter((item) => item !== value) : [...settings.learningWeekdays, value];
    setSettings({ ...settings, learningWeekdays });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await parentApi.updatePoemSettings(child.id, settings); setSettings(result.settings); await loadSettings(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "古诗学习设置保存失败"); }
    finally { setBusy(false); }
  }
  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await loadPoems(); } catch (reason) { setError(reason instanceof Error ? reason.message : "古诗库读取失败"); } finally { setBusy(false); }
  }
  function toggleAudio(poem: PoemResource) {
    if (!poem.audioUrl) return;
    if (playingId === poem.id) { audioRef.current?.pause(); audioRef.current = null; setPlayingId(null); return; }
    audioRef.current?.pause();
    const audio = new Audio(poem.audioUrl); audioRef.current = audio; setPlayingId(poem.id);
    audio.onended = () => { if (audioRef.current === audio) audioRef.current = null; setPlayingId(null); };
    audio.onerror = () => { if (audioRef.current === audio) audioRef.current = null; setPlayingId(null); setError("古诗朗读加载失败"); };
    void audio.play().catch(() => { if (audioRef.current === audio) audioRef.current = null; setPlayingId(null); setError("暂时无法播放古诗朗读"); });
  }

  async function toggleSchoolTarget(poem: PoemResource) {
    setBusy(true);
    setError("");
    try {
      if (poem.schoolTarget) {
        await parentApi.removePoemSchoolTarget(child.id, poem.id);
        setPoems((current) => current.map((item) =>
          item.id === poem.id ? { ...item, schoolTarget: null } : item,
        ));
        setSchoolTargetCount((count) => Math.max(0, count - 1));
      } else {
        const result = await parentApi.addPoemSchoolTarget(child.id, poem.id);
        setPoems((current) => current.map((item) =>
          item.id === poem.id ? { ...item, schoolTarget: result.target } : item,
        ));
        setSchoolTargetCount((count) => count + 1);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "学校学习清单更新失败");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllPoems() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = poems.length > 0 && poems.every((poem) => next.has(poem.id));
      poems.forEach((poem) => { if (allSelected) next.delete(poem.id); else next.add(poem.id); });
      return next;
    });
  }

  async function batchUpdateSchoolTargets(action: "add" | "remove") {
    const ids = poems.filter((poem) => selectedIds.has(poem.id) && (action === "add" ? !poem.schoolTarget : Boolean(poem.schoolTarget))).map((poem) => poem.id);
    if (!ids.length) return;
    setBusy(true);
    setError("");
    try {
      const delta = action === "add"
        ? (await parentApi.addPoemSchoolTargets(child.id, ids)).addedCount
        : -(await parentApi.removePoemSchoolTargets(child.id, ids)).removedCount;
      setPoems((current) => current.map((poem) => ids.includes(poem.id) ? { ...poem, schoolTarget: action === "add" ? { id: poem.id, sortOrder: 0 } : null } : poem));
      setSchoolTargetCount((count) => Math.max(0, count + delta));
      setSelectedIds(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "学校学习清单更新失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-stack">
    <Panel title="古诗学习设置"><form className="admin-form poem-settings-form" onSubmit={save}><label className="checkbox field-span"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />开启古诗学习任务</label><div className="field-span"><span className="poem-settings-label">每周新诗学习日（可多选）</span><div className="poem-weekday-picker">{POEM_WEEKDAYS.map((weekday) => <button type="button" key={weekday.value} className={settings.learningWeekdays.includes(weekday.value) ? "active" : ""} onClick={() => toggleWeekday(weekday.value)}>{weekday.label}</button>)}</div></div><label>学习任务星星<input type="number" min={1} max={999} value={settings.learningTaskStars} onChange={(event) => setSettings({ ...settings, learningTaskStars: Number(event.target.value) })} /></label><label>复习任务星星<input type="number" min={1} max={999} value={settings.reviewTaskStars} onChange={(event) => setSettings({ ...settings, reviewTaskStars: Number(event.target.value) })} /></label><div className="field-span admin-help">所选日期只控制“学习新古诗”；“复习古诗”会按照学习后第 1、2、4、7、15、30 天自动出现，有到期内容才生成任务。古诗内容和媒体资源由超级后台统一维护。</div><div className="form-actions field-span"><button className="primary-button" disabled={busy}>{busy ? "保存中…" : "保存设置"}</button></div></form>{error ? <Notice error>{error}</Notice> : null}</Panel>
    <Panel title={`古诗库（${poems.length} 首）`}><p className="admin-help">学校优先清单：已加入 {schoolTargetCount} 首。加入后，新古诗会优先按加入顺序学习；学过后仍会自动进入复习计划。</p><form className="poem-library-toolbar" onSubmit={search}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、作者或诗句" /><select value={grade} onChange={(event) => setGrade(Number(event.target.value))}><option value={0}>全部年级</option>{[1, 2, 3, 4, 5, 6].map((value) => <option value={value} key={value}>{value} 年级</option>)}</select><button className="ghost-button" disabled={busy}>查询</button></form><div className="school-target-toolbar"><label><input type="checkbox" checked={poems.length > 0 && poems.every((poem) => selectedIds.has(poem.id))} onChange={toggleAllPoems} />全选当前结果（{poems.length} 首）</label><span>已选 {selectedIds.size} 首</span><button type="button" className="primary-button" disabled={busy || !poems.some((poem) => selectedIds.has(poem.id) && !poem.schoolTarget)} onClick={() => void batchUpdateSchoolTargets("add")}>批量加入学校学习</button><button type="button" className="ghost-button" disabled={busy || !poems.some((poem) => selectedIds.has(poem.id) && poem.schoolTarget)} onClick={() => void batchUpdateSchoolTargets("remove")}>批量移出学校清单</button></div>{error ? <Notice error>{error}</Notice> : null}<div className="table-wrap poem-library-table responsive-card-table"><table><thead><tr><th>选择</th><th>年级</th><th>古诗</th><th>作者</th><th>学习状态</th><th>媒体</th><th>学校学习</th></tr></thead><tbody>{poems.map((poem) => <tr key={poem.id}><td data-label="选择"><input type="checkbox" aria-label={`选择《${poem.title}》`} checked={selectedIds.has(poem.id)} onChange={() => toggleSelected(poem.id)} /></td><td data-label="年级">{poem.grade} 年级{poem.semester}</td><td data-label="古诗"><strong>《{poem.title}》</strong><small>{poem.content}</small></td><td data-label="作者">{poem.dynasty} · {poem.author}</td><td data-label="学习状态"><span className={`status status--${poem.progress?.status === "MASTERED" ? "completed" : poem.progress ? "pending" : "cancelled"}`}>{poem.progress?.status === "MASTERED" ? "已掌握" : poem.progress ? `复习 ${poem.progress.reviewStage}/6` : "未学习"}</span>{poem.progress?.nextReviewDate ? <small>下次 {poem.progress.nextReviewDate.slice(0, 10)}</small> : null}</td><td data-label="媒体"><div className="poem-media-cell">{poem.imageUrl ? <img src={poem.imageUrl} alt={`《${poem.title}》配图`} loading="lazy" decoding="async" /> : <div className="poem-media-placeholder">暂无配图</div>}<div className="poem-media-actions"><button type="button" className="hanzi-audio-button" disabled={!poem.audioUrl} onClick={() => toggleAudio(poem)}>{playingId === poem.id ? "停止" : "试听朗读"}</button></div></div></td><td data-label="学校学习"><button type="button" className={poem.schoolTarget ? "ghost-button" : "primary-button"} disabled={busy} onClick={() => void toggleSchoolTarget(poem)}>{poem.schoolTarget ? "移出清单" : "加入学校学习"}</button></td></tr>)}</tbody></table>{!poems.length ? <div className="empty-state">没有找到符合条件的古诗</div> : null}</div></Panel>
  </div>;
}
