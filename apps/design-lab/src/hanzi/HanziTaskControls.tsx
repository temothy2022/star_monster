import { useState } from "react";
import cancelIcon from "@star-monsters/assets/icons/untimed-task/cancel.svg";
import checkIcon from "@star-monsters/assets/icons/icon-check.svg";
import { AbandonDialog } from "../tasks/TaskOverlays";
import { ChildControlIcon } from "../components/ChildControlIcon";

export function HanziTaskControls({
  onAbandon,
  onMarkMastered,
  markMasteredDisabled = false,
  experienceName = "汉字学习",
}: {
  onAbandon: () => void;
  onMarkMastered?: () => void;
  markMasteredDisabled?: boolean;
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
        <ChildControlIcon kind="menu" />
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
              {onMarkMastered ? (
                <button
                  disabled={markMasteredDisabled}
                  type="button"
                  onClick={() => {
                    setOverlay(null);
                    onMarkMastered();
                  }}
                >
                  <span className="untimed-more-menu__icon untimed-more-menu__icon--mastered">
                    <img src={checkIcon} alt="" />
                  </span>
                  <span>这个字已掌握</span>
                </button>
              ) : null}
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
