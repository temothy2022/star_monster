import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ChildDataState } from "../components/ChildDataState";
import { MASCOTS } from "../mascots";
import {
  getChildProfile,
  logoutChild,
  updateChildProfile,
  uploadChildProfileAvatar,
  type ChildProfile,
} from "../api/child-api";
import { ChildControlIcon } from "../components/ChildControlIcon";

export function ChildProfilePage({
  onBack,
  onGrowth,
  onSignedOut,
}: {
  onBack: () => void;
  onGrowth: () => void;
  onSignedOut: () => void;
}) {
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [nickname, setNickname] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getChildProfile()
      .then((result) => {
        setProfile(result);
        setNickname(result.nickname ?? "");
      })
      .catch((reason) => setMessage(reason instanceof Error ? reason.message : "个人资料暂时无法读取"));
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const fallbackAvatar = useMemo(() => (
    profile?.petType ? MASCOTS[profile.petType].images.neutral : null
  ), [profile?.petType]);

  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("请选择一张图片");
      return;
    }
    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextPreview;
    });
    setBusy(true);
    setMessage("");
    try {
      const updated = await uploadChildProfileAvatar(file);
      setProfile((current) => current ? { ...current, avatarUrl: updated.avatarUrl } : current);
      setMessage("头像已经换好啦");
    } catch (reason) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setMessage(reason instanceof Error ? reason.message : "头像没有保存成功");
    } finally {
      setBusy(false);
    }
  }

  async function saveNickname() {
    const value = nickname.trim();
    if (value.length < 2 || value.length > 9) {
      setMessage("昵称需要 2 到 9 个字");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateChildProfile(value);
      setProfile((current) => current ? { ...current, nickname: updated.nickname } : current);
      setMessage("昵称保存成功");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "昵称没有保存成功");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!window.confirm("要退出这个探险账号吗？")) return;
    setBusy(true);
    try {
      await logoutChild();
    } finally {
      onSignedOut();
    }
  }

  if (!profile) {
    return (
      <main className="child-profile-page">
        <ChildDataState error={Boolean(message)} message={message || "正在打开个人中心…"} />
      </main>
    );
  }

  return (
    <main className="child-profile-page">
      <header className="child-profile-page__header">
        <button type="button" className="child-profile-page__back" onClick={onBack} aria-label="返回首页"><ChildControlIcon kind="back" /></button>
        <div><h1>个人中心</h1></div>
      </header>

      <section className="child-profile-card">
        <div className="child-profile-avatar">
          <img src={previewUrl ?? profile.avatarUrl ?? fallbackAvatar ?? ""} alt="我的头像" />
          <label className="child-profile-avatar__change">
            更换头像
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={chooseAvatar} />
          </label>
        </div>
        <div className="child-profile-form">
          <label htmlFor="child-nickname">我的昵称</label>
          <div>
            <input id="child-nickname" value={nickname} maxLength={9} onChange={(event) => setNickname(event.target.value)} />
            <button type="button" disabled={busy} onClick={() => void saveNickname()}>保存</button>
          </div>
          <small>可以输入 2 到 9 个字</small>
          {message ? <p role="status">{message}</p> : null}
        </div>
      </section>

      <section className="child-profile-actions">
        <button type="button" onClick={onGrowth}>查看我的成长</button>
        <button type="button" onClick={onBack}>回到首页</button>
        <button type="button" className="child-profile-actions__secondary" disabled={busy} onClick={() => void signOut()}>切换账号</button>
        <button type="button" className="child-profile-actions__danger" disabled={busy} onClick={() => void signOut()}>退出登录</button>
      </section>
    </main>
  );
}
