import { useEffect, useState, type FormEvent } from "react";
import { adminApi, type PetDestination, type PetGrowthConfig, type PetTravelTier } from "./api";

const TIER_LABEL: Record<PetTravelTier, string> = { NEARBY: "附近", CHINA: "中国", WORLD: "世界" };

const EMPTY_DESTINATION: Omit<PetDestination, "id" | "createdAt" | "updatedAt"> = {
  slug: "", name: "", city: "", country: "中国", tier: "CHINA",
  introduction: "", funFact: "", imageUrl: "", audioUrl: null,
  weight: 100, sortOrder: 0, isEnabled: true,
};

function NumberField({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (value: number) => void; min?: number }) {
  return <label>{label}<input type="number" min={min} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function PetGrowthManagement() {
  const [config, setConfig] = useState<PetGrowthConfig | null>(null);
  const [destinations, setDestinations] = useState<PetDestination[]>([]);
  const [draft, setDraft] = useState(EMPTY_DESTINATION);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setBusy(true); setMessage("");
    try { const result = await adminApi.petGrowth(); setConfig(result.config); setDestinations(result.destinations); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "星宠成长配置读取失败"); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);

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
        <fieldset><legend>喂养</legend><NumberField label="点心价格" value={config.feedCostStars} onChange={(value) => setConfig({ ...config, feedCostStars: value })} /><NumberField label="恢复饱食" value={config.feedRestore} onChange={(value) => setConfig({ ...config, feedRestore: value })} min={1} /><NumberField label="成长经验" value={config.feedExperience} onChange={(value) => setConfig({ ...config, feedExperience: value })} /><NumberField label="饮水价格" value={config.drinkCostStars} onChange={(value) => setConfig({ ...config, drinkCostStars: value })} /><NumberField label="恢复饮水" value={config.drinkRestore} onChange={(value) => setConfig({ ...config, drinkRestore: value })} min={1} /><NumberField label="饮水经验" value={config.drinkExperience} onChange={(value) => setConfig({ ...config, drinkExperience: value })} /></fieldset>
        <fieldset><legend>状态变化</legend><NumberField label="饱食每点间隔（分钟）" value={config.satietyDecayMinutes} onChange={(value) => setConfig({ ...config, satietyDecayMinutes: value })} min={10} /><NumberField label="饮水每点间隔（分钟）" value={config.hydrationDecayMinutes} onChange={(value) => setConfig({ ...config, hydrationDecayMinutes: value })} min={10} /></fieldset>
        <fieldset><legend>附近旅行</legend><NumberField label="旅费" value={config.nearbyCostStars} onChange={(value) => setConfig({ ...config, nearbyCostStars: value })} /><NumberField label="时长（分钟）" value={config.nearbyDurationMinutes} onChange={(value) => setConfig({ ...config, nearbyDurationMinutes: value })} min={1} /><NumberField label="归来经验" value={config.nearbyExperience} onChange={(value) => setConfig({ ...config, nearbyExperience: value })} /></fieldset>
        <fieldset><legend>中国旅行</legend><NumberField label="旅费" value={config.chinaCostStars} onChange={(value) => setConfig({ ...config, chinaCostStars: value })} /><NumberField label="时长（分钟）" value={config.chinaDurationMinutes} onChange={(value) => setConfig({ ...config, chinaDurationMinutes: value })} min={1} /><NumberField label="归来经验" value={config.chinaExperience} onChange={(value) => setConfig({ ...config, chinaExperience: value })} /></fieldset>
        <fieldset><legend>世界旅行</legend><NumberField label="旅费" value={config.worldCostStars} onChange={(value) => setConfig({ ...config, worldCostStars: value })} /><NumberField label="时长（分钟）" value={config.worldDurationMinutes} onChange={(value) => setConfig({ ...config, worldDurationMinutes: value })} min={1} /><NumberField label="归来经验" value={config.worldExperience} onChange={(value) => setConfig({ ...config, worldExperience: value })} /></fieldset>
        <div className="form-actions"><button className="primary-button" disabled={busy}>{busy ? "保存中…" : "保存成长规则"}</button></div>
      </form> : <div className="empty-state">正在读取成长规则…</div>}
    </section>

    <section className="admin-panel">
      <header className="admin-panel__header"><div><h2>旅行景点（{destinations.length}）</h2><p>已有 MiniMax 朗读 {destinations.filter((item) => item.audioUrl).length}/{destinations.length} · 孩子选择旅费档位后优先抽取未去过的地方</p></div></header>
      <div className="pet-destination-grid">{destinations.map((item) => <article key={item.id} className="pet-destination-card">
        <img src={item.imageUrl} alt={item.name} loading="lazy" />
        <div className="pet-destination-card__fields"><label>景点<input value={item.name} onChange={(event) => patchDestination(item.id, { name: event.target.value })} /></label><label>路线<select value={item.tier} onChange={(event) => patchDestination(item.id, { tier: event.target.value as PetTravelTier })}>{Object.entries(TIER_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>城市<input value={item.city} onChange={(event) => patchDestination(item.id, { city: event.target.value })} /></label><label>国家<input value={item.country} onChange={(event) => patchDestination(item.id, { country: event.target.value })} /></label><label className="field-span">介绍<textarea value={item.introduction} onChange={(event) => patchDestination(item.id, { introduction: event.target.value })} /></label><label className="field-span">小知识<textarea value={item.funFact} onChange={(event) => patchDestination(item.id, { funFact: event.target.value })} /></label><label className="field-span">图片地址<input value={item.imageUrl} onChange={(event) => patchDestination(item.id, { imageUrl: event.target.value })} /></label><label className="field-span">预录音频地址<input value={item.audioUrl ?? ""} onChange={(event) => patchDestination(item.id, { audioUrl: event.target.value || null })} /></label>{item.audioUrl ? <audio className="field-span pet-destination-audio" controls preload="none" src={item.audioUrl}>浏览器不支持音频播放</audio> : <div className="field-span pet-destination-audio--missing">等待部署时由 MiniMax 自动生成朗读</div>}<label>权重<input type="number" min={1} value={item.weight} onChange={(event) => patchDestination(item.id, { weight: Number(event.target.value) })} /></label><label className="checkbox"><input type="checkbox" checked={item.isEnabled} onChange={(event) => patchDestination(item.id, { isEnabled: event.target.checked })} />启用</label></div>
        <button className="primary-button" disabled={busy} onClick={() => void saveDestination(item)}>保存景点</button>
      </article>)}</div>
    </section>

    <section className="admin-panel">
      <header className="admin-panel__header"><h2>新增旅行景点</h2></header>
      <form className="admin-form" onSubmit={createDestination}><label>唯一标识<input required value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} placeholder="例如 temple-of-heaven" /></label><label>景点名称<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>城市<input required value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></label><label>国家<input required value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value })} /></label><label>路线<select value={draft.tier} onChange={(event) => setDraft({ ...draft, tier: event.target.value as PetTravelTier })}>{Object.entries(TIER_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>图片地址<input required value={draft.imageUrl} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} /></label><label className="field-span">儿童介绍<textarea required value={draft.introduction} onChange={(event) => setDraft({ ...draft, introduction: event.target.value })} /></label><label className="field-span">有趣的小知识<textarea required value={draft.funFact} onChange={(event) => setDraft({ ...draft, funFact: event.target.value })} /></label><div className="form-actions field-span"><button className="primary-button" disabled={busy}>加入景点库</button></div></form>
    </section>
  </div>;
}
