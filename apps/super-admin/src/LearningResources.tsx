import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  adminApi,
  type HanziResource,
  type MascotDialogue,
  type MinimaxConfig,
  type PoemResource,
} from "./api";
import { Modal, Pagination } from "antd";
import { NumberField } from "./NumberField";

function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div className={`admin-notice${error ? " admin-notice--error" : ""}`}>
      {children}
    </div>
  );
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
  function toggle() {
    if (playing) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    if (!url) {
      const speech = new SpeechSynthesisUtterance(fallbackText);
      speech.lang = "zh-CN";
      speech.rate = 0.82;
      speech.onend = () => setPlaying(false);
      setPlaying(true);
      window.speechSynthesis?.speak(speech);
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      audioRef.current = null;
      setPlaying(false);
    };
    audio.onerror = () => {
      audioRef.current = null;
      setPlaying(false);
    };
    setPlaying(true);
    void audio.play().catch(() => setPlaying(false));
  }
  useEffect(
    () => () => {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    },
    [url],
  );
  return (
    <button type="button" className="ghost-button" onClick={toggle}>
      {playing ? "停止" : label}
    </button>
  );
}

type HanziForm = {
  character: string;
  internalPinyin: string;
  meaning: string;
  shapeHint: string;
  sentence: string;
  wordsText: string;
  wordAudioUrls: string[];
  imageKey: string;
  characterAudioUrl: string;
  sentenceAudioUrl: string;
  sortOrder: number;
  isEnabled: boolean;
};
const EMPTY_HANZI: HanziForm = {
  character: "",
  internalPinyin: "",
  meaning: "",
  shapeHint: "",
  sentence: "",
  wordsText: "",
  wordAudioUrls: [],
  imageKey: "default-hanzi",
  characterAudioUrl: "",
  sentenceAudioUrl: "",
  sortOrder: 0,
  isEnabled: true,
};
function hanziForm(item: HanziResource | null): HanziForm {
  return item
    ? {
        character: item.character,
        internalPinyin: item.internalPinyin,
        meaning: item.meaning,
        shapeHint: item.shapeHint,
        sentence: item.sentence,
        wordsText: item.words.join("、"),
        wordAudioUrls: [...item.wordAudioUrls],
        imageKey: item.imageKey,
        characterAudioUrl: item.characterAudioUrl ?? "",
        sentenceAudioUrl: item.sentenceAudioUrl ?? "",
        sortOrder: item.sortOrder,
        isEnabled: item.isEnabled,
      }
    : EMPTY_HANZI;
}

