import type { CSSProperties, KeyboardEvent } from "react";

export type StarPetTone = "leaf" | "sky" | "coral" | "lavender" | "gold";

export interface StarPetCardProps {
  name: string;
  trait: string;
  image: string;
  imageAlt?: string;
  imageSize?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
  tone: StarPetTone;
  selected?: boolean;
  selectedIcon?: string;
  onSelect?: () => void;
  figmaNode?: string;
  className?: string;
}

export function StarPetCard({
  name,
  trait,
  image,
  imageAlt = "",
  imageSize = 180,
  imageOffsetX = 0,
  imageOffsetY = 0,
  tone,
  selected = false,
  selectedIcon,
  onSelect,
  figmaNode,
  className = ""
}: StarPetCardProps) {
  const isSelectable = Boolean(onSelect);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!onSelect || (event.key !== "Enter" && event.key !== " ")) return;

    event.preventDefault();
    onSelect();
  }

  return (
    <article
      className={`sm-star-pet-card${selected ? " is-selected" : ""}${isSelectable ? " is-selectable" : ""} ${className}`.trim()}
      data-tone={tone}
      data-figma-node={figmaNode}
      aria-label={`${name}，${trait}${selected ? "，已选择" : ""}`}
      role={isSelectable ? "radio" : undefined}
      aria-checked={isSelectable ? selected : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      <div className="sm-star-pet-card__portrait">
        <img
          src={image}
          alt={imageAlt}
          style={{
            "--sm-pet-image-size": `${imageSize}px`,
            "--sm-pet-image-offset-x": `${imageOffsetX}px`,
            "--sm-pet-image-offset-y": `${imageOffsetY}px`
          } as CSSProperties}
        />
      </div>

      <div className="sm-star-pet-card__copy">
        <div>
          <h2>{name}</h2>
          <span className="sm-star-pet-card__trait">{trait}</span>
        </div>
      </div>

      {selected && selectedIcon && (
        <span className="sm-star-pet-card__selected" aria-hidden="true">
          <img src={selectedIcon} alt="" />
        </span>
      )}
    </article>
  );
}
