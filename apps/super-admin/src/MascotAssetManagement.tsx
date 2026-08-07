import { useEffect, useMemo, useState } from "react";
import { adminApi, type MascotAsset, type MascotAssetSlot } from "./api";

const PETS: Array<{ type: MascotAsset["petType"]; name: string }> = [
  { type: "DOUYA", name: "豆芽" },
  { type: "PAOPAO", name: "泡泡" },
  { type: "TUANTUAN", name: "团团" },
  { type: "MILU", name: "米露" },
  { type: "SHANSHAN", name: "闪闪" },
];

const SLOTS: Array<{ slot: MascotAssetSlot; label: string; description: string }> = [
  { slot: "TASK_IDLE", label: "任务页待机", description: "任务首页左下角展示" },
  { slot: "NEUTRAL", label: "普通状态", description: "通用默认展示" },
  { slot: "FOCUS", label: "专注状态", description: "任务进行中展示" },
  { slot: "CELEBRATE", label: "庆祝状态", description: "完成和奖励展示" },
  { slot: "HUNGRY", label: "饥饿状态", description: "星宠小屋状态" },
  { slot: "EATING", label: "吃点心", description: "喂点心过程中" },
  { slot: "DRINKING", label: "喝水", description: "喂水过程中" },
  { slot: "TRAVEL", label: "旅行状态", description: "旅行和明信片展示" },
  { slot: "SLEEPING", label: "睡觉状态", description: "小屋随机待机" },
];

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN") : "尚未上传";
}

export function MascotAssetManagement() {
  const [assets, setAssets] = useState<MascotAsset[]>([]);
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setMessage("");
    try {
      setAssets((await adminApi.mascotAssets()).assets);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "星宠素材读取失败");
    }
  }

  useEffect(() => { void load(); }, []);

  const assetMap = useMemo(() => {
    const map = new Map<string, MascotAsset>();
    assets.forEach((asset) => map.set(`${asset.petType}:${asset.slot}`, asset));
    return map;
  }, [assets]);

  async function upload(petType: MascotAsset["petType"], slot: MascotAssetSlot, file: File) {
    const key = `${petType}:${slot}`;
    setBusyKey(key);
    setMessage("");
    try {
      const { asset } = await adminApi.uploadMascotAsset(petType, slot, file);
      setAssets((current) => {
        const rest = current.filter((item) => !(item.petType === petType && item.slot === slot));
        return [...rest, asset];
      });
      setMessage("星宠素材已上传。孩子端刷新任务页后会使用新的素材。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "上传失败");
    } finally {
      setBusyKey("");
    }
  }

  return <div className="admin-stack mascot-assets-page">
    <section className="admin-panel">
      <header className="admin-panel__header">
        <div>
          <h2>星宠动画素材</h2>
          <p>为不同星宠和形态上传 WebP/GIF/PNG/JPEG。动画文件会原样保存，避免被压成静态图。</p>
        </div>
        <button type="button" className="ghost-button" onClick={() => void load()}>刷新</button>
      </header>
      {message ? <div className="admin-notice">{message}</div> : null}
      <div className="mascot-assets-grid">
        {PETS.map((pet) => <section className="mascot-asset-pet" key={pet.type}>
          <header><h3>{pet.name}</h3><span>{pet.type}</span></header>
          <div className="mascot-asset-slots">
            {SLOTS.map((slot) => {
              const asset = assetMap.get(`${pet.type}:${slot.slot}`);
              const key = `${pet.type}:${slot.slot}`;
              return <article className="mascot-asset-card" key={slot.slot}>
                <div className="mascot-asset-card__preview">
                  {asset ? <img src={asset.mediaUrl} alt={`${pet.name}${slot.label}`} loading="lazy" /> : <span>未上传</span>}
                </div>
                <div className="mascot-asset-card__content">
                  <strong>{slot.label}</strong>
                  <small>{slot.description}</small>
                  <em>{formatDate(asset?.updatedAt)}</em>
                </div>
                <label className="ghost-button mascot-asset-upload">
                  {busyKey === key ? "上传中…" : asset ? "替换" : "上传"}
                  <input
                    hidden
                    type="file"
                    accept="image/webp,image/gif,image/png,image/jpeg"
                    disabled={Boolean(busyKey)}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void upload(pet.type, slot.slot, file);
                    }}
                  />
                </label>
              </article>;
            })}
          </div>
        </section>)}
      </div>
    </section>
  </div>;
}