export function HanziLibrary() {
  const [items, setItems] = useState<HanziResource[]>([]);
  const [form, setForm] = useState(EMPTY_HANZI);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [pageSize, setPageSize] = useState(30);
  async function load(nextPage = page, nextQuery = query) {
    setBusy(true);
    setError("");
    try {
      const result = await adminApi.hanziCharacters({
        q: nextQuery,
        page: nextPage,
        pageSize,
        includeDisabled: true,
      });
      setItems(result.characters);
      setTotal(result.total);
      setPage(result.page);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "汉字库读取失败");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load(page, query);
  }, [page, pageSize, query]);
  function payload() {
    return {
      character: form.character,
      internalPinyin: form.internalPinyin,
      meaning: form.meaning,
      shapeHint: form.shapeHint,
      sentence: form.sentence,
      words: form.wordsText
        .split(/[、,，\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
      wordAudioUrls: form.wordAudioUrls,
      imageKey: form.imageKey || "default-hanzi",
      characterAudioUrl: form.characterAudioUrl || null,
      sentenceAudioUrl: form.sentenceAudioUrl || null,
      sortOrder: form.sortOrder,
      isEnabled: form.isEnabled,
    };
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editingId) await adminApi.updateHanziCharacter(editingId, payload());
      else await adminApi.createHanziCharacter(payload());
      setEditingId(null);
      setForm(EMPTY_HANZI);
      setEditorOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "汉字保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    kind: "image" | "character-audio" | "sentence-audio" | "word-audio",
    file: File,
    wordIndex?: number,
  ) {
    if (!editingId) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminApi.uploadHanziMedia(
        editingId,
        kind,
        file,
        wordIndex,
      );
      setForm(hanziForm(result.character));
      setItems((current) =>
        current.map((item) =>
          item.id === result.character.id ? result.character : item,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "媒体上传失败");
    } finally {
      setBusy(false);
    }
  }
  async function generate(
    kind: "image" | "character-audio" | "sentence-audio" | "word-audio",
    wordIndex?: number,
  ) {
    if (!editingId) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminApi.generateHanziMedia(
        editingId,
        kind,
        wordIndex,
      );
      setForm(hanziForm(result.character));
      setItems((current) =>
        current.map((item) =>
          item.id === result.character.id ? result.character : item,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "自动生成失败");
    } finally {
      setBusy(false);
    }
  }
  async function archive(item: HanziResource) {
    if (!window.confirm(`停用“${item.character}”？已有学习记录会保留。`))
      return;
    setBusy(true);
    try {
      await adminApi.deleteHanziCharacter(item.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "停用失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-stack">
      <div>
        <Modal
          open={editorOpen}
          footer={null}
          width={920}
          destroyOnHidden
          onCancel={() => {
            if (busy) return;
            setEditorOpen(false);
            setEditingId(null);
            setForm(EMPTY_HANZI);
            setError("");
          }}
        >
          <section className="admin-panel">
            <header className="admin-panel__header">
              <h2>{editingId ? "编辑汉字" : "新增汉字"}</h2>
            </header>
            <form className="admin-form" onSubmit={save}>
              <label>
                汉字
                <input
                  required
                  maxLength={2}
                  value={form.character}
                  onChange={(event) =>
                    setForm({ ...form, character: event.target.value })
                  }
                />
              </label>
              <label>
                拼音
                <input
                  required
                  value={form.internalPinyin}
                  onChange={(event) =>
                    setForm({ ...form, internalPinyin: event.target.value })
                  }
                />
              </label>
              <label className="field-span">
                含义
                <input
                  required
                  value={form.meaning}
                  onChange={(event) =>
                    setForm({ ...form, meaning: event.target.value })
                  }
                />
              </label>
              <label className="field-span">
                字形提示
                <input
                  required
                  value={form.shapeHint}
                  onChange={(event) =>
                    setForm({ ...form, shapeHint: event.target.value })
                  }
                />
              </label>
              <label className="field-span">
                例句（用 __ 标记汉字）
                <input
                  required
                  value={form.sentence}
                  onChange={(event) =>
                    setForm({ ...form, sentence: event.target.value })
                  }
                />
              </label>
              <label className="field-span">
                词语
                <textarea
                  required
                  value={form.wordsText}
                  onChange={(event) =>
                    setForm({ ...form, wordsText: event.target.value })
                  }
                />
              </label>
              <label>
                排序
                <NumberField
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(event) =>
                    setForm({ ...form, sortOrder: Number(event.target.value) })
                  }
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(event) =>
                    setForm({ ...form, isEnabled: event.target.checked })
                  }
                />
                启用
              </label>
              {editingId ? (
                <div className="field-span hanzi-media-editor">
                  <strong>媒体资源</strong>
                  <div className="form-actions">
                    <label className="ghost-button">
                      上传图片
                      <input
                        hidden
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) void upload("image", file);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      onClick={() => void generate("image")}
                    >
                      自动生成图片
                    </button>
                  </div>
                  <div className="form-actions">
                    <AudioButton
                      label="试听字音"
                      url={form.characterAudioUrl || null}
                      fallbackText={form.character}
                    />
                    <label className="ghost-button">
                      上传字音
                      <input
                        hidden
                        type="file"
                        accept="audio/mpeg,audio/mp4,audio/wav"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) void upload("character-audio", file);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      onClick={() => void generate("character-audio")}
                    >
                      自动生成字音
                    </button>
                  </div>
                  <div className="form-actions">
                    <AudioButton
                      label="试听例句"
                      url={form.sentenceAudioUrl || null}
                      fallbackText={form.sentence.replace("__", form.character)}
                    />
                    <label className="ghost-button">
                      上传例句音频
                      <input
                        hidden
                        type="file"
                        accept="audio/mpeg,audio/mp4,audio/wav"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) void upload("sentence-audio", file);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      onClick={() => void generate("sentence-audio")}
                    >
                      自动生成例句
                    </button>
                  </div>
                  {form.wordsText.split(/[、,，\n]/).map((word, index) =>
                    word.trim() ? (
                      <div className="form-actions" key={`${word}-${index}`}>
                        <span>{word.trim()}</span>
                        <AudioButton
                          label="试听词语"
                          url={form.wordAudioUrls[index] || null}
                          fallbackText={word.trim()}
                        />
                        <label className="ghost-button">
                          上传词音
                          <input
                            hidden
                            type="file"
                            accept="audio/mpeg,audio/mp4,audio/wav"
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              if (file) void upload("word-audio", file, index);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={busy}
                          onClick={() => void generate("word-audio", index)}
                        >
                          自动生成
                        </button>
                      </div>
                    ) : null,
                  )}
                </div>
              ) : null}
              <div className="form-actions field-span">
                <button className="primary-button" disabled={busy}>
                  {busy ? "处理中…" : editingId ? "保存修改" : "加入字库"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setEditorOpen(false);
                      setEditingId(null);
                      setForm(EMPTY_HANZI);
                      setError("");
                    }}
                  >
                    取消编辑
                  </button>
                ) : null}
              </div>
              {error ? (
                <div className="field-span">
                  <Notice error>{error}</Notice>
                </div>
              ) : null}
            </form>
          </section>
        </Modal>
        <section className="admin-panel">
          <header className="admin-panel__header">
            <h2>汉字库（{total}）</h2>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_HANZI);
                setError("");
                setEditorOpen(true);
              }}
            >
              新增汉字
            </button>
          </header>
          <form
            className="super-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              void load(1, query);
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索汉字、拼音或例句"
            />
            <button className="ghost-button">搜索</button>
          </form>
          <div className="admin-list">
            {items.map((item) => (
              <article className="list-card" key={item.id}>
                <div className="list-card__main">
                  <div className="hanzi-admin-media">
                    {item.imageKey !== "default-hanzi" ? (
                      <img
                        src={item.imageKey}
                        alt={`${item.character}配图`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="hanzi-admin-glyph">{item.character}</div>
                    )}
                  </div>
                  <div>
                    <h3>
                      {item.character}（{item.internalPinyin}）
                      {!item.isEnabled ? " · 已停用" : ""}
                    </h3>
                    <p>
                      {item.meaning} · {item.words.join("、")}
                    </p>
                    <small>{item.sentence.replace("__", item.character)}</small>
                  </div>
                </div>
                <div className="list-card__actions">
                  <AudioButton
                    label="字音"
                    url={item.characterAudioUrl}
                    fallbackText={item.character}
                  />
                  <AudioButton
                    label="例句"
                    url={item.sentenceAudioUrl}
                    fallbackText={item.sentence.replace("__", item.character)}
                  />
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      setEditingId(item.id);
                      setForm(hanziForm(item));
                      setError("");
                      setEditorOpen(true);
                    }}
                  >
                    编辑
                  </button>
                  {item.isEnabled ? (
                    <button
                      className="danger-text"
                      type="button"
                      disabled={busy}
                      onClick={() => void archive(item)}
                    >
                      停用
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {!items.length ? (
              <div className="empty-state">没有找到汉字</div>
            ) : null}
          </div>
          <Pagination className="admin-pagination" current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} showTotal={(value) => `共 ${value} 个汉字`} disabled={busy} onShowSizeChange={(_, size) => { setPage(1); setPageSize(size); }} onChange={(value, nextPageSize) => { setPage(value); if (nextPageSize !== pageSize) setPageSize(nextPageSize); }} />
        </section>
      </div>
    </div>
  );
}

type PoemForm = {
  title: string;
  dynasty: string;
  author: string;
  grade: number;
  semester: string;
  content: string;
  imageUrl: string;
  audioUrl: string;
  sortOrder: number;
  isEnabled: boolean;
};
const EMPTY_POEM: PoemForm = {
  title: "",
  dynasty: "",
  author: "",
  grade: 1,
  semester: "上",
  content: "",
  imageUrl: "",
  audioUrl: "",
  sortOrder: 0,
  isEnabled: true,
};
function poemForm(item: PoemResource | null): PoemForm {
  return item
    ? { ...item, imageUrl: item.imageUrl ?? "", audioUrl: item.audioUrl ?? "" }
    : EMPTY_POEM;
}

export function PoemLibrary() {
  const [items, setItems] = useState<PoemResource[]>([]);
  const [form, setForm] = useState(EMPTY_POEM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [pageSize, setPageSize] = useState(30);
  async function load(nextQuery = query, nextGrade = grade, nextPage = page) {
    setBusy(true);
    setError("");
    try {
      const result = await adminApi.poems({
        q: nextQuery,
        grade: nextGrade || undefined,
        page: nextPage,
        pageSize,
        includeDisabled: true,
      });
      setItems(result.poems);
      setTotal(result.total);
      setPage(result.page);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "古诗库读取失败");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load(query, grade, page);
  }, [page, pageSize, query, grade]);
  function payload() {
    return {
      ...form,
      imageUrl: form.imageUrl || null,
      audioUrl: form.audioUrl || null,
    };
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (editingId) await adminApi.updatePoem(editingId, payload());
      else await adminApi.createPoem(payload());
      setEditingId(null);
      setForm(EMPTY_POEM);
      setEditorOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "古诗保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function upload(kind: "image" | "audio", file: File) {
    if (!editingId) return;
    setBusy(true);
    try {
      const result = await adminApi.uploadPoemMedia(editingId, kind, file);
      setForm(poemForm(result.poem));
      setItems((current) =>
        current.map((item) =>
          item.id === result.poem.id ? result.poem : item,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "媒体上传失败");
    } finally {
      setBusy(false);
    }
  }
  async function generate(kind: "image" | "audio") {
    if (!editingId) return;
    setBusy(true);
    try {
      const result = await adminApi.generatePoemMedia(editingId, kind);
      setForm(poemForm(result.poem));
      setItems((current) =>
        current.map((item) =>
          item.id === result.poem.id ? result.poem : item,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "自动生成失败");
    } finally {
      setBusy(false);
    }
  }
  function toggleAudio(item: PoemResource) {
    if (!item.audioUrl) return;
    if (playingId === item.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(item.audioUrl);
    audioRef.current = audio;
    audio.onended = () => {
      audioRef.current = null;
      setPlayingId(null);
    };
    audio.onerror = () => {
      audioRef.current = null;
      setPlayingId(null);
    };
    setPlayingId(item.id);
    void audio.play().catch(() => setPlayingId(null));
  }
  async function archive(item: PoemResource) {
    if (!window.confirm(`停用《${item.title}》？已有学习记录会保留。`)) return;
    setBusy(true);
    try {
      await adminApi.deletePoem(item.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "停用失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-stack">
      <div>
        <Modal
          open={editorOpen}
          footer={null}
          width={920}
          destroyOnHidden
          onCancel={() => {
            if (busy) return;
            setEditorOpen(false);
            setEditingId(null);
            setForm(EMPTY_POEM);
            setError("");
          }}
        >
          <section className="admin-panel">
            <header className="admin-panel__header">
              <h2>{editingId ? "编辑古诗" : "新增古诗"}</h2>
            </header>
            <form className="admin-form" onSubmit={save}>
              <label>
                标题
                <input
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <label>
                朝代
                <input
                  required
                  value={form.dynasty}
                  onChange={(event) =>
                    setForm({ ...form, dynasty: event.target.value })
                  }
                />
              </label>
              <label>
                作者
                <input
                  required
                  value={form.author}
                  onChange={(event) =>
                    setForm({ ...form, author: event.target.value })
                  }
                />
              </label>
              <label>
                年级
                <select
                  value={form.grade}
                  onChange={(event) =>
                    setForm({ ...form, grade: Number(event.target.value) })
                  }
                >
                  {[1, 2, 3, 4, 5, 6].map((value) => (
                    <option key={value} value={value}>
                      {value} 年级
                    </option>
                  ))}
                </select>
              </label>
              <label>
                学期
                <input
                  required
                  value={form.semester}
                  onChange={(event) =>
                    setForm({ ...form, semester: event.target.value })
                  }
                />
              </label>
              <label className="field-span">
                全文
                <textarea
                  required
                  value={form.content}
                  onChange={(event) =>
                    setForm({ ...form, content: event.target.value })
                  }
                />
              </label>
              <label>
                排序
                <NumberField
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(event) =>
                    setForm({ ...form, sortOrder: Number(event.target.value) })
                  }
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(event) =>
                    setForm({ ...form, isEnabled: event.target.checked })
                  }
                />
                启用
              </label>
              {editingId ? (
                <div className="field-span hanzi-media-editor">
                  <div className="form-actions">
                    <label className="ghost-button">
                      上传配图
                      <input
                        hidden
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) void upload("image", file);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      onClick={() => void generate("image")}
                    >
                      自动生成配图
                    </button>
                  </div>
                  <div className="form-actions">
                    <AudioButton
                      label="试听朗读"
                      url={form.audioUrl || null}
                      fallbackText={`${form.title}。${form.dynasty}，${form.author}。${form.content}`}
                    />
                    <label className="ghost-button">
                      上传朗读
                      <input
                        hidden
                        type="file"
                        accept="audio/mpeg,audio/mp4,audio/wav"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) void upload("audio", file);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      onClick={() => void generate("audio")}
                    >
                      自动生成朗读
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="form-actions field-span">
                <button className="primary-button" disabled={busy}>
                  {busy ? "处理中…" : editingId ? "保存修改" : "加入古诗库"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setEditorOpen(false);
                      setEditingId(null);
                      setForm(EMPTY_POEM);
                      setError("");
                    }}
                  >
                    取消编辑
                  </button>
                ) : null}
              </div>
              {error ? (
                <div className="field-span">
                  <Notice error>{error}</Notice>
                </div>
              ) : null}
            </form>
          </section>
        </Modal>
        <section className="admin-panel">
          <header className="admin-panel__header">
            <h2>古诗库（{total}）</h2>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_POEM);
                setError("");
                setEditorOpen(true);
              }}
            >
              新增古诗
            </button>
          </header>
          <form
            className="super-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              void load(query, grade, 1);
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、作者或诗句"
            />
            <select
              value={grade}
              onChange={(event) => setGrade(Number(event.target.value))}
            >
              <option value={0}>全部年级</option>
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value} 年级
                </option>
              ))}
            </select>
            <button className="ghost-button">搜索</button>
          </form>
          <div className="table-wrap poem-library-table">
            <table>
              <thead>
                <tr>
                  <th>年级</th>
                  <th>古诗</th>
                  <th>作者</th>
                  <th>媒体</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.grade} 年级{item.semester}
                    </td>
                    <td>
                      <strong>《{item.title}》</strong>
                      <small>{item.content}</small>
                    </td>
                    <td>
                      {item.dynasty} · {item.author}
                    </td>
                    <td>
                      <div className="poem-media-cell">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={`《${item.title}》配图`}
                            loading="lazy"
                          />
                        ) : (
                          <div className="poem-media-placeholder">暂无配图</div>
                        )}
                        <AudioButton
                          label="试听朗读"
                          url={item.audioUrl}
                          fallbackText={`${item.title}。${item.dynasty}，${item.author}。${item.content}`}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="list-card__actions">
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => {
                            setEditingId(item.id);
                            setForm(poemForm(item));
                            setError("");
                            setEditorOpen(true);
                          }}
                        >
                          编辑
                        </button>
                        {item.isEnabled ? (
                          <button
                            className="danger-text"
                            type="button"
                            disabled={busy}
                            onClick={() => void archive(item)}
                          >
                            停用
                          </button>
                        ) : (
                          <span className="status status--cancelled">
                            已停用
                          </span>
                        )}
                        {item.audioUrl ? (
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => toggleAudio(item)}
                          >
                            {playingId === item.id ? "停止" : "播放"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length ? (
              <div className="empty-state">没有找到古诗</div>
            ) : null}
          </div>
          <Pagination className="admin-pagination" current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} showTotal={(value) => `共 ${value} 首古诗`} disabled={busy} onShowSizeChange={(_, size) => { setPage(1); setPageSize(size); }} onChange={(value, nextPageSize) => { setPage(value); if (nextPageSize !== pageSize) setPageSize(nextPageSize); }} />
        </section>
      </div>
    </div>
  );
}

