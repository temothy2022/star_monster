import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pagination } from "antd";
import { adminApi, type PetDestination, type PetGrowthConfig, type PetRoomMascotMotion, type PetRoomTheme, type PetRoomThemeMascotAnimation, type PetTravelTier, type PetType } from "./api";
import { NumberField as EditableNumberField } from "./NumberField";

const TIER_LABEL: Record<PetTravelTier, string> = { NEARBY: "附近", CHINA: "中国", WORLD: "世界" };
const ROOM_MOTION_LABEL: Record<PetRoomMascotMotion, string> = {
  IDLE: "日常轻呼吸",
  CLOUD_FLOAT: "云端漂浮",
  UNDERWATER_SWIM: "海底游动",
  PETAL_SWAY: "花瓣轻摆",
  STARGAZE: "星空呼吸",
  ZERO_GRAVITY: "月球失重",
  SPORT_BOUNCE: "球场弹跳",
  ADVENTURE_MARCH: "探险踏步",
};
const PET_LABELS: Array<{ type: PetType; name: string }> = [
  { type: "DOUYA", name: "豆芽" },
  { type: "PAOPAO", name: "泡泡" },
  { type: "TUANTUAN", name: "团团" },
  { type: "MILU", name: "米露" },
  { type: "SHANSHAN", name: "闪闪" },
];

const EMPTY_DESTINATION: Omit<PetDestination, "id" | "createdAt" | "updatedAt"> = {
  slug: "", name: "", city: "", country: "中国", tier: "CHINA",
  introduction: "", funFact: "", imageUrl: "", audioUrl: null,
  weight: 100, sortOrder: 0, isEnabled: true,
};

