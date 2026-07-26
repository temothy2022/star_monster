import backButton from "../assets/onboarding/step2-back-button.webp";
import changeIcon from "../assets/onboarding/step2-change.svg";
import gradeIcon from "../assets/onboarding/step2-grade.svg";
import headerIcon from "../assets/onboarding/step2-header.svg";
import launchIcon from "../assets/onboarding/step2-launch.svg";
import spaceship from "../assets/onboarding/step2-spaceship.webp";
import sparkIcon from "../assets/onboarding/step2-spark.svg";
import userIcon from "../assets/onboarding/step2-user.svg";
import { OnboardingViewport } from "./OnboardingViewport";

interface OnboardingStep2Props {
  selectedPetName: string;
  nickname: string;
  onNicknameChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function OnboardingStep2({
  selectedPetName,
  nickname,
  onNicknameChange,
  onBack,
  onNext
}: OnboardingStep2Props) {
  const nicknameLength = nickname.trim().length;
  const canContinue = nicknameLength >= 2 && nicknameLength <= 9;

  return (
    <OnboardingViewport className="step2-page" designWidth={1194} referenceNode="1:382">
      <div className="step2-safe-area" data-figma-node="1:384">
        <section className="step2-visual" aria-label="星际飞船" data-figma-node="1:385">
          <img className="step2-visual__grade" src={gradeIcon} alt="" />
          <img className="step2-visual__spark" src={sparkIcon} alt="" />
          <img className="step2-visual__ship" src={spaceship} alt="橙色星际飞船" />
        </section>

        <section className="step2-form-column" data-figma-node="1:391">
          <div className="step2-panel" data-figma-node="1:392">
            <header className="step2-panel__header">
              <span className="step2-panel__badge">
                <img src={headerIcon} alt="" />
              </span>
              <h1>你好呀，新探险家！</h1>
              <p>给{selectedPetName}的新伙伴起个名字吧</p>
            </header>

            <div className="step2-form">
              <label htmlFor="explorer-nickname">输入你的昵称</label>
              <div className="step2-input-shell">
                <img src={userIcon} alt="" />
                <input
                  id="explorer-nickname"
                  value={nickname}
                  onChange={(event) => onNicknameChange(event.target.value.slice(0, 9))}
                  placeholder="2-9个字符"
                  minLength={2}
                  maxLength={9}
                  autoComplete="nickname"
                />
              </div>

              <div className="step2-actions">
                <button
                  className="step2-primary"
                  type="button"
                  onClick={onNext}
                  disabled={!canContinue}
                  aria-describedby="explorer-nickname-hint"
                >
                  <span>和{selectedPetName}出发</span>
                  <img src={launchIcon} alt="" />
                </button>
                <span id="explorer-nickname-hint" className="visually-hidden">
                  昵称需要输入2到9个字符
                </span>
                <button className="step2-secondary" type="button" onClick={onBack}>
                  <img src={changeIcon} alt="" />
                  <span>换一个</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <button className="step2-back" type="button" onClick={onBack} aria-label="返回选择星宠">
        <img src={backButton} alt="" />
      </button>
    </OnboardingViewport>
  );
}
