import type { ButtonHTMLAttributes, ReactNode } from "react";
import spinner from "./assets/spinner.svg";

export type AdventureButtonVariant = "primary" | "secondary" | "danger";
export type AdventureButtonSize = "child" | "standard";

export interface AdventureButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  variant?: AdventureButtonVariant;
  size?: AdventureButtonSize;
  loading?: boolean;
}

export function AdventureButton({
  children,
  variant = "primary",
  size = "child",
  loading = false,
  disabled,
  className = "",
  ...props
}: AdventureButtonProps) {
  const stateClass = loading ? " sm-button--loading" : "";

  return (
    <button
      type="button"
      className={`sm-button sm-button--${variant} sm-button--${size}${stateClass} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-figma-node={variant === "danger" ? "1:1477" : "1:1463"}
      {...props}
    >
      {loading && <img className="sm-button__spinner" src={spinner} alt="" />}
      <span>{children}</span>
    </button>
  );
}
