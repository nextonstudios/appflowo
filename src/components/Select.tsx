import { useEffect, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  labelClassName?: string;
  align?: "start" | "end";
}

const TRIGGER_BASE =
  "w-max max-w-full flex items-center justify-between gap-2 bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export default function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  triggerClassName,
  labelClassName,
  align = "start",
}: SelectProps) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function alClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function alTecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alClicFuera);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClicFuera);
      document.removeEventListener("keydown", alTecla);
    };
  }, [abierto]);

  const actual = options.find((o) => o.value === value);
  const etiqueta = actual ? actual.label : placeholder || value;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto(!abierto)}
        className={triggerClassName || TRIGGER_BASE}
      >
        <span className={"whitespace-nowrap " + (labelClassName || (actual ? "text-primary" : "text-muted"))}>{etiqueta}</span>        {!disabled && (
          <svg
            className={"w-4 h-4 text-muted flex-shrink-0 transition-transform " + (abierto ? "rotate-180" : "")}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {abierto && !disabled && (
        <div
          className={"absolute z-50 mt-1 bg-surface border border-edge rounded-lg shadow-xl overflow-auto max-h-60 w-max min-w-full max-w-sm " +
            (align === "end" ? "right-0" : "left-0")}
        >
          {options.map((opcion) => (
            <button
              key={opcion.value}
              type="button"
              onClick={() => { if (onChange) onChange(opcion.value); setAbierto(false); }}
              className={"w-full whitespace-nowrap text-left px-3 py-2 text-sm transition-colors " +
                (opcion.value === value
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-primary hover:bg-surface2")}
            >
              {opcion.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
