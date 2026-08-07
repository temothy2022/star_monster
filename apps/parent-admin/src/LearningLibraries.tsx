import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  parentApi,
  type Child,
  type ClockLearningSettings,
  type MakeTenLearningSettings,
  type HanziCharacterResource,
  type HanziLearningSettings,
  type PoemLearningSettings,
  type PoemResource,
} from "./api";

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
      <form className="hanzi-library-search" onSubmit={search}><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索汉字、拼音、含义或例句" /><button type="submit">搜索</button>{searchQuery ? <button type="button" onClick={() => { setSearchInput(""); setSearchQuery(""); setPage(1); }}>清除</button> : null}</form>
      {error ? <Notice error>{error}</Notice> : null}
      <div className="admin-list hanzi-library-list">
        {characters.map((item) => <article className="list-card" key={item.id}><div className="list-card__main"><div className="hanzi-admin-media">{item.imageKey !== "default-hanzi" ? <img src={item.imageKey} alt={`${item.character}配图`} loading="lazy" /> : <div className="hanzi-admin-glyph">{item.character}</div>}</div><div><h3>{item.character}（{item.internalPinyin}）· {item.meaning}</h3><p>{item.words.join("、")}</p><small>{item.sentence.replace("__", item.character)}</small></div></div><div className="hanzi-resource-actions"><AudioButton label="播放字音" url={item.characterAudioUrl} fallbackText={item.character} /><AudioButton label="播放例句" url={item.sentenceAudioUrl} fallbackText={item.sentence.replace("__", item.character)} /></div></article>)}
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    void parentApi.makeTenSettings(child.id)
      .then((result) => setSettings(result.settings))
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
  </div>;
}

const DEFAULT_POEM_SETTINGS: PoemLearningSettings = { enabled: false, learningWeekdays: [2, 4], learningTaskStars: 2, reviewTaskStars: 2 };
const POEM_WEEKDAYS = [{ value: 1, label: "周一" }, { value: 2, label: "周二" }, { value: 3, label: "周三" }, { value: 4, label: "周四" }, { value: 5, label: "周五" }, { value: 6, label: "周六" }, { value: 0, label: "周日" }];

export function ParentPoemLearning({ child }: { child: Child }) {
  const [settings, setSettings] = useState(DEFAULT_POEM_SETTINGS);
  const [poems, setPoems] = useState<PoemResource[]>([]);
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState(0);
  const [busy, setBusy] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [error, setError] = useState("");

  async function loadSettings() {
    const result = await parentApi.poemSettings(child.id);
    setSettings(result.settings);
  }
  async function loadPoems(nextQuery = query, nextGrade = grade) {
    const result = await parentApi.poems(child.id, { q: nextQuery || undefined, grade: nextGrade || undefined });
    setPoems(result.poems);
  }
  useEffect(() => { setError(""); void Promise.all([loadSettings(), loadPoems("", 0)]).catch((reason) => setError(reason instanceof Error ? reason.message : "古诗学习配置加载失败")); }, [child.id]);
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, [child.id]);

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

  return <div className="admin-stack">
    <Panel title="古诗学习设置"><form className="admin-form poem-settings-form" onSubmit={save}><label className="checkbox field-span"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />开启古诗学习任务</label><div className="field-span"><span className="poem-settings-label">每周新诗学习日（可多选）</span><div className="poem-weekday-picker">{POEM_WEEKDAYS.map((weekday) => <button type="button" key={weekday.value} className={settings.learningWeekdays.includes(weekday.value) ? "active" : ""} onClick={() => toggleWeekday(weekday.value)}>{weekday.label}</button>)}</div></div><label>学习任务星星<input type="number" min={1} max={999} value={settings.learningTaskStars} onChange={(event) => setSettings({ ...settings, learningTaskStars: Number(event.target.value) })} /></label><label>复习任务星星<input type="number" min={1} max={999} value={settings.reviewTaskStars} onChange={(event) => setSettings({ ...settings, reviewTaskStars: Number(event.target.value) })} /></label><div className="field-span admin-help">所选日期只控制“学习新古诗”；“复习古诗”会按照学习后第 1、2、4、7、15、30 天自动出现，有到期内容才生成任务。古诗内容和媒体资源由超级后台统一维护。</div><div className="form-actions field-span"><button className="primary-button" disabled={busy}>{busy ? "保存中…" : "保存设置"}</button></div></form>{error ? <Notice error>{error}</Notice> : null}</Panel>
    <Panel title={`古诗库（${poems.length} 首）`}><form className="poem-library-toolbar" onSubmit={search}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、作者或诗句" /><select value={grade} onChange={(event) => setGrade(Number(event.target.value))}><option value={0}>全部年级</option>{[1, 2, 3, 4, 5, 6].map((value) => <option value={value} key={value}>{value} 年级</option>)}</select><button className="ghost-button" disabled={busy}>查询</button></form>{error ? <Notice error>{error}</Notice> : null}<div className="table-wrap poem-library-table"><table><thead><tr><th>年级</th><th>古诗</th><th>作者</th><th>学习状态</th><th>媒体</th></tr></thead><tbody>{poems.map((poem) => <tr key={poem.id}><td>{poem.grade} 年级{poem.semester}</td><td><strong>《{poem.title}》</strong><small>{poem.content}</small></td><td>{poem.dynasty} · {poem.author}</td><td><span className={`status status--${poem.progress?.status === "MASTERED" ? "completed" : poem.progress ? "pending" : "cancelled"}`}>{poem.progress?.status === "MASTERED" ? "已掌握" : poem.progress ? `复习 ${poem.progress.reviewStage}/6` : "未学习"}</span>{poem.progress?.nextReviewDate ? <small>下次 {poem.progress.nextReviewDate.slice(0, 10)}</small> : null}</td><td><div className="poem-media-cell">{poem.imageUrl ? <img src={poem.imageUrl} alt={`《${poem.title}》配图`} loading="lazy" decoding="async" /> : <div className="poem-media-placeholder">暂无配图</div>}<div className="poem-media-actions"><button type="button" className="hanzi-audio-button" disabled={!poem.audioUrl} onClick={() => toggleAudio(poem)}>{playingId === poem.id ? "停止" : "试听朗读"}</button></div></div></td></tr>)}</tbody></table>{!poems.length ? <div className="empty-state">没有找到符合条件的古诗</div> : null}</div></Panel>
  </div>;
}
