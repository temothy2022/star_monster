import { useEffect, useState } from "react";
import { adminApi } from "./api";

export function PlatformFeatureSettings() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void adminApi.platformFeatures()
      .then(({ settings }) => {
        setEnabled(settings.realChildCompetitionEnabled);
        setLoaded(true);
      })
      .catch((reason) => setMessage(reason instanceof Error ? reason.message : "读取平台开关失败"));
  }, []);

  async function toggle() {
    const nextValue = !enabled;
    setEnabled(nextValue);
    setBusy(true);
    setMessage("");
    try {
      const result = await adminApi.savePlatformFeatures({ realChildCompetitionEnabled: nextValue });
      setEnabled(result.settings.realChildCompetitionEnabled);
      setMessage(nextValue ? "已开启，真实孩子会出现在榜单并可以互相发消息" : "已关闭，真实孩子榜单和消息入口已隐藏");
    } catch (reason) {
      setEnabled(!nextValue);
      setMessage(reason instanceof Error ? reason.message : "保存平台开关失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-stack"><section className="admin-panel platform-feature-settings"><header className="admin-panel__header"><div><h2>真实小伙伴互动</h2><p>控制真实用户是否进入孩子端排行榜，以及孩子之间是否可以互相发消息。</p></div></header><div className="platform-feature-settings__row"><div><strong>{enabled ? "已开启" : "已关闭"}</strong><span>{enabled ? "真实小伙伴会参与每日榜和每周榜，也可以从排行榜发消息。" : "排行榜只展示自己和虚拟伙伴，真实联系人和消息不会展示。"}</span></div><button type="button" className={`platform-switch ${enabled ? "is-on" : ""}`} role="switch" aria-checked={enabled} aria-label="真实小伙伴互动开关" disabled={!loaded || busy} onClick={() => void toggle()}><span /></button></div>{message && <div className={`admin-notice ${message.includes("失败") ? "admin-notice--error" : "admin-notice--success"}`}>{message}</div>}<p className="admin-help">关闭不会删除已有对话或榜单数据；重新开启后，符合条件的真实用户会恢复显示。开关由服务端强制执行，不能通过孩子端旧页面绕过。</p></section></div>;
}
