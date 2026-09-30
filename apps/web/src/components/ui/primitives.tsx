import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

// ── Button ─────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-text shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_6px_16px_-6px_rgba(46,107,62,0.6)] hover:bg-accent-hover disabled:bg-accent/40 disabled:shadow-none disabled:text-accent-text/70",
  secondary:
    "glass text-text-primary hover:bg-surface-elevated disabled:text-text-tertiary",
  ghost:
    "text-text-secondary hover:bg-surface hover:text-text-primary disabled:text-text-tertiary",
  danger:
    "border border-danger/30 bg-danger-subtle text-danger hover:border-danger/50",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-small gap-1.5 rounded-full",
  md: "h-12 px-6 text-[15px] gap-2 rounded-full",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center transition-colors duration-150 disabled:cursor-not-allowed ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...props}
    />
  );
}

// ── IconButton ─────────────────────────────────────────────────────────────

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
}

export function IconButton({ icon: Icon, label, className = "", ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-surface hover:text-text-primary ${className}`}
      {...props}
    >
      <Icon size={18} strokeWidth={1.75} />
    </button>
  );
}

// ── Input / SearchInput ────────────────────────────────────────────────────

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`glass h-12 w-full rounded-full px-5 text-[15px] text-text-primary placeholder:text-text-tertiary transition-colors duration-150 focus:border-accent focus:bg-surface-elevated focus:outline-none ${className}`}
      {...props}
    />
  );
}

// ── StatusPill ─────────────────────────────────────────────────────────────

export type PillTone = "neutral" | "accent" | "warning" | "danger" | "muted";

const pillTones: Record<PillTone, string> = {
  neutral: "bg-surface text-text-secondary border-transparent",
  accent: "bg-accent-subtle text-accent border-transparent",
  warning: "bg-warning-subtle text-warning border-warning/20",
  danger: "bg-danger-subtle text-danger border-danger/20",
  muted: "bg-transparent text-text-tertiary border-transparent",
};

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-meta ${pillTones[tone]}`}
    >
      {children}
    </span>
  );
}

// ── Section / Divider ──────────────────────────────────────────────────────

export function SectionHeader({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

export function Divider() {
  return <hr className="border-0 border-t border-border" />;
}

// ── Card ───────────────────────────────────────────────────────────────────

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass rounded-card ${className}`}>
      {children}
    </div>
  );
}

// ── Row (label/value line used across inventory, meals, receipts) ─────────

export function Row({
  label,
  value,
  tone,
  onClick,
}: {
  label: ReactNode;
  value?: ReactNode;
  tone?: "warning" | "danger" | "accent";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "warning"
      ? "text-warning"
      : tone === "danger"
        ? "text-danger"
        : tone === "accent"
          ? "text-accent"
          : "text-text-secondary";
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-4 py-2.5 text-left ${onClick ? "cursor-pointer" : ""}`}
    >
      <span className="body-text text-text-primary">{label}</span>
      <span className={`text-small ${toneClass}`}>{value}</span>
    </Comp>
  );
}

// ── Empty / Loading / Error states (Design System §26) ────────────────────

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-dashed border-border-strong bg-surface-subtle px-6 py-12 text-center">
      <p className="body-text text-text-primary">{title}</p>
      {hint && <p className="mt-1 text-small text-text-tertiary">{hint}</p>}
    </div>
  );
}

export function ErrorState({
  message = "Couldn't load data.",
  onRetry,
  children,
}: {
  message?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-card border border-danger/25 bg-danger-subtle px-6 py-8 text-center"
    >
      <p className="text-small text-danger">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-[8px] bg-surface ${className}`}
    />
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between py-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