function NumberField({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (value: number) => void; min?: number }) {
  return <label>{label}<EditableNumberField type="number" min={min} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function PetGrowthManagement() {
  const [config, setConfig] = useState<PetGrowthConfig | null>(null);
  const [destinations, setDestinations] = useState<PetDestination[]>([]);
  const [roomThemes, setRoomThemes] = useState<PetRoomTheme[]>([]);
  const [themePage, setThemePage] = useState(1);
  const [destinationPage, setDestinationPage] = useState(1);
  const [draft, setDraft] = useState(EMPTY_DESTINATION);
  const [themeName, setThemeName] = useState("");
  const [themeDescription, setThemeDescription] = useState("");
  const [themePrice, setThemePrice] = useState("10");
  const [themeMotion, setThemeMotion] = useState<PetRoomMascotMotion>("IDLE");
  const [themeImage, setThemeImage] = useState<File | null>(null);
  const [themePreview, setThemePreview] = useState("");
  const [themeDimensions, setThemeDimensions] = useState<{ width: number; height: number } | null>(null);
  const [expandedAnimationThemeId, setExpandedAnimationThemeId] = useState<string | null>(null);
  const themeFileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [themePageSize, setThemePageSize] = useState(6);
  const [destinationPageSize, setDestinationPageSize] = useState(8);
  const visibleThemes = roomThemes.slice((themePage - 1) * themePageSize, themePage * themePageSize);
  const visibleDestinations = destinations.slice((destinationPage - 1) * destinationPageSize, destinationPage * destinationPageSize);

  async function load() {
    setBusy(true); setMessage("");
    try { const result = await adminApi.petGrowth(); setConfig(result.config); setDestinations(result.destinations); setRoomThemes(result.roomThemes); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "星宠成长配置读取失败"); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!themeImage) {
      setThemePreview("");
      setThemeDimensions(null);
      return;
    }
    const objectUrl = URL.createObjectURL(themeImage);
    setThemePreview(objectUrl);
    const image = new Image();
    image.onload = () => setThemeDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => setThemeDimensions(null);
    image.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [themeImage]);

  async function saveConfig(event: FormEvent) {
    event.preventDefault(); if (!config) return;
    setBusy(true); setMessage("");
    try {
      const { id: _id, updatedAt: _updatedAt, ...data } = config;
      setConfig((await adminApi.updatePetGrowthConfig(data)).config);
      setMessage("星宠成长规则已保存");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "配置保存失败"); }
    finally { setBusy(false); }
  }

  async function createDestination(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await adminApi.createPetDestination(draft);
      setDestinations((items) => [...items, result.destination]);
      setDraft(EMPTY_DESTINATION);
      setMessage("新景点已加入旅行库");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "景点创建失败"); }
    finally { setBusy(false); }
  }

  async function createRoomTheme(event: FormEvent) {
    event.preventDefault();
    if (!themeImage) return;
    setBusy(true); setMessage("");
    try {
      const result = await adminApi.createPetRoomTheme({
        name: themeName.trim(),
        description: themeDescription.trim(),
        priceStars: Math.max(0, Math.min(10000, Math.round(Number(themePrice)))),
        mascotMotion: themeMotion,
        image: themeImage,
      });
      setRoomThemes((items) => [...items, result.theme]);
      setThemeName(""); setThemeDescription(""); setThemePrice("10"); setThemeMotion("IDLE"); setThemeImage(null);
      if (themeFileInput.current) themeFileInput.current.value = "";
      const sourceSize = `${result.processing.source.width}×${result.processing.source.height}`;
      const outputSize = `${Math.max(1, Math.round(result.processing.outputBytes / 1024))}KB`;
      setMessage(`“${result.theme.name}”已加入平台背景库。原图 ${sourceSize}，四份 WebP 共 ${outputSize}`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "小屋背景上传失败"); }
    finally { setBusy(false); }
  }

  async function saveRoomThemeMotion(theme: PetRoomTheme, mascotMotion: PetRoomMascotMotion) {
    const previousMotion = theme.mascotMotion;
    setRoomThemes((items) => items.map((item) => item.id === theme.id ? { ...item, mascotMotion } : item));
    setBusy(true); setMessage("");
    try {
      const updated = (await adminApi.updatePetRoomThemeMotion(theme.id, mascotMotion)).theme;
      setRoomThemes((items) => items.map((item) => item.id === updated.id ? updated : item));
      setMessage(`“${updated.name}”的星宠动作已设为${ROOM_MOTION_LABEL[updated.mascotMotion]}`);
    } catch (reason) {
      setRoomThemes((items) => items.map((item) => item.id === theme.id ? { ...item, mascotMotion: previousMotion } : item));
      setMessage(reason instanceof Error ? reason.message : "小屋星宠动作保存失败");
    } finally { setBusy(false); }
  }

  function replaceThemeAnimation(themeId: string, animation: PetRoomThemeMascotAnimation) {
    setRoomThemes((items) => items.map((item) => item.id === themeId
      ? { ...item, mascotAnimations: [...item.mascotAnimations.filter((entry) => entry.petType !== animation.petType), animation] }
      : item));
  }

  async function uploadThemeAnimation(theme: PetRoomTheme, petType: PetType, file: File) {
    setBusy(true); setMessage("");
    try {
      const result = await adminApi.uploadPetRoomThemeMascotAnimation(theme.id, petType, file);
      replaceThemeAnimation(theme.id, result.animation);
      const petName = PET_LABELS.find((pet) => pet.type === petType)?.name ?? petType;
      setMessage(`“${theme.name}”的${petName}动画已上传：${result.processing.source.frameCount} 帧，原文件 ${Math.max(1, Math.round(result.processing.outputBytes / 1024))}KB，未转码`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "星宠动画上传失败");
    } finally { setBusy(false); }
  }

  async function removeThemeAnimation(theme: PetRoomTheme, petType: PetType) {
    const petName = PET_LABELS.find((pet) => pet.type === petType)?.name ?? petType;
    if (!window.confirm(`确认移除“${theme.name}”的${petName}专属动画吗？`)) return;
    setBusy(true); setMessage("");
    try {
      await adminApi.deletePetRoomThemeMascotAnimation(theme.id, petType);
      setRoomThemes((items) => items.map((item) => item.id === theme.id
        ? { ...item, mascotAnimations: item.mascotAnimations.filter((entry) => entry.petType !== petType) }
        : item));
      setMessage(`“${theme.name}”的${petName}动画已移除，将使用动作预设`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "星宠动画移除失败");
    } finally { setBusy(false); }
  }

  async function saveDestination(item: PetDestination) {
    setBusy(true); setMessage("");
    try {
      const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = item;
      const updated = (await adminApi.updatePetDestination(id, data)).destination;
      setDestinations((items) => items.map((entry) => entry.id === updated.id ? updated : entry));
      setMessage(`“${updated.name}”已保存`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "景点保存失败"); }
    finally { setBusy(false); }
  }

  function patchDestination(id: string, data: Partial<PetDestination>) {
    setDestinations((items) => items.map((entry) => entry.id === id ? { ...entry, ...data } : entry));
  }

  return <div className="admin-stack pet-admin">
    {message ? <div className="admin-notice">{message}</div> : null}
    <section className="admin-panel">
      <header className="admin-panel__header"><div><h2>星宠成长规则</h2><p>统一控制喂养、状态衰减和三类旅行</p></div></header>
      {config ? <form className="pet-config-form" onSubmit={saveConfig}>
        <fieldset><legend>小屋</legend><NumberField label="购买背景成长经验" value={config.roomThemeExperience} onChange={(value) => setConfig({ ...config, roomThemeExperience: value })} /></fieldset>
        <fieldset><legend>喂养</legend><NumberField label="点心价格" value={config.feedCostStars} onChange={(value) => setConfig({ ...config, feedCostStars: value })} /><NumberField label="恢复饱食" value={config.feedRestore} onChange={(value) => setConfig({ ...config, feedRestore: value })} min={1} /><NumberField label="成长经验" value={config.feedExperience} onChange={(value) => setConfig({ ...config, feedExperience: value })} /><NumberField label="饮水价格" value={config.drinkCostStars} onChange={(value) => setConfig({ ...config, drinkCostStars: value })} /><NumberField label="恢复饮水" value={config.drinkRestore} onChange={(value) => setConfig({ ...config, drinkRestore: value })} min={1} /><NumberField label="饮水经验" value={config.drinkExperience} onChange={(value) => setConfig({ ...config, drinkExperience: value })} /></fieldset>
        <fieldset><legend>状态变化</legend><NumberField label="饱食每点间隔（分钟）" value={config.satietyDecayMinutes} onChange={(value) => setConfig({ ...config, satietyDecayMinutes: value })} min={10} /><NumberField label="饮水每点间隔（分钟）" value={config.hydrationDecayMinutes} onChange={(value) => setConfig({ ...config, hydrationDecayMinutes: value })} min={10} /></fieldset>
        <fieldset><legend>附近旅行</legend><NumberField label="旅费" value={config.nearbyCostStars} onChange={(value) => setConfig({ ...config, nearbyCostStars: value })} /><NumberField label="时长（分钟）" value={config.nearbyDurationMinutes} onChange={(value) => setConfig({ ...config, nearbyDurationMinutes: value })} min={1} /><NumberField label="出发成长经验" value={config.nearbyExperience} onChange={(value) => setConfig({ ...config, nearbyExperience: value })} /></fieldset>
        <fieldset><legend>中国旅行</legend><NumberField label="旅费" value={config.chinaCostStars} onChange={(value) => setConfig({ ...config, chinaCostStars: value })} /><NumberField label="时长（分钟）" value={config.chinaDurationMinutes} onChange={(value) => setConfig({ ...config, chinaDurationMinutes: value })} min={1} /><NumberField label="出发成长经验" value={config.chinaExperience} onChange={(value) => setConfig({ ...config, chinaExperience: value })} /></fieldset>
        <fieldset><legend>世界旅行</legend><NumberField label="旅费" value={config.worldCostStars} onChange={(value) => setConfig({ ...config, worldCostStars: value })} /><NumberField label="时长（分钟）" value={config.worldDurationMinutes} onChange={(value) => setConfig({ ...config, worldDurationMinutes: value })} min={1} /><NumberField label="出发成长经验" value={config.worldExperience} onChange={(value) => setConfig({ ...config, worldExperience: value })} /></fieldset>
        <div className="form-actions"><button className="primary-button" disabled={busy}>{busy ? "保存中…" : "保存成长规则"}</button></div>
      </form> : <div className="empty-state">正在读取成长规则…</div>}
    </section>

    <section className="admin-panel super-room-theme-panel">
      <header className="admin-panel__header"><div><h2>小屋背景与专属动画（{roomThemes.length}）</h2><p>在每个小屋的“配置专属动画”中，为五只星宠分别上传与场景匹配的动画</p></div></header>
      <form className="super-room-theme-upload" onSubmit={createRoomTheme}>
        <div className="super-room-theme-upload__requirements">
          <strong>建议原图尺寸</strong>
          <b>1920 × 1200 px</b>
          <span>16:10 横图，至少达到该尺寸，最大 30MB</span>
          <small>支持 PNG、JPEG、WebP、AVIF、TIFF。上传后自动生成横屏、iPad、手机和预览图，并统一压缩为 WebP。</small>
        </div>
        <div className="super-room-theme-upload__fields">
          <label>背景名称<input required maxLength={40} value={themeName} onChange={(event) => setThemeName(event.target.value)} placeholder="例如：彩虹游戏屋" /></label>
          <label>平台默认价格<EditableNumberField required type="number" min={0} max={10000} value={themePrice} onChange={(event) => setThemePrice(event.target.value)} /></label>
          <label>星宠专属动作<select value={themeMotion} onChange={(event) => setThemeMotion(event.target.value as PetRoomMascotMotion)}>{Object.entries(ROOM_MOTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field-span">儿童介绍<textarea required minLength={2} maxLength={160} rows={3} value={themeDescription} onChange={(event) => setThemeDescription(event.target.value)} /></label>
          <label className="field-span">背景原图<input ref={themeFileInput} required type="file" accept=".png,.jpg,.jpeg,.webp,.avif,.tif,.tiff,image/png,image/jpeg,image/webp,image/avif,image/tiff" onChange={(event) => setThemeImage(event.target.files?.[0] ?? null)} /></label>
        </div>
        {themeImage ? <div className="super-room-theme-upload__preview">
          {themePreview ? <img src={themePreview} alt="待上传背景预览" /> : null}
          <div><strong>{themeImage.name}</strong><span>{themeDimensions ? `${themeDimensions.width}×${themeDimensions.height}px · ` : ""}{(themeImage.size / 1024 / 1024).toFixed(2)}MB</span><small>上传后自动转换，不保留原始大文件。</small></div>
        </div> : null}
        <div className="form-actions field-span"><button className="primary-button" disabled={busy || !themeImage || !themeName.trim() || !themeDescription.trim()}>{busy ? "正在处理…" : "新增平台小屋背景"}</button></div>
      </form>
      {roomThemes.length ? <div className="super-room-theme-list">{visibleThemes.map((theme) => {
        const isExpanded = expandedAnimationThemeId === theme.id;
        return <article className={isExpanded ? "is-animation-expanded" : ""} key={theme.id}>
          <img className="super-room-theme-list__background" src={theme.previewUrl} alt="" loading="lazy" />
          <div className="super-room-theme-list__summary"><strong>{theme.name}</strong><span>默认 {theme.priceStars} 星 · 已上传 {theme.mascotAnimations.length}/5</span></div>
          <label className="super-room-theme-list__motion">动作预设<select disabled={busy} value={theme.mascotMotion} onChange={(event) => void saveRoomThemeMotion(theme, event.target.value as PetRoomMascotMotion)}>{Object.entries(ROOM_MOTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="super-room-theme-list__toggle" type="button" aria-expanded={isExpanded} onClick={() => setExpandedAnimationThemeId(isExpanded ? null : theme.id)}>{isExpanded ? "收起动画配置" : "配置专属动画"}</button>
          {isExpanded ? <div className="super-room-animation-panel">
            <div className="super-room-animation-panel__notice"><strong>动画文件规范</strong><span>建议透明背景、单帧 720×720px；支持 GIF、动态 WebP、APNG/PNG，最大 15MB、180 帧、20 秒。系统只做安全校验，保留原文件、原格式、原画质和原播放节奏。</span></div>
            <div className="super-room-animation-grid">{PET_LABELS.map((pet) => {
              const animation = theme.mascotAnimations.find((entry) => entry.petType === pet.type);
              return <section className="super-room-animation-card" key={pet.type}>
                <div className="super-room-animation-card__preview">{animation ? <img src={animation.mediaUrl} alt={`${theme.name}${pet.name}动画`} loading="lazy" /> : <span>未上传</span>}</div>
                <div><strong>{pet.name}</strong><small>{animation ? `${animation.frameCount} 帧 · ${Math.max(1, Math.round(animation.outputBytes / 1024))}KB` : "使用动作预设兜底"}</small></div>
                <label className="super-room-animation-card__upload"><span>{animation ? "替换" : "上传"}</span><input disabled={busy} type="file" accept=".gif,.webp,.png,image/gif,image/webp,image/png" onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; if (file) void uploadThemeAnimation(theme, pet.type, file).finally(() => { input.value = ""; }); }} /></label>
                {animation ? <button className="super-room-animation-card__remove" type="button" disabled={busy} onClick={() => void removeThemeAnimation(theme, pet.type)}>移除</button> : null}
              </section>;
            })}</div>
          </div> : null}
        </article>;
      })}</div> : null}
      <Pagination className="admin-pagination" current={themePage} pageSize={themePageSize} total={roomThemes.length} showSizeChanger pageSizeOptions={[6, 12, 24, 48]} showTotal={(value) => `共 ${value} 个小屋背景`} onShowSizeChange={(_, size) => { setThemePage(1); setThemePageSize(size); }} onChange={setThemePage} />
    </section>

    <section className="admin-panel">
      <header className="admin-panel__header"><div><h2>旅行景点（{destinations.length}）</h2><p>已有 MiniMax 朗读 {destinations.filter((item) => item.audioUrl).length}/{destinations.length} · 孩子选择旅费档位后优先抽取未去过的地方</p></div></header>
      <div className="pet-destination-grid">{visibleDestinations.map((item) => <article key={item.id} className="pet-destination-card">
        <img src={item.imageUrl} alt={item.name} loading="lazy" />
        <div className="pet-destination-card__fields"><label>景点<input value={item.name} onChange={(event) => patchDestination(item.id, { name: event.target.value })} /></label><label>路线<select value={item.tier} onChange={(event) => patchDestination(item.id, { tier: event.target.value as PetTravelTier })}>{Object.entries(TIER_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>城市<input value={item.city} onChange={(event) => patchDestination(item.id, { city: event.target.value })} /></label><label>国家<input value={item.country} onChange={(event) => patchDestination(item.id, { country: event.target.value })} /></label><label className="field-span">介绍<textarea value={item.introduction} onChange={(event) => patchDestination(item.id, { introduction: event.target.value })} /></label><label className="field-span">小知识<textarea value={item.funFact} onChange={(event) => patchDestination(item.id, { funFact: event.target.value })} /></label><label className="field-span">图片地址<input value={item.imageUrl} onChange={(event) => patchDestination(item.id, { imageUrl: event.target.value })} /></label><label className="field-span">预录音频地址<input value={item.audioUrl ?? ""} onChange={(event) => patchDestination(item.id, { audioUrl: event.target.value || null })} /></label>{item.audioUrl ? <audio className="field-span pet-destination-audio" controls preload="none" src={item.audioUrl}>浏览器不支持音频播放</audio> : <div className="field-span pet-destination-audio--missing">等待部署时由 MiniMax 自动生成朗读</div>}<label>权重<EditableNumberField type="number" min={1} value={item.weight} onChange={(event) => patchDestination(item.id, { weight: Number(event.target.value) })} /></label><label className="checkbox"><input type="checkbox" checked={item.isEnabled} onChange={(event) => patchDestination(item.id, { isEnabled: event.target.checked })} />启用</label></div>
        <button className="primary-button" disabled={busy} onClick={() => void saveDestination(item)}>保存景点</button>
      </article>)}</div>
      <Pagination className="admin-pagination" current={destinationPage} pageSize={destinationPageSize} total={destinations.length} showSizeChanger pageSizeOptions={[8, 16, 32, 64]} showTotal={(value) => `共 ${value} 个旅行景点`} onShowSizeChange={(_, size) => { setDestinationPage(1); setDestinationPageSize(size); }} onChange={setDestinationPage} />
    </section>

    <section className="admin-panel">
      <header className="admin-panel__header"><h2>新增旅行景点</h2></header>
      <form className="admin-form" onSubmit={createDestination}><label>唯一标识<input required value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} placeholder="例如 temple-of-heaven" /></label><label>景点名称<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>城市<input required value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></label><label>国家<input required value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value })} /></label><label>路线<select value={draft.tier} onChange={(event) => setDraft({ ...draft, tier: event.target.value as PetTravelTier })}>{Object.entries(TIER_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>图片地址<input required value={draft.imageUrl} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} /></label><label className="field-span">儿童介绍<textarea required value={draft.introduction} onChange={(event) => setDraft({ ...draft, introduction: event.target.value })} /></label><label className="field-span">有趣的小知识<textarea required value={draft.funFact} onChange={(event) => setDraft({ ...draft, funFact: event.target.value })} /></label><div className="form-actions field-span"><button className="primary-button" disabled={busy}>加入景点库</button></div></form>
    </section>
  </div>;
}
