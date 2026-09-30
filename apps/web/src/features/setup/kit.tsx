// Small building blocks shared by the Setup tabs: labelled fields, validation
// against the shared contracts, a file picker and status messages.
import { useId, useRef, useState, type ReactNode } from "react";
import { Camera, Check, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { prepareUpload, type PreparedFile } from "@/lib/image";

const control =
  "glass h-12 w-full rounded-full px-5 text-[15px] text-text-primary placeholder:text-text-tertiary transition-colors duration-150 focus:border-accent focus:bg-surface-elevated focus:outline-none disabled:opacity-60";

// ── Fields ─────────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-text-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-[12px] text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-[12px] text-text-tertiary">{hint}</p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
  type?: "text" | "number" | "date" | "tel";
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel";
  autoComplete?: string;
  min?: number;
  max?: number;
  step?: string;
}

export function TextField({ label, value, onChange, error, hint, type = "text", placeholder, inputMode, autoComplete, min, max, step }: TextFieldProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode ?? (type === "number" ? "decimal" : undefined)}
        autoComplete={autoComplete}
        min={min}
        max={max}
        step={step}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={control}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  error,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={`${control} cursor-pointer appearance-none bg-no-repeat pr-10`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center gap-3 text-[15px] text-text-primary">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[#2E6B3E]" />
        {label}
      </label>
      {hint && <p className="-mt-1 pl-8 text-[12px] text-text-tertiary">{hint}</p>}
    </div>
  );
}

// ── Files ──────────────────────────────────────────────────────────────────

/** Pick or photograph a document. Photos are shrunk in the browser before they are sent. */
export function FileField({
  label,
  prepared,
  onChange,
  disabled,
  disabledReason,
}: {
  label: string;
  prepared: PreparedFile | null;
  onChange: (file: PreparedFile | null) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onChange(await prepareUpload(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't use that file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-text-secondary">{label}</p>
      {disabled ? (
        <p className="rounded-[12px] bg-surface-subtle px-4 py-3 text-[13px] text-text-secondary">{disabledReason}</p>
      ) : prepared ? (
        <div className="glass flex items-center gap-3 rounded-[12px] p-2 pr-3">
          {prepared.previewUrl ? (
            <img src={prepared.previewUrl} alt="" className="size-14 shrink-0 rounded-[8px] object-cover" />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[8px] bg-surface-subtle">
              <FileText size={22} strokeWidth={1.5} className="text-text-tertiary" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[14px]">{prepared.file.name}</span>
          <button type="button" onClick={() => onChange(null)} aria-label="Remove file" className="flex size-11 items-center justify-center rounded-full hover:bg-surface-elevated">
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="glass flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-border-strong px-4 text-[14px] text-text-secondary transition-colors hover:bg-surface-elevated disabled:opacity-60"
        >
          <Camera size={18} strokeWidth={1.5} />
          {busy ? "Preparing…" : "Take a photo or choose a file"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <p role="alert" className="mt-1 text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Messages and layout ────────────────────────────────────────────────────

export function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-danger/30 bg-danger-subtle text-danger",
    success: "border-accent/30 bg-accent-subtle text-accent",
    info: "border-border bg-surface-subtle text-text-secondary",
  }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-[12px] border px-4 py-3 text-[14px] ${styles}`}>
      {tone === "success" && <Check size={16} className="mt-0.5 shrink-0" />}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** A titled card that holds one form. */
export function FormCard({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <section className="card-base space-y-4 p-5" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h3>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close form" className="flex size-11 items-center justify-center rounded-full hover:bg-surface-elevated">
            <X size={18} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function FormButtons({ busy, submitLabel, onCancel }: { busy: boolean; submitLabel: string; onCancel?: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button type="submit" variant="primary" disabled={busy} className="min-w-[140px]">
        {busy ? "Saving…" : submitLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      )}
    </div>
  );
}

export const grid2 = "grid gap-4 sm:grid-cols-2";

// ── Validation ─────────────────────────────────────────────────────────────

type Parsed<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

/** Runs the shared contract over the form values and returns one message per field. */
export function validate<T>(schema: { safeParse(input: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, values: unknown): Parsed<T> {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= friendly(issue.message);
  }
  return { ok: false, errors };
}

/** The contracts speak in schema terms; a form should not. */
function friendly(message: string): string {
  if (/received undefined|Required/i.test(message)) return "Required";
  if (/expected number|NaN/i.test(message)) return "Enter a number";
  if (/expected one of|Invalid option|Invalid enum/i.test(message)) return "Choose an option";
  if (/Too small: expected string/i.test(message)) return "Required";
  return message;
}

/** "" becomes undefined; anything else must be a number. */
export function num(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.";
}
