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

  useLayoutEffect(() => {
    const updateScale = () => {
      const viewport = getViewportSize();
      setScale(Math.min(1, viewport.width / designWidth, viewport.height / designHeight));
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
    <main className="onboarding-viewport">
      <div
        className={className}
        data-reference-node={referenceNode}
        style={{
          width: designWidth,
          height: designHeight,
          transform: `translate(-50%, -50%) scale(${scale})`
        }}
      >
        {children}
      </div>
    </main>
  );
}
