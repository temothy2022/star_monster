export function installZoomPrevention() {
  const preventGestureZoom = (event: Event) => {
    event.preventDefault();
  };
  const preventMultiTouchZoom = (event: TouchEvent) => {
    if (event.touches.length > 1) event.preventDefault();
  };

  // iOS Safari exposes proprietary gesture events for pinch zoom. The
  // multi-touch fallback also covers versions that do not emit them reliably.
  document.addEventListener("gesturestart", preventGestureZoom, {
    passive: false,
  });
  document.addEventListener("gesturechange", preventGestureZoom, {
    passive: false,
  });
  document.addEventListener("gestureend", preventGestureZoom, {
    passive: false,
  });
  document.addEventListener("touchmove", preventMultiTouchZoom, {
    passive: false,
  });
}
