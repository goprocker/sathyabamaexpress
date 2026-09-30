import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearch } from "@tanstack/react-router";
import { AlertCircle, Check, ChefHat, Clock, Package, Search, ShoppingCart, Users, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { usePrepareRecipe, useRecipeCatalog } from "@/hooks/life";
import type { CatalogRecipeView } from "@/lib/lifeApi";

type Region = "All" | CatalogRecipeView["region"];
type Course = "All" | CatalogRecipeView["course"];

const REGIONS: Region[] = ["All", "South Indian", "North Indian", "Pan-Indian"];
const COURSES: Course[] = ["All", "Breakfast", "Main", "Rice", "Snack", "Side", "Dessert"];

const DIFFICULTY_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[36px] rounded-full px-3.5 text-[13px] font-medium transition-colors duration-[150ms] ${
        active
          ? "bg-[var(--color-accent)] text-white"
          : "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
      }`}
    >
      {children}
    </button>
  );
}

function RecipeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-[var(--color-surface-subtle)] ${className ?? ""}`}>
        <ChefHat size={32} strokeWidth={1.25} className="text-[var(--color-text-tertiary)]" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`bg-[var(--color-surface-subtle)] object-cover ${className ?? ""}`}
    />
  );
}

function RecipeCard({ recipe, onOpen }: { recipe: CatalogRecipeView; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="card-interactive group overflow-hidden p-0 text-left">
      <div className="relative h-40 overflow-hidden">
        <RecipeImage
          src={recipe.image}
          alt={recipe.name}
          className="h-full w-full transition-transform duration-[220ms] group-hover:scale-[1.03]"
        />
        <span
          className={`absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            recipe.veg
              ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
              : "bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
          }`}
        >
          {recipe.veg ? "Veg" : "Non-veg"}
        </span>
        {recipe.canMakeNow && (
          <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-[var(--color-success-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-success)]">
            <Check size={11} /> Ready
          </span>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">{recipe.name}</h3>
          <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">
            {recipe.region} · {recipe.course}
          </p>
        </div>
        <p className="line-clamp-2 text-[13px] text-[var(--color-text-secondary)]">{recipe.blurb}</p>
        <div className="flex items-center gap-3 text-[12px] text-[var(--color-text-secondary)]">
          <span className="flex items-center gap-1">
            <Clock size={12} strokeWidth={1.75} />
            {recipe.prepMin + recipe.cookMin} min
          </span>
          <span>{DIFFICULTY_LABEL[recipe.difficulty]}</span>
          {!recipe.canMakeNow && (
            <span className="ml-auto flex items-center gap-1 text-[var(--color-danger)]">
              <AlertCircle size={12} /> {recipe.missing.length} missing
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function RecipeDialog({ recipe, onClose }: { recipe: CatalogRecipeView; onClose: () => void }) {
  const prepare = usePrepareRecipe();
  // One key per dialog visit: a double tap or retry can never deduct stock twice.
  const keyRef = useRef(`prep_${recipe.id}_${Date.now()}`);
  const [error, setError] = useState<string | null>(null);
  const prepared = prepare.data ?? null;

  const onPrepare = (allowPartial: boolean) => {
    setError(null);
    prepare.mutate(
      { id: recipe.id, servings: recipe.servings, allowPartial, idempotencyKey: keyRef.current },
      { onError: (e) => setError(e instanceof Error ? e.message : "Could not prepare this recipe.") },
    );
  };
  const preparing = prepare.isPending;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Portalled to <body>: the page wrapper is animated (transformed), which would otherwise
  // trap `position: fixed` inside it and push the sheet off-screen behind the nav bars.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={recipe.name}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92vh] w-full max-w-[640px] overflow-y-auto rounded-t-[12px] bg-[var(--color-background)] shadow-lg sm:rounded-[12px]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close recipe"
          className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full bg-[var(--color-background)] hover:bg-[var(--color-border)]"
        >
          <X size={18} />
        </button>
        <RecipeImage src={recipe.image} alt={recipe.name} className="h-56 w-full sm:rounded-t-[12px]" />
        <div className="space-y-5 p-5">
          <header>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">{recipe.name}</h2>
            <p className="mt-1 text-[14px] text-[var(--color-text-secondary)]">{recipe.blurb}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--color-text-secondary)]">
              <span className="flex items-center gap-1"><Clock size={14} /> Prep {recipe.prepMin} min</span>
              <span className="flex items-center gap-1"><Clock size={14} /> Cook {recipe.cookMin} min</span>
              <span className="flex items-center gap-1"><Users size={14} /> Serves {recipe.servings}</span>
              <span>{DIFFICULTY_LABEL[recipe.difficulty]}</span>
            </div>
          </header>

          <section aria-labelledby="ing-h">
            <h3 id="ing-h" className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
              Ingredients · what you have
            </h3>
            <ul className="divide-y divide-[var(--color-border)] rounded-[8px] border border-[var(--color-border)]">
              {recipe.ingredients.map((ing) => (
                <li key={ing.name} className="flex items-center justify-between gap-3 px-3 py-2 text-[14px]">
                  <span>{ing.name}</span>
                  <span className="flex items-center gap-3 text-right">
                    <span className="text-[var(--color-text-secondary)]">
                      {ing.quantity} {ing.unit}
                    </span>
                    {ing.tracked &&
                      (ing.enough ? (
                        <span className="flex items-center gap-1 text-[12px] font-medium text-[var(--color-success)]">
                          <Check size={12} />
                          {ing.available != null ? `Have ${ing.available} ${ing.unit}` : "In stock"}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[12px] font-medium text-[var(--color-danger)]">
                          <AlertCircle size={12} />
                          {ing.available ? `Short ${ing.shortBy} ${ing.unit}` : "Not in stock"}
                        </span>
                      ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="steps-h">
            <h3 id="steps-h" className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
              Method
            </h3>
            <ol className="space-y-3">
              {recipe.steps.map((step, i) => (
                <li key={step} className="flex gap-3 text-[14px] leading-relaxed">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-subtle)] text-[12px] font-medium text-[var(--color-accent)]">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>

          {prepared ? (
            <div role="status" className="space-y-2 rounded-[8px] bg-[var(--color-success-bg)] p-4 text-[14px]">
              <p className="flex items-center gap-2 font-medium text-[var(--color-success)]">
                <Check size={16} /> {prepared.recipe} prepared. Inventory updated.
              </p>
              {prepared.consumed.length > 0 && (
                <p className="text-[var(--color-text-secondary)]">
                  Used {prepared.consumed.map((c) => `${c.formatted} ${c.name}`).join(", ")}.
                </p>
              )}
              {prepared.shortfalls.length > 0 && (
                <p className="text-[var(--color-danger)]">Short on {prepared.shortfalls.map((s) => s.name).join(", ")}.</p>
              )}
              <Link to="/inventory" className="btn-secondary mt-1 inline-flex gap-1.5">
                <Package size={15} /> View inventory
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {error && (
                <p role="alert" className="text-[13px] text-[var(--color-danger)]">
                  {error}
                </p>
              )}
              {recipe.canMakeNow ? (
                <button type="button" onClick={() => onPrepare(false)} disabled={preparing} className="btn-primary w-full justify-center disabled:opacity-60">
                  <ChefHat size={16} />
                  {preparing ? "Preparing…" : `Prepare this recipe (${recipe.servings} servings)`}
                </button>
              ) : (
                <>
                  <p className="text-[13px] text-[var(--color-text-secondary)]">
                    Missing: {recipe.missing.join(", ")}.
                  </p>
                  <Link to="/cart" className="btn-primary w-full justify-center gap-1.5">
                    <ShoppingCart size={15} />
                    Add {recipe.missing.length} missing to cart
                  </Link>
                  <button type="button" onClick={() => onPrepare(true)} disabled={preparing} className="btn-secondary w-full justify-center disabled:opacity-60">
                    {preparing ? "Preparing…" : "Prepare with what I have"}
                  </button>
                </>
              )}
            </div>
          )}
          <p className="text-[11px] text-[var(--color-text-tertiary)]">Photo: Wikimedia Commons, freely licensed.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function RecipesPage() {
  const openParam = useSearch({ strict: false }) as { open?: string };
  const [servings, setServings] = useState(4);
  const { data, isLoading, isError, refetch } = useRecipeCatalog(servings);
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState<Region>("All");
  const [course, setCourse] = useState<Course>("All");
  const [vegOnly, setVegOnly] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(openParam.open ?? null);

  const recipes = data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.blurb.toLowerCase().includes(q)) return false;
      if (region !== "All" && r.region !== region) return false;
      if (course !== "All" && r.course !== course) return false;
      if (vegOnly && !r.veg) return false;
      if (readyOnly && !r.canMakeNow) return false;
      return true;
    });
  }, [recipes, search, region, course, vegOnly, readyOnly]);

  const open = recipes.find((r) => r.id === openId) ?? null;
  const readyCount = recipes.filter((r) => r.canMakeNow).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kitchen"
        title="Indian recipes"
        subtitle={
          data
            ? `${recipes.length} South Indian and pan-Indian recipes. ${readyCount} you can cook from your pantry now.`
            : "South Indian and pan-Indian recipes matched against your pantry."
        }
      />

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
        <label htmlFor="recipe-search" className="sr-only">Search recipes</label>
        <input
          id="recipe-search"
          type="search"
          placeholder="Search dosa, biryani, paneer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-4 text-[14px] text-[var(--color-text-primary)] outline-none transition-colors duration-[150ms] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)]"
        />
      </div>

      <div className="space-y-2.5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Region">
          {REGIONS.map((r) => (
            <Chip key={r} active={region === r} onClick={() => setRegion(r)}>{r === "All" ? "All regions" : r}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Course">
          {COURSES.map((c) => (
            <Chip key={c} active={course === c} onClick={() => setCourse(c)}>{c === "All" ? "All courses" : c}</Chip>
          ))}
          <Chip active={vegOnly} onClick={() => setVegOnly((v) => !v)}>Veg only</Chip>
          <Chip active={readyOnly} onClick={() => setReadyOnly((v) => !v)}>Can cook now</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Cooking for">
          <span className="mr-1 text-[13px] text-[var(--color-text-secondary)]">Cooking for</span>
          {[1, 2, 4, 6, 8].map((n) => (
            <Chip key={n} active={servings === n} onClick={() => setServings(n)}>{n}</Chip>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading recipes">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-[12px] bg-[var(--color-surface-subtle)]" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle size={32} strokeWidth={1.25} className="text-[var(--color-text-tertiary)]" />
          <p className="text-[15px] font-medium text-[var(--color-text-secondary)]">Couldn't load recipes</p>
          <button type="button" onClick={() => void refetch()} className="btn-secondary">Try again</button>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <RecipeCard key={r.id} recipe={r} onOpen={() => setOpenId(r.id)} />
          ))}
        </div>
      )}

      {data && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ChefHat size={40} strokeWidth={1.25} className="mb-3 text-[var(--color-text-tertiary)]" />
          <p className="text-[15px] font-medium text-[var(--color-text-secondary)]">No recipes match</p>
          <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Try a different search or clear a filter.</p>
        </div>
      )}

      {open && <RecipeDialog recipe={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
