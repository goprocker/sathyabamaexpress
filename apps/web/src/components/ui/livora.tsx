import type { ReactNode } from "react";
import { MODULES, type ModuleId } from "@/lib/modules";
import { SAMPLE_NOTE } from "@household/life";

export function ModuleBadge({ module, className = "" }: { module: ModuleId; className?: string }) {
  const m = MODULES[module];
  const Icon = m.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ${m.tint} ${className}`}
    >
      <Icon size={13} strokeWidth={1.75} />
      {m.label}
    </span>
  );
}

export function ModuleIcon({ module, size = 44 }: { module: ModuleId; size?: number }) {
  const m = MODULES[module];
  const Icon = m.icon;
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[16px] ${m.tint}`}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={1.5} />
    </span>
  );
}

export function SampleNote({ children }: { children?: ReactNode }) {
  return (
    <p className="mono-label flex items-center gap-2">
      <span aria-hidden className="size-1.5 rounded-full bg-gold" />
      {children ?? SAMPLE_NOTE}
    </p>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="section-title">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: string }>;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="glass inline-flex rounded-full p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`min-h-[36px] rounded-full px-4 text-[14px] transition-colors duration-[180ms] ${
            value === o.id ? "bg-accent text-accent-text" : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-[180ms] ${
        checked ? "bg-accent" : "bg-text-primary/25"
      }`}
    >
      <span
        className={`absolute left-1 top-1 size-6 rounded-full bg-white shadow transition-transform duration-[180ms] ${
          checked ? "translate-x-6" : ""
        }`}
      />
    </button>
  );
}
