import navFootprint from "./assets/nav-footprint.svg";
import navMap from "./assets/nav-map.svg";
import navTask from "./assets/nav-task.svg";
import navWish from "./assets/nav-wish.svg";

export type KidDockItem = "tasks" | "map" | "wishes" | "footprints";

export interface KidDockProps {
  active?: KidDockItem;
  onSelect?: (item: KidDockItem) => void;
}

const items: Array<{ id: KidDockItem; label: string; icon: string; node: string }> = [
  { id: "tasks", label: "任务", icon: navTask, node: "1:1488" },
  { id: "map", label: "航图", icon: navMap, node: "1:1493" },
  { id: "wishes", label: "星愿", icon: navWish, node: "1:1498" },
  { id: "footprints", label: "足迹", icon: navFootprint, node: "1:1503" }
];

export function KidDock({ active = "tasks", onSelect }: KidDockProps) {
  return (
    <nav className="sm-kid-dock" aria-label="儿童端底部导航" data-figma-node="1:1486">
      {items.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`sm-kid-dock__item${isActive ? " is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect?.(item.id)}
            data-figma-node={item.node}
          >
            <img className={`sm-kid-dock__icon sm-kid-dock__icon--${item.id}`} src={item.icon} alt="" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
