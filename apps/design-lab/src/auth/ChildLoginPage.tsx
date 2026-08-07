import { useMemo, useState, type FormEvent } from "react";
import rocketIcon from "@star-monsters/assets/icons/icon-rocket.svg";
import { loginChild } from "../api/child-api";
import type { PetType } from "../mascots";

type ChildLoginPageProps = {
  onAuthenticated: (input: {
    onboardingCompleted: boolean;
    nickname: string | null;
    petType: PetType | null;
  }) => void;
};

const DISPLAY_GROUP_SIZE = 4;

function normalizeCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, "")
    .slice(0, 8);
}

export function ChildLoginPage({ onAuthenticated }: ChildLoginPageProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const displayCode = useMemo(() => {
    if (code.length <= DISPLAY_GROUP_SIZE) return code;
    return `${code.slice(0, DISPLAY_GROUP_SIZE)} ${code.slice(DISPLAY_GROUP_SIZE)}`;
  }, [code]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 8 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const child = await loginChild(code);
      onAuthenticated({
        onboardingCompleted: child.onboardingCompleted,
        nickname: child.nickname,
        petType: child.petType,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败，请再试一次");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="child-login-page">
      <span className="child-login-orbit child-login-orbit--one" />
      <span className="child-login-orbit child-login-orbit--two" />
      <section className="child-login-card" aria-labelledby="child-login-title">
        <div className="child-login-card__rocket">
          <span />
          <img src={rocketIcon} alt="" />
        </div>
        <p className="child-login-card__eyebrow">星宠成长基地</p>
        <h1 id="child-login-title">准备好出发了吗？</h1>
        <p className="child-login-card__intro">输入家长给你的 8 位探险代码</p>
        <form onSubmit={submit}>
          <label htmlFor="child-login-code">探险代码</label>
          <div className="child-login-code-wrap">
            <input
              id="child-login-code"
              value={displayCode}
              onChange={(event) => setCode(normalizeCode(event.target.value))}
              autoCapitalize="characters"
              autoComplete="one-time-code"
              spellCheck={false}
              inputMode="text"
              placeholder="ABCD 2345"
              aria-describedby={error ? "child-login-error" : undefined}
              aria-invalid={Boolean(error)}
              autoFocus
            />
            <span aria-hidden="true">{code.length}/8</span>
          </div>
          {error ? (
            <p className="child-login-error" id="child-login-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="child-login-help">代码里没有 0、1、I 和 O，更容易看清楚</p>
          )}
          <button type="submit" disabled={code.length !== 8 || submitting}>
            <span>{submitting ? "正在连接星宠…" : "进入星宠基地"}</span>
            <img src={rocketIcon} alt="" />
          </button>
        </form>
      </section>
    </main>
  );
}
