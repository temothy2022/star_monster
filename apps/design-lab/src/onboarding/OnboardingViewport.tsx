import { useLayoutEffect, useState, type ReactNode } from "react";

interface OnboardingViewportProps {
  children: ReactNode;
  className: string;
  designWidth: number;
  referenceNode: string;
}

function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: 0, height: 0 };
  }

  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight
  };
}

export function OnboardingViewport({
  children,
  className,
  designWidth,
  referenceNode
}: OnboardingViewportProps) {
  const designHeight = 834;
  const [scale, setScale] = useState(() => {
    const viewport = getViewportSize();
    if (!viewport.width || !viewport.height) return 1;
    return Math.min(1, viewport.width / designWidth, viewport.height / designHeight);
  });
  const [compact, setCompact] = useState(() => getViewportSize().width <= 600);

  useLayoutEffect(() => {
    const updateScale = () => {
      const viewport = getViewportSize();
      setScale(Math.min(1, viewport.width / designWidth, viewport.height / designHeight));
      setCompact(viewport.width <= 600);
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    window.visualViewport?.addEventListener("resize", updateScale);

    return () => {
      window.removeEventListener("resize", updateScale);
      window.visualViewport?.removeEventListener("resize", updateScale);
    };
  }, [designWidth]);

  return (
    <main className={`onboarding-viewport${compact ? " onboarding-viewport--compact" : ""}`}>
      <div
        className={className}
        data-reference-node={referenceNode}
        style={{
          width: compact ? "100%" : designWidth,
          height: compact ? "100%" : designHeight,
          transform: compact
            ? "translate(-50%, -50%)"
            : `translate(-50%, -50%) scale(${scale})`
        }}
      >
        {children}
      </div>
    </main>
  );
}
