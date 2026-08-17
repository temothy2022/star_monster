import { useEffect, useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from "react";

type NumberFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  type?: "number";
  value: number | string | null | undefined;
};

function formatValue(value: NumberFieldProps["value"]) {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeDraft(value: string) {
  if (!value || value === "-" || value === "." || value === "-.") return value;
  const sign = value.startsWith("-") ? "-" : "";
  const unsigned = sign ? value.slice(1) : value;
  const [integer, fraction] = unsigned.split(".");
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "") || "0";
  return `${sign}${normalizedInteger}${fraction === undefined ? "" : `.${fraction}`}`;
}

function eventWithValue(event: ChangeEvent<HTMLInputElement>, value: string) {
  return { ...event, target: { ...event.target, value }, currentTarget: { ...event.currentTarget, value } } as ChangeEvent<HTMLInputElement>;
}

export function NumberField({ value, onChange, onBlur, onFocus, type: _type, ...props }: NumberFieldProps) {
  const [draft, setDraft] = useState(() => formatValue(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatValue(value));
  }, [focused, value]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextDraft = normalizeDraft(event.target.value);
    setDraft(nextDraft);
    if (!nextDraft || nextDraft === "-" || nextDraft === "." || nextDraft === "-.") return;
    const parsed = Number(nextDraft);
    if (!Number.isFinite(parsed)) return;
    onChange?.(nextDraft === event.target.value ? event : eventWithValue(event, nextDraft));
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    setFocused(true);
    onFocus?.(event);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setFocused(false);
    const nextDraft = normalizeDraft(draft);
    if (!nextDraft || nextDraft === "-" || nextDraft === "." || nextDraft === "-.") {
      setDraft(formatValue(value));
    } else {
      setDraft(nextDraft);
      if (nextDraft !== draft) onChange?.(eventWithValue(event as unknown as ChangeEvent<HTMLInputElement>, nextDraft));
    }
    onBlur?.(event);
  }

  return <input {...props} type="number" value={draft} onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur} />;
}
