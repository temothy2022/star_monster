import backIcon from "@star-monsters/assets/icons/icon-arrow-left.svg";
import closeIcon from "@star-monsters/assets/icons/timed-task/start-icon-5.svg";
import moreIcon from "@star-monsters/assets/icons/untimed-task/more.svg";
import pauseIcon from "@star-monsters/assets/icons/untimed-task/pause.svg";
import playIcon from "@star-monsters/assets/icons/untimed-task/play.svg";

const CONTROL_ICONS = {
  back: backIcon,
  close: closeIcon,
  menu: moreIcon,
  next: backIcon,
  pause: pauseIcon,
  play: playIcon,
} as const;

export type ChildControlIconKind = keyof typeof CONTROL_ICONS;

export function ChildControlIcon({ kind }: { kind: ChildControlIconKind }) {
  return (
    <img
      className={`child-control-icon child-control-icon--${kind}`}
      src={CONTROL_ICONS[kind]}
      alt=""
      aria-hidden="true"
    />
  );
}
