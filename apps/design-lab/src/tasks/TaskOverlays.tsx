import abandonBackground from "@star-monsters/assets/images/untimed-task/abandon-bg.png";
import cancelIcon from "@star-monsters/assets/icons/untimed-task/cancel.svg";
import exitIcon from "@star-monsters/assets/icons/untimed-task/exit.svg";
import helpIcon from "@star-monsters/assets/icons/untimed-task/help.svg";
import pauseIcon from "@star-monsters/assets/icons/untimed-task/pause.svg";
import playIcon from "@star-monsters/assets/icons/untimed-task/play.svg";
import spaceship from "@star-monsters/assets/images/untimed-task/spaceship.webp";
import sparkleIcon from "@star-monsters/assets/icons/untimed-task/sparkle.svg";

export type UntimedOverlay = "menu" | "abandon" | null;

export function MoreMenu({
  onClose,
  onPause,
  onAbandon,
  paused = false,
}: {
  onClose: () => void;
  onPause: () => void;
  onAbandon: () => void;
  paused?: boolean;
}) {
  return (
    <div
      className="untimed-overlay untimed-overlay--menu"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="untimed-more-menu"
        role="dialog"
        aria-modal="true"
        aria-label="更多菜单"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="untimed-more-menu__panel">
          <button type="button" onClick={onPause}>
            <span className="untimed-more-menu__icon untimed-more-menu__icon--pause">
              <img src={pauseIcon} alt="" />
            </span>
            <span>{paused ? "继续任务" : "暂停一下"}</span>
          </button>
          <button type="button" onClick={onAbandon}>
            <span className="untimed-more-menu__icon">
              <img src={cancelIcon} alt="" />
            </span>
            <span>放弃这次</span>
          </button>
        </div>
        <p>点击空白处返回探索</p>
      </div>
    </div>
  );
}

export function AbandonDialog({
  onContinue,
  onAbandon,
}: {
  onContinue: () => void;
  onAbandon: () => void;
}) {
  return (
    <div className="untimed-overlay untimed-overlay--abandon">
      <section
        className="untimed-abandon-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="untimed-abandon-title"
      >
        <img className="untimed-abandon-dialog__texture" src={abandonBackground} alt="" />
        <img className="untimed-abandon-dialog__sparkle" src={sparkleIcon} alt="" />
        <div className="untimed-abandon-dialog__art">
          <span className="untimed-abandon-dialog__art-bg" />
          <img src={spaceship} alt="迷你飞船" />
          <span className="untimed-abandon-dialog__help">
            <img src={helpIcon} alt="" />
          </span>
        </div>
        <h2 id="untimed-abandon-title">要放弃这次吗？</h2>
        <p>不会扣掉已经得到的星星。你可以随时回来重新探索。</p>
        <div className="untimed-abandon-dialog__actions">
          <button className="untimed-abandon-dialog__continue" type="button" onClick={onContinue}>
            <img src={playIcon} alt="" />
            <span>继续任务</span>
          </button>
          <button className="untimed-abandon-dialog__exit" type="button" onClick={onAbandon}>
            <img src={exitIcon} alt="" />
            <span>放弃这次</span>
          </button>
        </div>
      </section>
    </div>
  );
}
