export function ChildDataState({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return (
    <section
      className={`child-data-state${error ? " child-data-state--error" : ""}`}
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      {!error && <span className="child-data-state__spinner" aria-hidden="true" />}
      <p>{message}</p>
    </section>
  );
}
