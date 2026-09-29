import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="landing-eyebrow">{children}</p>;
}

export function Divider() {
  return <hr className="border-0 border-t border-border" />;
}

export function BrowserFrame({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-dialog border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border bg-surface-subtle px-4 py-3">
        <span aria-hidden className="flex gap-1.5">
          <i className="block size-2.5 rounded-full bg-border-strong" />
          <i className="block size-2.5 rounded-full bg-border-strong" />
          <i className="block size-2.5 rounded-full bg-border-strong" />
        </span>
        <p className="ml-2 truncate text-small text-text-tertiary">{url}</p>
      </div>
      <div className="p-5 md:p-8">{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-small text-text-secondary">{label}</span>
      <span
        className={`text-small font-medium tabular-nums ${
          tone === "warn" ? "text-warning" : "text-text-primary"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
