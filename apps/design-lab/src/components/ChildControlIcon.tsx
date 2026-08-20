import backIcon from "@star-monsters/assets/icons/icon-arrow-left.svg";
import pauseIcon from "@star-monsters/assets/icons/untimed-task/pause.svg";
import playIcon from "@star-monsters/assets/icons/untimed-task/play.svg";
import closeControlIcon from "@star-monsters/assets/icons/child-controls/close.svg";
import addControlIcon from "@star-monsters/assets/icons/child-controls/add.svg";
import dragControlIcon from "@star-monsters/assets/icons/child-controls/drag.svg";
import resizeHeightControlIcon from "@star-monsters/assets/icons/child-controls/resize-height.svg";
import menuControlIcon from "@star-monsters/assets/icons/child-controls/menu.svg";
import increaseControlIcon from "@star-monsters/assets/icons/child-controls/increase.svg";
import decreaseControlIcon from "@star-monsters/assets/icons/child-controls/decrease.svg";

const CONTROL_ICONS = {
  back: backIcon,
  close: closeControlIcon,
  menu: menuControlIcon,
  next: backIcon,
  pause: pauseIcon,
  play: playIcon,
  add: addControlIcon,
  drag: dragControlIcon,
  resizeHeight: resizeHeightControlIcon,
  increase: increaseControlIcon,
  decrease: decreaseControlIcon,
} as const;

export type ChildControlIconKind = keyof typeof CONTROL_ICONS;

export function ChildControlIcon({ kind }: { kind: ChildControlIconKind }) {
  return (
    <img
      className={`child-control-icon child-control-icon--${kind}`}
      src={CONTROL_ICONS[kind]}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