export function MinimaxSettings() {
  const [config, setConfig] = useState<MinimaxConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void adminApi
      .minimaxConfig()
      .then(({ config: loaded }) => {
        setConfig(loaded);
        setEnabled(loaded.enabled || !loaded.configured);
      })
      .catch((reason) =>
        setMessage(reason instanceof Error ? reason.message : "读取配置失败"),
      );
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await adminApi.saveMinimaxConfig({
        apiKey: apiKey || undefined,
        enabled,
      });
      setConfig(result.config);
      setApiKey("");
      setMessage("MiniMax 配置已保存");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setMessage("");
    try {
      setMessage((await adminApi.testMinimaxConfig()).message);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "连接测试失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel">
      <header className="admin-panel__header">
        <h2>MiniMax 配置</h2>
      </header>
      <form className="admin-form" onSubmit={save}>
        <label className="field-span">
          {config?.configured
            ? `替换密钥（当前末四位 ${config.apiKeyLastFour}）`
            : "MiniMax API Key"}
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            required={!config?.configured}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              config?.configured ? "留空则保留当前密钥" : "sk-api-..."
            }
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          启用全平台图片和音频自动生成
        </label>
        {message ? (
          <div className="field-span">
            <Notice>{message}</Notice>
          </div>
        ) : null}
        <div className="form-actions field-span">
          <button
            type="button"
            className="ghost-button"
            disabled={!config?.configured || busy}
            onClick={() => void test()}
          >
            测试连接
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "保存中…" : "保存配置"}
          </button>
        </div>
      </form>
      <p className="admin-help">
        密钥加密保存在服务端，只供超级后台资源管理使用。生成操作会写入审计日志。
      </p>
    </section>
  );
}

