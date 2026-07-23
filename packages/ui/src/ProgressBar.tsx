export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
}

export function ProgressBar({ value, max = 100, label }: ProgressBarProps) {
  const ratio = Math.min(Math.max(value / max, 0), 1);
  const percentage = `${ratio * 100}%`;

  return (
    <div
      className="sm-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      data-figma-node="1:1527"
    >
      <span className="sm-progress__value" style={{ width: percentage }} />
    </div>
  );
}

export interface RewardPillProps {
  amount: number;
  unit?: string;
}

export function RewardPill({ amount, unit = "颗星" }: RewardPillProps) {
  return (
    <span className="sm-reward-pill">
      <span className="sm-reward-pill__star" aria-hidden="true">★</span>
      {amount} {unit}
    </span>
  );
}
