import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { parentApi, type Child, type PetGrowthSummary } from "./api";

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
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

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
    setBusy("settings");
    setMessage("");
    try {
      await parentApi.updateChild(child.id, { petType });
      await parentApi.updatePetGrowthSettings(child.id, {
        travelEnabled,
        dailySpendLimitStars: dailyLimit.trim() ? Number(dailyLimit) : null,
        satiety: Math.max(0, Math.min(100, Math.round(satiety))),
        hydration: Math.max(0, Math.min(100, Math.round(hydration))),
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

  if (loading && !data) {
    return <div className="admin-stack"><PetSection title="星宠管理" subtitle="查看星宠成长、照顾和小屋设置"><div className="empty-state">正在读取星宠资料…</div></PetSection></div>;
  }

  return (
    <div className="admin-stack pet-management">
      <PetSection title="星宠管理" subtitle="统一管理星宠伙伴、照顾规则和小屋背景">
        {data ? <>
          <div className="parent-pet-overview">
            <div className="parent-pet-overview__level"><span>Lv.{data.pet.level}</span><div><strong>{GROWTH_STAGE_LABELS[data.pet.growthStage]}</strong><small>{data.postcards.length} 张旅行明信片</small></div></div>
            <div className="parent-pet-overview__meter"><span>饱食度</span><i><b style={{ width: `${data.pet.satiety}%` }} /></i><strong>{data.pet.satiety}</strong></div>
            <div className="parent-pet-overview__meter parent-pet-overview__meter--water"><span>饮水状态</span><i><b style={{ width: `${data.pet.hydration}%` }} /></i><strong>{data.pet.hydration}</strong></div>
            <div className="parent-pet-overview__trip"><span>{data.currentTrip ? data.currentTrip.status === "TRAVELING" ? "旅行中" : "旅行归来" : "当前在家"}</span><strong>{data.currentTrip?.destinationName ?? `今天已消费 ${data.wallet.dailySpent} 星`}</strong></div>
          </div>
          <form className="parent-pet-settings-form" onSubmit={savePetSettings}>
            <label>当前星宠<select value={petType} onChange={(event) => setPetType(event.target.value)}>{Object.entries(PET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="checkbox"><input type="checkbox" checked={travelEnabled} onChange={(event) => setTravelEnabled(event.target.checked)} />允许星宠旅行</label>
            <label>每日星宠消费上限<input type="number" min={0} max={10000} value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} placeholder="不限制" /></label>
            <label>饱食度<input type="number" min={0} max={100} value={satiety} onChange={(event) => setSatiety(Number(event.target.value))} /></label>
            <label>饮水状态<input type="number" min={0} max={100} value={hydration} onChange={(event) => setHydration(Number(event.target.value))} /></label>
            <button className="primary-button" type="submit" disabled={busy !== null}>{busy === "settings" ? "保存中…" : "保存星宠设置"}</button>
          </form>
        </> : <div className="empty-state">{message || "暂时没有星宠资料"}</div>}
      </PetSection>

      <PetSection title="小屋背景" subtitle="设置孩子解锁新背景时需要消费的星星。价格为 0 时免费解锁。">
        {data?.roomThemes.length ? <div className="pet-room-theme-admin-grid">
          {data.roomThemes.map((theme) => (
            <article className="pet-room-theme-admin-card" key={theme.key}>
              <img src={theme.previewUrl} alt={`${theme.name}预览`} loading="lazy" />
              <div className="pet-room-theme-admin-card__body">
                <div><strong>{theme.name}</strong><span>{theme.isEquipped ? "当前使用" : theme.isOwned ? "已解锁" : "未解锁"}</span></div>
                <p>{theme.description}</p>
                <label>解锁价格<input type="number" min={0} max={10000} value={prices[theme.key] ?? theme.priceStars} onChange={(event) => setPrices((current) => ({ ...current, [theme.key]: Number(event.target.value) }))} /><em>星</em></label>
              </div>
            </article>
          ))}
        </div> : <div className="empty-state">暂无可配置的小屋背景</div>}
        {data?.roomThemes.length ? <div className="form-actions pet-room-theme-admin-actions"><button className="primary-button" type="button" disabled={busy !== null} onClick={() => void saveThemePrices()}>{busy === "themes" ? "保存中…" : "保存全部背景价格"}</button></div> : null}
      </PetSection>
      {message ? <div className="admin-notice">{message}</div> : null}
    </div>
  );
}
