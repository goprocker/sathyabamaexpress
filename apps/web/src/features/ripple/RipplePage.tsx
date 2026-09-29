// Ripple view (Design System §15) — the signature interface.
// Thin connectors, small nodes, no glow. Columns follow event depth.
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, ErrorState, ListSkeleton } from "@/components/ui/primitives";
import { useRipple } from "@/hooks/queries";
import { biryaniWhy } from "@/mocks/data";
import type {
  RippleGraph,
  RippleNode,
  RippleNodeState,
} from "@/mocks/types";

export interface WhyData {
  summary: string;
  rows: Array<{ label: string; value: string }>;
  sources: string[];
}

const nodeStyles: Record<RippleNodeState, string> = {
  planned: "border-border-strong bg-surface",
  available: "border-border bg-surface",
  short: "border-danger/40 bg-danger-subtle",
  warning: "border-warning/40 bg-warning-subtle",
  proposed: "border-accent/40 bg-accent-subtle",
};

const dotStyles: Record<RippleNodeState, string> = {
  planned: "bg-text-tertiary",
  available: "bg-accent",
  short: "bg-danger",
  warning: "bg-warning",
  proposed: "bg-accent",
};

function Node({ node, onOpen }: { node: RippleNode; onOpen: (n: RippleNode) => void }) {
  return (
    <button
      onClick={() => onOpen(node)}
      className={`w-full cursor-pointer rounded-card border px-4 py-3 text-left transition-colors duration-150 ${nodeStyles[node.state]}`}
    >
      <span className="flex items-center gap-2">
        <span className={`size-1.5 shrink-0 rounded-full ${dotStyles[node.state]}`} />
        <span className="text-small font-medium text-text-primary">{node.label}</span>
      </span>
      {node.detail && (
        <span className="mt-0.5 block pl-3.5 text-meta">{node.detail}</span>
      )}
    </button>
  );
}

/** Vertical connector between depth columns. */
function Connector({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-1" aria-hidden>
      <span className="h-4 w-px bg-border-strong" />
      {label && <span className="my-0.5 text-meta">{label}</span>}
      <span className="h-4 w-px bg-border-strong" />
    </div>
  );
}

/** Depth-grouped ripple columns joined by thin connectors. */
export function RippleGraphView({
  graph,
  onOpenNode,
}: {
  graph: RippleGraph;
  onOpenNode: (n: RippleNode) => void;
}) {
  const byDepth = new Map<number, RippleNode[]>();
  for (const n of graph.nodes) {
    const list = byDepth.get(n.depth) ?? [];
    list.push(n);
    byDepth.set(n.depth, list);
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b);

  const edgeLabel = (from: string, to: string) =>
    graph.edges.find((e) => e.from === from && e.to === to)?.label ?? "";

  return (
    <div>
      {depths.map((depth, di) => {
        const nodes = byDepth.get(depth) ?? [];
        const prev = di > 0 ? (byDepth.get(depths[di - 1]!) ?? []) : [];
        const label =
          nodes.length === 1 && prev.length === 1
            ? edgeLabel(prev[0]!.id, nodes[0]!.id)
            : "";
        return (
          <div key={depth}>
            {di > 0 && <Connector label={label} />}
            <div
              className={
                nodes.length > 1
                  ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                  : "max-w-md"
              }
            >
              {nodes.map((n) => (
                <Node key={n.id} node={n} onOpen={onOpenNode} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── "Why?" explanation panel (Design System §16) ───────────────────────────

export function WhyPanel({
  open,
  title,
  why,
  onClose,
}: {
  open: boolean;
  title: string;
  why: WhyData | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/20"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Why: ${title}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Why?</p>
            <h2 className="mt-1 section-title">{title}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {why ? (
          <>
            <p className="mt-4 body-text text-text-secondary">{why.summary}</p>
            <div className="mt-5 rounded-card border border-border px-4 py-1">
              {why.rows.map((r, i) => (
                <div key={r.label}>
                  {i > 0 && <div className="border-t border-border" />}
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-small text-text-secondary">{r.label}</span>
                    <span className="text-small font-medium">{r.value}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 eyebrow">Sources</p>
            <ul className="mt-1 space-y-1">
              {why.sources.map((s) => (
                <li
                  key={s}
                  className="flex items-center gap-2 text-small text-text-secondary"
                >
                  <span className="size-1 rounded-full bg-text-tertiary" />
                  {s}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ListSkeleton rows={3} />
        )}
      </div>
    </div>
  );
}

function whyForNode(n: RippleNode | null): WhyData | null {
  if (!n) return null;
  if (n.whyEvidence) {
    return {
      summary: n.whyEvidence.headline,
      rows: [
        { label: "Required", value: n.whyEvidence.requiredDisplay },
        { label: "Available", value: n.whyEvidence.onHandDisplay },
        { label: "Difference", value: n.whyEvidence.deficitDisplay },
      ],
      sources: n.whyEvidence.sources,
    };
  }
  if (n.state === "short" || n.state === "proposed") return biryaniWhy;
  return {
    summary: `${n.label} is currently unaffected by this meal plan.`,
    rows: [
      { label: "Status", value: n.state },
      {
        label: "Depth",
        value: `${n.depth} step${n.depth === 1 ? "" : "s"} from event`,
      },
    ],
    sources: ["confirmed inventory", "meal plan"],
  };
}

function RippleContent({ eventId }: { eventId: string }) {
  const { data, isPending, isError, refetch } = useRipple(eventId);
  const [selected, setSelected] = useState<RippleNode | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending || !data) return <ListSkeleton rows={6} />;

  return (
    <>
      <RippleGraphView
        graph={data}
        onOpenNode={(n) => {
          setSelected(n);
          setWhyOpen(true);
        }}
      />
      <WhyPanel
        open={whyOpen}
        title={selected?.label ?? ""}
        why={whyForNode(selected)}
        onClose={() => setWhyOpen(false)}
      />
    </>
  );
}

export function RipplePage() {
  const eventId = "latest";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ripple"
        subtitle="What tomorrow's meal changes across your kitchen."
      />
      <RippleContent eventId={eventId} />
    </div>
  );
}
