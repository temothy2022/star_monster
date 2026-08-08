const VISIBLE_HEIGHT_PROPERTY = "--app-visible-height";
const VISIBLE_WIDTH_PROPERTY = "--app-visible-width";

export function installVisibleViewport() {
  let animationFrame = 0;

  const sync = () => {
    animationFrame = 0;
    const viewport = window.visualViewport;
    const height = Math.round(viewport?.height ?? window.innerHeight);
    const width = Math.round(viewport?.width ?? window.innerWidth);

    document.documentElement.style.setProperty(
      VISIBLE_HEIGHT_PROPERTY,
      `${height}px`,
    );
    document.documentElement.style.setProperty(
      VISIBLE_WIDTH_PROPERTY,
      `${width}px`,
    );
  };

  const scheduleSync = () => {
    if (animationFrame) return;
    animationFrame = window.requestAnimationFrame(sync);
  };

  sync();
  window.addEventListener("resize", scheduleSync, { passive: true });
  window.addEventListener("orientationchange", scheduleSync, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleSync, {
    passive: true,
  });
  window.visualViewport?.addEventListener("scroll", scheduleSync, {
    passive: true,
  });
}
