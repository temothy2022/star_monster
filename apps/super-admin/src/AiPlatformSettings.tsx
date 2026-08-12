import { useEffect, useMemo, useState, type FormEvent } from "react";
import { adminApi, type ChallengePromptPoolSummary, type SystemAiConfig } from "./api";

export function AiPlatformSettings() {
  const [config, setConfig] = useState<SystemAiConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [enabled, setEnabled] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [pool, setPool] = useState<ChallengePromptPoolSummary | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "models" | "prompts" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void adminApi.aiConfig().then(({ config: loaded }) => {
      setConfig(loaded);
      setModel(loaded.model);
      setEnabled(loaded.enabled || !loaded.configured);
    }).catch((reason) => setMessage(reason instanceof Error ? reason.message : "读取配置失败"));
  }, []);

  useEffect(() => {
    void adminApi.challengePromptPool().then(({ pool: loaded }) => setPool(loaded)).catch(() => undefined);
  }, []);

  const modelOptions = useMemo(
    () => Array.from(new Set([model, ...models, "deepseek-v4-flash", "deepseek-v4-pro"])).filter(Boolean),
    [model, models],
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy("save"); setMessage("");
    try {
      const result = await adminApi.saveAiConfig({ apiKey: apiKey || undefined, model, enabled });
      setConfig(result.config); setApiKey(""); setMessage("DeepSeek 全局配置已保存");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "保存失败");
    } finally { setBusy(null); }
  }

  async function loadModels() {
    setBusy("models"); setMessage("");
    try {
      const result = await adminApi.aiModels();
      setModels(result.models.map((item) => item.id));
      setMessage(`已读取 ${result.models.length} 个可用模型`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "模型读取失败");
    } finally { setBusy(null); }
  }

  async function test() {
    setBusy("test"); setMessage("");
    try {
      const result = await adminApi.testAiConfig();
      setMessage(`${result.message} · ${result.model}`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "连接失败");
    } finally { setBusy(null); }
  }

  async function generatePrompts() {
    setBusy("prompts"); setMessage("DeepSeek 正在一次生成 100 条主动来信，请稍候…");
    try {
      const result = await adminApi.generateChallengePromptPool();
      setPool(result.pool); setMessage(`主动来信话术库已更新，共 ${result.pool.enabledCount} 条`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "话术生成失败");
    } finally { setBusy(null); }
  }

  return <div className="admin-stack"><section className="admin-panel"><header className="admin-panel__header"><h2>DeepSeek 全平台配置</h2></header><form className="admin-form" onSubmit={save}><label className="field-span">{config?.configured ? `替换密钥（当前末四位 ${config.apiKeyLastFour}）` : "DeepSeek API Key"}<input type="password" autoComplete="off" value={apiKey} required={!config?.configured} onChange={(event) => setApiKey(event.target.value)} placeholder={config?.configured ? "留空保留当前密钥" : "sk-..."} /></label><label>默认模型<select value={model} onChange={(event) => setModel(event.target.value)}>{modelOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label className="checkbox"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />启用全平台 AI 功能</label>{message ? <div className="field-span admin-notice">{message}</div> : null}<div className="form-actions field-span"><button type="button" className="ghost-button" disabled={!config?.configured || busy !== null} onClick={() => void loadModels()}>{busy === "models" ? "读取中…" : "刷新模型"}</button><button type="button" className="ghost-button" disabled={!config?.configured || busy !== null} onClick={() => void test()}>{busy === "test" ? "连接中…" : "测试连接"}</button><button className="primary-button" disabled={busy !== null}>{busy === "save" ? "保存中…" : "保存配置"}</button></div></form><p className="admin-help">此密钥由服务端加密保存，供所有家庭的 AI 助手与“你的挑战伙伴”共同使用。家长端不会看到密钥。</p></section><section className="admin-panel"><header className="admin-panel__header"><div><h2>挑战伙伴主动来信库</h2><p>主动发起时从后台随机抽取，不会逐次请求 DeepSeek。</p></div></header><div className="admin-form"><div className="field-span admin-notice">当前可用 {pool?.enabledCount ?? 0}/100 条{pool?.updatedAt ? ` · 最近更新 ${new Date(pool.updatedAt).toLocaleString("zh-CN")}` : ""}</div><div className="form-actions field-span"><button type="button" className="primary-button" disabled={!config?.configured || !config.enabled || busy !== null} onClick={() => void generatePrompts()}>{busy === "prompts" ? "正在生成 100 条…" : pool?.enabledCount === 100 ? "重新生成 100 条" : "生成 100 条"}</button></div></div></section></div>;
}
