// Receipt upload → review → confirm (Design System §13)
import { useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, FileText, Pencil, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, StatusPill } from "@/components/ui/primitives";
import { useConfirmReceipt } from "@/hooks/queries";
import { uploadReceipt, type ReceiptLineReview } from "@/lib/api";
import { formatQuantity } from "@/lib/format";
import type { StateTransitionItem } from "@/mocks/types";

type Phase = "upload" | "processing" | "review" | "confirming" | "confirmed";

export function ReceiptPage() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [lines, setLines] = useState<ReceiptLineReview[]>([]);
  const [vendorName, setVendorName] = useState<string>("");
  const [added, setAdded] = useState(0);
  const [transitions, setTransitions] = useState<StateTransitionItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const confirm = useConfirmReceipt();

  async function processReceiptInput(input?: { imageBase64?: string; rawText?: string }) {
    setPhase("processing");
    const scan = await uploadReceipt(input);
    setVendorName(scan.vendorName);
    setLines(scan.items.map((i) => ({ ...i, included: true })));
    setPhase("review");
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : undefined;
      void processReceiptInput({ imageBase64: result });
    };
    reader.onerror = () => {
      void processReceiptInput();
    };
    reader.readAsDataURL(file);
  }

  function updateLine(idx: number, patch: Partial<ReceiptLineReview>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function handleConfirm() {
    setPhase("confirming");
    const res = await confirm.mutateAsync(lines);
    setAdded(res.added);
    setTransitions(res.stateTransitions ?? []);
    setPhase("confirmed");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipt"
        subtitle={
          phase === "review"
            ? `${vendorName ? `${vendorName} · ` : ""}Check the extracted items — low-confidence lines are flagged.`
            : "Upload a grocery bill to update canonical kitchen inventory."
        }
      />

      {phase === "upload" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-card border border-dashed border-border-strong px-6 py-14 transition-colors duration-150 hover:border-accent/40 hover:bg-accent-subtle/40"
          >
            <Upload
              size={24}
              strokeWidth={1.5}
              className="text-text-tertiary"
            />
            <span className="body-text font-medium">
              Upload or scan a grocery bill
            </span>
            <span className="text-small text-text-tertiary">
              JPG, PNG or PDF · items are extracted via OpenAI Vision for your review
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2.5 text-small text-text-secondary">
              <FileText size={16} strokeWidth={1.75} className="text-text-tertiary" />
              <span>Don’t have a bill photo handy?</span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void processReceiptInput()}
            >
              Load sample Nilgiris receipt
            </Button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="rounded-card border border-border bg-surface px-6 py-10 text-center">
          <p className="body-text font-medium">Processing receipt…</p>
          <p className="mt-1 text-small text-text-tertiary">
            Extracting items, canonical units, confidence scores and expiry windows
          </p>
          <div className="mx-auto mt-6 max-w-sm space-y-2" aria-hidden>
            <div className="h-2.5 w-3/4 animate-pulse rounded bg-surface-subtle" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-subtle" />
            <div className="mx-auto h-2.5 w-2/3 animate-pulse rounded bg-surface-subtle" />
          </div>
        </div>
      )}

      {phase === "review" && (
        <div className="rounded-card border border-border bg-surface px-5 py-2 md:px-6">
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="border-b border-border py-3 last:border-0"
            >
              {editingIndex === idx ? (
                <div className="flex flex-wrap items-center gap-2 py-1">
                  <input
                    value={line.name}
                    onChange={(e) => updateLine(idx, { name: e.target.value })}
                    className="h-9 min-w-32 flex-1 rounded-[6px] border border-border px-2.5 text-small focus:border-accent focus:outline-none"
                    aria-label="Item name"
                  />
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(idx, { quantity: Number(e.target.value) })
                    }
                    className="h-9 w-24 rounded-[6px] border border-border px-2.5 text-small focus:border-accent focus:outline-none"
                    aria-label="Quantity"
                  />
                  <select
                    value={line.unit}
                    onChange={(e) => updateLine(idx, { unit: e.target.value })}
                    className="h-9 rounded-[6px] border border-border bg-surface px-2 text-small focus:border-accent focus:outline-none"
                    aria-label="Unit"
                  >
                    <option>kg</option>
                    <option>g</option>
                    <option>L</option>
                    <option>ml</option>
                    <option>pcs</option>
                  </select>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditingIndex(null)}
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <label className="flex flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={line.included}
                      onChange={(e) =>
                        updateLine(idx, { included: e.target.checked })
                      }
                      className="size-4 accent-[#356B4A]"
                    />
                    <span className="body-text">{line.name}</span>
                    {line.confidence === "low" && (
                      <StatusPill tone="warning">low confidence</StatusPill>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-small text-text-secondary">
                      {formatQuantity(line.quantity, line.unit)}
                    </span>
                    <button
                      aria-label={`Edit ${line.name}`}
                      onClick={() => setEditingIndex(idx)}
                      className="flex size-8 cursor-pointer items-center justify-center rounded-[6px] text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-primary"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between gap-4 py-4">
            <p className="text-meta">
              {lines.filter((l) => l.included).length} of {lines.length} items
              selected
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPhase("upload")}>
                Back
              </Button>
              <Button
                variant="primary"
                disabled={lines.every((l) => !l.included)}
                onClick={() => void handleConfirm()}
              >
                Confirm {lines.filter((l) => l.included).length} items
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === "confirming" && (
        <div className="rounded-card border border-border bg-surface px-6 py-10 text-center">
          <p className="body-text font-medium">Committing state transitions to inventory…</p>
        </div>
      )}

      {phase === "confirmed" && (
        <div className="space-y-4">
          <div className="rounded-card border border-accent/25 bg-accent-subtle px-6 py-8 text-center">
            <Check size={22} strokeWidth={2} className="mx-auto text-accent" />
            <p className="mt-2 body-text font-medium">
              {added} items committed to canonical household state
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button
                variant="secondary"
                onClick={() => void navigate({ to: "/inventory" })}
              >
                Open kitchen
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setLines([]);
                  setTransitions([]);
                  setPhase("upload");
                }}
              >
                Scan another
              </Button>
            </div>
          </div>

          {transitions.length > 0 && (
            <div className="rounded-card border border-border bg-surface px-5 py-4">
              <p className="eyebrow">What changed in state</p>
              <div className="mt-2 divide-y divide-border">
                {transitions.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 py-2 text-small">
                    <span className="font-medium text-text-primary">{t.entityName}</span>
                    <span className="tabular-nums text-text-secondary">
                      {t.before} → <span className="font-medium text-accent">{t.after}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

