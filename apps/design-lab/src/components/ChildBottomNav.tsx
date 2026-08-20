import navTasks from "@star-monsters/assets/images/task-list/navigation/nav-tasks.webp";
import navPet from "@star-monsters/assets/images/task-list/navigation/nav-pet.webp";
import navFootprints from "@star-monsters/assets/images/task-list/navigation/nav-footprints.webp";
import navHome from "@star-monsters/assets/images/task-list/navigation/nav-home.webp";

export type ChildRoute =
  | "home"
  | "tasks"
  | "tasks-partial"
  | "tasks-dashboard"
  | "map"
  | "pet-growth"
  | "wishes-requested"
  | "footprints"
  | "profile"
  | "growth-record"
  | "fever-record";
export type ChildNavItem = "home" | "tasks" | "pet" | "footprints";

function prefetchRoute(route: ChildRoute) {
  if (route === "pet-growth") {
    void import("../pet/PetGrowthPage");
  } else if (route === "wishes-requested" || route === "footprints") {
    void import("../progress/WishesAndFootprints");
  } else if (route === "map") {
    void import("../planets/PlanetMap");
  } else if (route === "profile") {
    void import("../profile/ChildProfilePage");
  } else if (route === "growth-record") {
    void import("../profile/ChildGrowthPage");
  } else if (route === "fever-record") {
    void import("../profile/ChildFeverPage");
  } else {
    void import("../tasks/TaskListPages");
  }
}

export function ChildBottomNav({
  active,
  onNavigate,
}: {
  active: ChildNavItem;
  onNavigate?: (route: ChildRoute) => void;
}) {
  const items = [
    { key: "home", label: "首页", icon: navHome, route: "home" as const },
    { key: "tasks", label: "任务", icon: navTasks, route: "tasks" as const },
    { key: "pet", label: "星宠", icon: navPet, route: "pet-growth" as const },
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
            onPointerDown={() => prefetchRoute(item.route)}
            onPointerEnter={() => prefetchRoute(item.route)}
            onFocus={() => prefetchRoute(item.route)}
            onClick={() => {
              if (isActive) return;
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
