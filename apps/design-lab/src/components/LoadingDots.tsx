export function LoadingDots({ label }: { label: string }) {
  return (
    <span className="child-loading-indicator" role="status">
      <span>{label}</span>
      <span className="child-loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}