const DIALOGUE_CONTEXT_LABELS: Record<MascotDialogue["context"], string> = {
  START: "准备开始",
  PROGRESS: "进行途中",
  COMPLETE: "全部完成",
  EMPTY: "暂无任务",
  GENERAL: "通用鼓励",
  PET_NEEDS_CARE: "小屋·又饿又渴",
  PET_HUNGRY: "小屋·饥饿",
  PET_THIRSTY: "小屋·口渴",
  PET_TASK_START: "小屋·任务未开始",
  PET_TASK_PROGRESS: "小屋·任务进行中",
  PET_TASK_COMPLETE: "小屋·任务已完成",
  PET_RELAX: "小屋·今日无任务",
  PET_GENERAL: "小屋·通用陪伴",
};

export function MascotDialogueLibrary() {
  const [items, setItems] = useState<MascotDialogue[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pageSize, setPageSize] = useState(20);

  async function load() {
    try {
      const result = await adminApi.mascotDialogues(page, pageSize);
      setItems(result.dialogues);
      setTotal(result.total);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "星宠对话读取失败");
    }
  }

  useEffect(() => {
    void load();
  }, [page, pageSize]);

  function replace(updated: MascotDialogue) {
    setItems((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  async function save(item: MascotDialogue) {
    setBusyId(item.id);
    setMessage("");
    try {
      replace(
        (
          await adminApi.updateMascotDialogue(item.id, {
            text: item.text,
            context: item.context,
            isEnabled: item.isEnabled,
            sortOrder: item.sortOrder,
          })
        ).dialogue,
      );
      setMessage("对话内容已保存；文字改变后需要重新生成语音");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusyId(null);
    }
  }

  async function generate(id: string) {
    setBusyId(id);
    setMessage("");
    try {
      replace((await adminApi.generateMascotDialogueAudio(id)).dialogue);
      setMessage("MiniMax 语音已生成");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "语音生成失败");
    } finally {
      setBusyId(null);
    }
  }

  async function generateMissing() {
    const missing = items.filter((item) => item.isEnabled && !item.audioUrl);
    if (!missing.length) {
      setMessage("所有启用对话都已有语音");
      return;
    }
    setBulkBusy(true);
    setMessage(`准备生成 ${missing.length} 条语音…`);
    let completed = 0;
    let failed = 0;
    for (const item of missing) {
      setBusyId(item.id);
      try {
        replace((await adminApi.generateMascotDialogueAudio(item.id)).dialogue);
        completed += 1;
      } catch {
        failed += 1;
      }
      setMessage(
        `已处理 ${completed + failed}/${missing.length}，成功 ${completed} 条${failed ? `，失败 ${failed} 条` : ""}`,
      );
    }
    setBusyId(null);
    setBulkBusy(false);
  }

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <header className="admin-panel__header">
          <div>
            <h2>星宠对话</h2>
            <p>任务页和星宠小屋会按场景选择话术；孩子点击星宠时才播放语音。</p>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={bulkBusy || Boolean(busyId)}
            onClick={() => void generateMissing()}
          >
            {bulkBusy ? "批量生成中…" : "生成本页缺失语音"}
          </button>
        </header>
        {message ? <Notice>{message}</Notice> : null}
        <div className="mascot-dialogue-grid">
          {items.map((item) => (
            <article className="mascot-dialogue-card" key={item.id}>
              <div className="mascot-dialogue-card__meta">
                <span>{DIALOGUE_CONTEXT_LABELS[item.context]}</span>
                <small>
                  {item.audioUrl ? "已有 MiniMax 语音" : "缺少语音"}
                </small>
              </div>
              <textarea
                maxLength={40}
                value={item.text}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((entry) =>
                      entry.id === item.id
                        ? { ...entry, text: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
              <div className="mascot-dialogue-card__settings">
                <select
                  value={item.context}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry) =>
                        entry.id === item.id
                          ? {
                              ...entry,
                              context: event.target
                                .value as MascotDialogue["context"],
                            }
                          : entry,
                      ),
                    )
                  }
                >
                  {Object.entries(DIALOGUE_CONTEXT_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
                <NumberField
                  aria-label="排序"
                  type="number"
                  min={0}
                  max={10000}
                  value={item.sortOrder}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, sortOrder: Number(event.target.value) }
                          : entry,
                      ),
                    )
                  }
                />
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={item.isEnabled}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, isEnabled: event.target.checked }
                            : entry,
                        ),
                      )
                    }
                  />
                  启用
                </label>
              </div>
              <div className="list-card__actions">
                {item.audioUrl ? (
                  <AudioButton
                    label="试听语音"
                    url={item.audioUrl}
                    fallbackText={item.text}
                  />
                ) : null}
                <button
                  type="button"
                  className="ghost-button"
                  disabled={bulkBusy || busyId === item.id}
                  onClick={() => void generate(item.id)}
                >
                  {busyId === item.id
                    ? "生成中…"
                    : item.audioUrl
                      ? "重新生成"
                      : "生成语音"}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={bulkBusy || busyId === item.id}
                  onClick={() => void save(item)}
                >
                  保存
                </button>
              </div>
            </article>
          ))}
        </div>
        <Pagination className="admin-pagination" current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} showTotal={(value) => `共 ${value} 条对话`} onShowSizeChange={(_, size) => { setPage(1); setPageSize(size); }} onChange={(nextPage, nextPageSize) => { setPage(nextPage); if (nextPageSize !== pageSize) setPageSize(nextPageSize); }} />
      </section>
    </div>
  );
}

export function LearningResources() {
  const [tab, setTab] = useState<"hanzi" | "poems" | "mascot" | "minimax">(
    "hanzi",
  );
  return (
    <div className="admin-stack">
      <div className="super-toolbar resource-tabs">
        <button
          className={tab === "hanzi" ? "primary-button" : "ghost-button"}
          onClick={() => setTab("hanzi")}
        >
          汉字库
        </button>
        <button
          className={tab === "poems" ? "primary-button" : "ghost-button"}
          onClick={() => setTab("poems")}
        >
          古诗库
        </button>
        <button
          className={tab === "mascot" ? "primary-button" : "ghost-button"}
          onClick={() => setTab("mascot")}
        >
          星宠对话
        </button>
        <button
          className={tab === "minimax" ? "primary-button" : "ghost-button"}
          onClick={() => setTab("minimax")}
        >
          MiniMax 配置
        </button>
      </div>
      {tab === "hanzi" ? (
        <HanziLibrary />
      ) : tab === "poems" ? (
        <PoemLibrary />
      ) : tab === "mascot" ? (
        <MascotDialogueLibrary />
      ) : (
        <MinimaxSettings />
      )}
    </div>
  );
}
