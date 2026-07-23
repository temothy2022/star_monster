import energyIcon from "../assets/onboarding/step4-energy.svg";
import mercury from "../assets/onboarding/step4-mercury.png";
import starIcon from "../assets/onboarding/step4-star.svg";
import startIcon from "../assets/onboarding/step4-start.svg";

interface OnboardingStep4Props {
  onStart: () => void;
}

export function OnboardingStep4({ onStart }: OnboardingStep4Props) {
  return (
    <main className="step4-page" data-reference-node="1:342">
      <span className="step4-glow step4-glow--sun" aria-hidden="true" />
      <span className="step4-glow step4-glow--aqua" aria-hidden="true" />

      <div className="step4-layout" data-figma-node="1:346">
        <section className="step4-planet" aria-label="灰暗的水星" data-figma-node="1:347">
          <img src={mercury} alt="等待被点亮的水星" />
        </section>

        <section className="step4-content" data-figma-node="1:349">
          <article className="step4-welcome" data-figma-node="1:350">
            <span className="step4-welcome__glow" aria-hidden="true" />
            <h1>点亮你的第一颗星球！</h1>
            <p>
              欢迎来到水星（Mercury）。在这里，你将通过完成任务收集能量，
              让这颗灰暗的星球重新焕发生机。
            </p>
          </article>

          <div className="step4-legends" data-figma-node="1:356">
            <article className="step4-legend" data-figma-node="1:357">
              <span className="step4-legend__icon">
                <img src={starIcon} alt="能量星" />
              </span>
              <div>
                <h2>可用能量星</h2>
                <p>完成日常任务获得。用于解锁星球上的新区域和特殊建筑。</p>
              </div>
            </article>

            <article className="step4-legend step4-legend--sailing" data-figma-node="1:366">
              <span className="step4-legend__icon">
                <img src={energyIcon} alt="航行能量" />
              </span>
              <div>
                <h2>永久航行能量</h2>
                <p>累积的长期能量。积满后，即可开启飞往下一颗星球的旅程！</p>
              </div>
            </article>
          </div>

          <div className="step4-action" data-figma-node="1:376">
            <button type="button" onClick={onStart} data-figma-node="1:377">
              <span>开始探索</span>
              <img src={startIcon} alt="" />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
