import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { navGroups } from "./nav";
import { useLifeSearch } from "@/hooks/life";
import { useRecipes } from "@/hooks/queries";
import { MODULES, type ModuleId } from "@/lib/modules";

interface Hit {
  id: string;
  label: string;
  hint: string;
  group: string;
  module?: ModuleId;
  to: string;
}

const MAX = 24;

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const term = q.trim();
  const remote = useLifeSearch(term);
  const { data: recipes } = useRecipes();

  const goTo = useMemo<Hit[]>(() => {
    const hits: Hit[] = [];
    for (const g of navGroups)
      for (const i of g.items)
        hits.push({ id: `nav:${g.title}:${i.to}`, label: i.label, hint: i.hint, group: "Go to", to: i.to });
    return hits;
  }, []);

  const results = useMemo(() => {
    const lower = term.toLowerCase();
    if (!lower) return goTo.slice(0, 8);
    const nav = goTo.filter((h) => `${h.label} ${h.hint}`.toLowerCase().includes(lower));
    const data: Hit[] = (remote.data ?? []).map((h) => ({ ...h }));
    const rc: Hit[] = (recipes ?? [])
      .filter((r) => r.name.toLowerCase().includes(lower))
      .map((r) => ({ id: `rc:${r.id}`, label: r.name, hint: "Recipe", group: "Recipes", module: "kitchen" as ModuleId, to: "/recipes" }));
    return [...nav, ...data, ...rc].slice(0, MAX);
  }, [goTo, remote.data, recipes, term]);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setCursor(0), [q]);

  if (!open) return null;

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    onClose();
    void navigate({ to: hit.to });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      go(results[cursor]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search everything"
    >
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 bg-text-primary/25 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="glass relative w-full max-w-[640px] rounded-[32px] p-3"
        style={{ animation: "menuIn 200ms var(--ease-out) both", background: "var(--color-surface-elevated)" }}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-3 rounded-full bg-surface px-5">
          <Search size={18} strokeWidth={1.5} className="text-text-tertiary" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search bills, groceries, outfits, chargers…"
            aria-label="Search"
            className="h-14 w-full bg-transparent text-[17px] tracking-[-0.01em] outline-none placeholder:text-text-tertiary"
          />
          <kbd className="mono-label rounded-md bg-surface-elevated px-1.5 py-0.5">esc</kbd>
        </div>
        <ul className="mt-2 max-h-[52vh] overflow-y-auto" role="listbox">
          {results.length === 0 && (
            <li className="px-4 py-8 text-center text-[15px] text-text-secondary">Nothing matches “{q}”.</li>
          )}
          {results.map((h, i) => {
            const header = h.group !== lastGroup;
            lastGroup = h.group;
            const mod = h.module ? MODULES[h.module] : null;
            return (
              <li key={h.id} role="option" aria-selected={i === cursor}>
                {header && <p className="mono-label px-4 pb-1 pt-3">{h.group}</p>}
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(h)}
                  className={`flex min-h-[48px] w-full items-center gap-3 rounded-[20px] px-4 py-2 text-left transition-colors duration-[120ms] ${
                    i === cursor ? "bg-accent-subtle" : ""
                  }`}
                >
                  {mod && <span aria-hidden className={`size-2 shrink-0 rounded-full ${mod.dot}`} />}
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] leading-tight tracking-[-0.02em]">{h.label}</span>
                    <span className="block truncate text-[13px] text-text-tertiary">{h.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
