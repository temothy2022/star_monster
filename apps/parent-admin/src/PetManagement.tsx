import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { parentApi, type Child, type PetGrowthSummary } from "./api";
import { NumberField } from "./NumberField";

const PET_LABELS: Record<string, string> = {
  DOUYA: "豆芽",
  PAOPAO: "泡泡",
  TUANTUAN: "团团",
  MILU: "米露",
  SHANSHAN: "闪闪",
};

const GROWTH_STAGE_LABELS = {
  BABY: "幼年伙伴",
  GROWING: "成长伙伴",
  MATURE: "成熟伙伴",
} as const;

function PetSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="admin-panel growth-section pet-management-section">
      <header className="growth-section__header">
        <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
      </header>
      {children}
    </section>
  );
}

export function PetManagement({ child, onChanged }: { child: Child; onChanged: () => void }) {
  const [data, setData] = useState<PetGrowthSummary | null>(null);
  const [petType, setPetType] = useState(child.petType ?? "TUANTUAN");
  const [travelEnabled, setTravelEnabled] = useState(true);
  const [dailyLimit, setDailyLimit] = useState("");
  const [satiety, setSatiety] = useState(0);
  const [hydration, setHydration] = useState(0);
  const [satietyDecayMinutes, setSatietyDecayMinutes] = useState(120);
  const [hydrationDecayMinutes, setHydrationDecayMinutes] = useState(90);
  const [dailyWasteCount, setDailyWasteCount] = useState(2);
  const [wasteCleanCostStars, setWasteCleanCostStars] = useState(1);
  const [redPacketsPerLevel, setRedPacketsPerLevel] = useState(1);
  const [redPacketMinStars, setRedPacketMinStars] = useState(1);
  const [redPacketMaxStars, setRedPacketMaxStars] = useState(5);
  const [redPacketGrantCount, setRedPacketGrantCount] = useState(1);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [workspace, setWorkspace] = useState<"care" | "red-packets" | "themes">("care");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const result = await parentApi.petGrowth(child.id);
      setData(result);
      setPetType(result.pet.petType);
      setTravelEnabled(result.travelEnabled);
      setDailyLimit(result.wallet.dailySpendLimitStars === null ? "" : String(result.wallet.dailySpendLimitStars));
      setSatiety(result.pet.satiety);
      setHydration(result.pet.hydration);
      setSatietyDecayMinutes(result.statusDecay.satietyMinutes);
      setHydrationDecayMinutes(result.statusDecay.hydrationMinutes);
      setDailyWasteCount(result.waste.dailyCount);
      setWasteCleanCostStars(result.waste.cleanCostStars);
      setRedPacketsPerLevel(result.redPackets.packetsPerLevel);
      setRedPacketMinStars(result.redPackets.minStars);
      setRedPacketMaxStars(result.redPackets.maxStars);
      setPrices(Object.fromEntries(result.roomThemes.map((theme) => [theme.key, theme.priceStars])));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "星宠状态读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void parentApi.petGrowth(child.id).then((result) => {
      if (cancelled) return;
      setData(result);
      setPetType(result.pet.petType);
      setTravelEnabled(result.travelEnabled);
      setDailyLimit(result.wallet.dailySpendLimitStars === null ? "" : String(result.wallet.dailySpendLimitStars));
      setSatiety(result.pet.satiety);
      setHydration(result.pet.hydration);
      setSatietyDecayMinutes(result.statusDecay.satietyMinutes);
      setHydrationDecayMinutes(result.statusDecay.hydrationMinutes);
      setDailyWasteCount(result.waste.dailyCount);
      setWasteCleanCostStars(result.waste.cleanCostStars);
      setRedPacketsPerLevel(result.redPackets.packetsPerLevel);
      setRedPacketMinStars(result.redPackets.minStars);
      setRedPacketMaxStars(result.redPackets.maxStars);
      setPrices(Object.fromEntries(result.roomThemes.map((theme) => [theme.key, theme.priceStars])));
    }).catch((reason) => {
      if (!cancelled) setMessage(reason instanceof Error ? reason.message : "星宠状态读取失败");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [child.id]);

  async function savePetSettings(event: FormEvent) {
    event.preventDefault();
    if (redPacketMaxStars < redPacketMinStars) {
      setMessage("红包最高奖励不能少于最低奖励");
      return;
    }
    setBusy("settings");
    setMessage("");
    try {
      await parentApi.updateChild(child.id, { petType });
      await parentApi.updatePetGrowthSettings(child.id, {
        travelEnabled,
        dailySpendLimitStars: dailyLimit.trim() ? Number(dailyLimit) : null,
        satiety: Math.max(0, Math.min(100, Math.round(satiety))),
        hydration: Math.max(0, Math.min(100, Math.round(hydration))),
        satietyDecayMinutes: Math.max(10, Math.min(10080, Math.round(satietyDecayMinutes))),
        hydrationDecayMinutes: Math.max(10, Math.min(10080, Math.round(hydrationDecayMinutes))),
        dailyWasteCount: Math.max(0, Math.min(8, Math.round(dailyWasteCount))),
        wasteCleanCostStars: Math.max(0, Math.min(100, Math.round(wasteCleanCostStars))),
        redPacketsPerLevel: Math.max(0, Math.min(10, Math.round(redPacketsPerLevel))),
        redPacketMinStars: Math.max(1, Math.min(100, Math.round(redPacketMinStars))),
        redPacketMaxStars: Math.max(1, Math.min(100, Math.round(redPacketMaxStars))),
      });
      setMessage("星宠设置已保存");
      onChanged();
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "星宠设置保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function saveThemePrices() {
    setBusy("themes");
    setMessage("");
    try {
      await parentApi.updatePetRoomThemes(data?.roomThemes.map((theme) => ({
        key: theme.key,
        priceStars: Math.max(0, Math.min(10000, Math.round(prices[theme.key] ?? theme.priceStars))),
      })) ?? []);
      setMessage("小屋背景价格已统一保存");
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "背景价格保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function grantRedPackets() {
    const count = Math.max(1, Math.min(50, Math.round(redPacketGrantCount)));
    setRedPacketGrantCount(count);
    setBusy("red-packet-grant");
    setMessage("");
    try {
      const result = await parentApi.grantPetRedPackets(child.id, count);
      await load();
      setMessage(`已补发 ${result.grantedCount} 个红包，当前待领取 ${result.availableCount} 个`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "红包补发失败");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return <div className="admin-stack"><PetSection title="星宠管理" subtitle="查看星宠成长、照顾和小屋设置"><div className="empty-state">正在读取星宠资料…</div></PetSection></div>;
  }

  return (
    <div className="admin-stack pet-management">
      <div className="workspace-tabs" role="tablist" aria-label="星宠管理功能">
        <button type="button" role="tab" aria-selected={workspace === "care"} className={workspace === "care" ? "active" : ""} onClick={() => setWorkspace("care")}>伙伴与照顾</button>
        <button type="button" role="tab" aria-selected={workspace === "red-packets"} className={workspace === "red-packets" ? "active" : ""} onClick={() => setWorkspace("red-packets")}>升级红包</button>
        <button type="button" role="tab" aria-selected={workspace === "themes"} className={workspace === "themes" ? "active" : ""} onClick={() => setWorkspace("themes")}>小屋背景</button>
      </div>
      {workspace !== "themes" ? <PetSection title={workspace === "care" ? "伙伴与照顾" : "升级红包"} subtitle={workspace === "care" ? "管理伙伴、消费限制与日常照顾规则" : "设置升级奖励，并在需要时补发红包"}>
        {data ? <>
          <div className="parent-pet-overview">
            <div className="parent-pet-overview__level"><span>Lv.{data.pet.level}</span><div><strong>{GROWTH_STAGE_LABELS[data.pet.growthStage]}</strong><small>{data.postcards.length} 张旅行明信片</small></div></div>
            <div className="parent-pet-overview__meter"><span>饱食度</span><i><b style={{ width: `${data.pet.satiety}%` }} /></i><strong>{data.pet.satiety}</strong></div>
            <div className="parent-pet-overview__meter parent-pet-overview__meter--water"><span>饮水状态</span><i><b style={{ width: `${data.pet.hydration}%` }} /></i><strong>{data.pet.hydration}</strong></div>
            <div className="parent-pet-overview__trip"><span>{data.currentTrip ? data.currentTrip.status === "TRAVELING" ? "旅行中" : "旅行归来" : "当前在家"}</span><strong>{data.currentTrip?.destinationName ?? `待领取 ${data.redPackets.availableCount} 个红包`}</strong></div>
          </div>
          <form className="parent-pet-settings-form" onSubmit={savePetSettings}>
            {workspace === "care" ? <>
              <label>当前星宠<select value={petType} onChange={(event) => setPetType(event.target.value)}>{Object.entries(PET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="checkbox"><input type="checkbox" checked={travelEnabled} onChange={(event) => setTravelEnabled(event.target.checked)} />允许星宠旅行</label>
              <label>每日星宠消费上限<NumberField type="number" min={0} max={10000} value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} placeholder="不限制" /></label>
              <label>饱食度<NumberField type="number" min={0} max={100} value={satiety} onChange={(event) => setSatiety(Number(event.target.value))} /></label>
              <label>饮水状态<NumberField type="number" min={0} max={100} value={hydration} onChange={(event) => setHydration(Number(event.target.value))} /></label>
              <div className="parent-pet-care-rules">
              <div><strong>日常照顾规则</strong><small>衰减数值表示每隔多少分钟下降 1 点，数值越小消耗越快。当天排泄计划生成后，次数调整从次日生效。</small></div>
              <label>饱食度衰减<NumberField type="number" min={10} max={10080} value={satietyDecayMinutes} onChange={(event) => setSatietyDecayMinutes(Number(event.target.value))} /><span>分钟 / 点</span></label>
              <label>饮水状态衰减<NumberField type="number" min={10} max={10080} value={hydrationDecayMinutes} onChange={(event) => setHydrationDecayMinutes(Number(event.target.value))} /><span>分钟 / 点</span></label>
              <label>每日出现粑粑<NumberField type="number" min={0} max={8} value={dailyWasteCount} onChange={(event) => setDailyWasteCount(Number(event.target.value))} /><span>次</span></label>
              <label>每次清理消耗<NumberField type="number" min={0} max={100} value={wasteCleanCostStars} onChange={(event) => setWasteCleanCostStars(Number(event.target.value))} /><span>星</span></label>
              </div>
            </> : null}
            {workspace === "red-packets" ? <div className="parent-pet-red-packet-settings">
              <div><strong>星宠升级红包</strong><small>配置只影响之后升级获得的新红包</small></div>
              <label>每次升级赠送<NumberField type="number" min={0} max={10} value={redPacketsPerLevel} onChange={(event) => setRedPacketsPerLevel(Number(event.target.value))} /><span>个</span></label>
              <label>最低奖励<NumberField type="number" min={1} max={100} value={redPacketMinStars} onChange={(event) => setRedPacketMinStars(Number(event.target.value))} /><span>星</span></label>
              <label>最高奖励<NumberField type="number" min={1} max={100} value={redPacketMaxStars} onChange={(event) => setRedPacketMaxStars(Number(event.target.value))} /><span>星</span></label>
              <div className="parent-pet-red-packet-grant">
                <label>额外补发<NumberField type="number" min={1} max={50} value={redPacketGrantCount} onChange={(event) => setRedPacketGrantCount(Number(event.target.value))} /><span>个</span></label>
                <button className="primary-button" type="button" disabled={busy !== null} onClick={() => void grantRedPackets()}>{busy === "red-packet-grant" ? "补发中…" : "立即补发"}</button>
                <small>按当前奖励范围生成，孩子打开后才获得星星</small>
              </div>
            </div> : null}
            <button className="primary-button" type="submit" disabled={busy !== null}>{busy === "settings" ? "保存中…" : workspace === "care" ? "保存照顾设置" : "保存红包设置"}</button>
          </form>
        </> : <div className="empty-state">{message || "暂时没有星宠资料"}</div>}
      </PetSection> : null}

      {workspace === "themes" ? <PetSection title="小屋背景价格" subtitle="设置当前家庭解锁各背景所需的星星；平台背景素材由超级后台维护。">
        {data?.roomThemes.length ? <div className="pet-room-theme-admin-grid">
          {data.roomThemes.map((theme) => (
            <article className="pet-room-theme-admin-card" key={theme.key}>
              <img src={theme.previewUrl} alt={`${theme.name}预览`} loading="lazy" />
              <div className="pet-room-theme-admin-card__body">
                <strong>{theme.name}</strong>
                <label>解锁价格<NumberField type="number" min={0} max={10000} value={prices[theme.key] ?? theme.priceStars} onChange={(event) => setPrices((current) => ({ ...current, [theme.key]: Number(event.target.value) }))} /><em>星</em></label>
              </div>
            </article>
          ))}
        </div> : <div className="empty-state">暂无可配置的小屋背景</div>}
        {data?.roomThemes.length ? <div className="form-actions pet-room-theme-admin-actions"><button className="primary-button" type="button" disabled={busy !== null} onClick={() => void saveThemePrices()}>{busy === "themes" ? "保存中…" : "保存全部背景价格"}</button></div> : null}
      </PetSection> : null}
      {message ? <div className="admin-notice">{message}</div> : null}
    </div>
  );
}
