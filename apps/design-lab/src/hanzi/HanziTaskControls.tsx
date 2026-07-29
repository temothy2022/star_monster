import { useState } from "react";
import moreIcon from "../assets/untimed-task/more.svg";
import cancelIcon from "../assets/untimed-task/cancel.svg";
import { AbandonDialog } from "../tasks/UntimedTaskPages";

export function HanziTaskControls({
  onAbandon,
  experienceName = "汉字学习",
}: {
  onAbandon: () => void;
  experienceName?: string;
}) {
  const [overlay, setOverlay] = useState<"menu" | "abandon" | null>(null);

  return (
    <>
      <button
        className="hanzi-more-button"
        type="button"
        aria-label="更多"
        onClick={() => setOverlay("menu")}
      >
        <img src={moreIcon} alt="" />
      </button>
      {overlay === "menu" ? (
        <div
          className="untimed-overlay untimed-overlay--menu"
          role="presentation"
          onClick={() => setOverlay(null)}
        >
          <div
            className="untimed-more-menu hanzi-more-menu"
            role="dialog"
            aria-modal="true"
            aria-label={`${experienceName}更多菜单`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="untimed-more-menu__panel">
              <button type="button" onClick={() => setOverlay("abandon")}>
                <span className="untimed-more-menu__icon">
                  <img src={cancelIcon} alt="" />
                </span>
                <span>放弃这次学习</span>
              </button>
            </div>
            <p>点击空白处继续学习</p>
          </div>
        </div>
      ) : null}
      {overlay === "abandon" ? (
        <AbandonDialog
          onContinue={() => setOverlay(null)}
          onAbandon={onAbandon}
        />
      ) : null}
    </>
  );
}
