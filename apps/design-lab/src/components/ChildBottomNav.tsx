import navTasks from "@star-monsters/assets/images/task-list/semantic/nav-tasks.png";
import navMap from "@star-monsters/assets/images/task-list/semantic/nav-map.png";
import navWish from "@star-monsters/assets/images/task-list/semantic/nav-wish.png";
import navFootprints from "@star-monsters/assets/images/task-list/semantic/nav-trail.png";
import { markChildNavigation } from "../api/performance-telemetry";

export type ChildRoute =
  | "tasks-partial"
  | "map"
  | "pet-growth"
  | "wishes-requested"
  | "footprints";
export type ChildNavItem = "tasks" | "pet" | "wish" | "footprints";

export function ChildBottomNav({
  active,
  onNavigate,
}: {
  active: ChildNavItem;
  onNavigate?: (route: ChildRoute) => void;
}) {
  const items = [
    { key: "tasks", label: "任务", icon: navTasks, route: "tasks-partial" as const },
    { key: "pet", label: "星宠", icon: navMap, route: "pet-growth" as const },
    { key: "wish", label: "星愿", icon: navWish, route: "wishes-requested" as const },
    { key: "footprints", label: "足迹", icon: navFootprints, route: "footprints" as const },
  ];

  return (
    <nav className="child-bottom-nav" aria-label="儿童端主导航">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            className={[
              "child-bottom-nav__item",
              isActive ? "child-bottom-nav__item--active" : "",
            ].filter(Boolean).join(" ")}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              if (isActive) return;
              markChildNavigation(item.route);
              onNavigate?.(item.route);
            }}
          >
            <img src={item.icon} alt="" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
