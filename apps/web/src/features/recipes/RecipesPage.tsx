import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Search,
  Clock,
  ChefHat,
  Sparkles,
  ShoppingCart,
  Check,
  AlertCircle,
  Filter,
} from "lucide-react";
import { useRecipes, useInventory } from "@/hooks/queries";
import { recipes as seedRecipes, inventory as seedInventory } from "@/mocks/data";
import type { Recipe } from "@/mocks/types";

type DifficultyFilter = "all" | "easy" | "medium" | "hard";
type AvailabilityFilter = "all" | "can-make" | "missing";

function difficultyBadge(d?: string) {
  switch (d) {
    case "easy": return { text: "Easy", cls: "bg-[var(--color-success-bg)] text-[var(--color-success)]" };
    case "medium": return { text: "Medium", cls: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]" };
    case "hard": return { text: "Hard", cls: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]" };
    default: return { text: "Easy", cls: "bg-[var(--color-success-bg)] text-[var(--color-success)]" };
  }
}

function RecipeCard({ recipe, pantryItems }: { recipe: Recipe; pantryItems: typeof seedInventory }) {
  const totalTime = (recipe.prepTime ?? 15) + (recipe.cookTime ?? 20);
  const diff = difficultyBadge(recipe.difficulty);

  // Check ingredient availability
  const ingredientStatus = recipe.ingredients.map((ing) => {
    const pantryItem = pantryItems.find((p) => p.id === ing.itemId);
    const available = pantryItem?.quantity ?? 0;
    const needed = ing.quantityPerServing * 4; // for 4 servings
    return {
      ...ing,
      available,
      needed,
      hasEnough: available >= needed,
    };
  });

  const missingCount = ingredientStatus.filter((i) => !i.hasEnough).length;
  const canMake = missingCount === 0;

  return (
    <div className="card-interactive p-0 overflow-hidden group">
      {/* Recipe Image Placeholder */}
      <div className="relative h-36 bg-[var(--color-surface-subtle)] flex items-center justify-center overflow-hidden">
        <span className="text-[48px] transition-transform duration-[280ms] group-hover:scale-110">
          {recipe.emoji ?? "🍽️"}
        </span>
        <div className="absolute top-2.5 right-2.5 flex gap-1.5">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${diff.cls}`}>
            {diff.text}
          </span>
        </div>
        {canMake && (
          <div className="absolute top-2.5 left-2.5">
            <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-success-bg)] text-[var(--color-success)]">
              <Check size={10} /> Ready
            </span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)] tracking-[-0.01em]">
            {recipe.name}
          </h3>
          <p className="text-[12px] text-[var(--color-text-tertiary)] mt-0.5">
            {recipe.cuisine}
            {recipe.tags && recipe.tags.length > 0 && ` · ${recipe.tags[0]}`}
          </p>
        </div>

        <div className="flex items-center gap-3 text-[12px] text-[var(--color-text-secondary)]">
          <span className="flex items-center gap-1">
            <Clock size={12} strokeWidth={1.75} />
            {totalTime} min
          </span>
          <span className="flex items-center gap-1">
            <ChefHat size={12} strokeWidth={1.75} />
            {recipe.servings} serving
          </span>
        </div>

        {/* Ingredient availability */}
        <div className="space-y-1.5">
          {ingredientStatus.slice(0, 3).map((ing) => (
            <div key={ing.itemId} className="flex items-center justify-between text-[12px]">
              <span className="text-[var(--color-text-secondary)]">{ing.name}</span>
              <span className={`flex items-center gap-1 font-medium ${
                ing.hasEnough ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
              }`}>
                {ing.hasEnough ? (
                  <><Check size={11} /> In stock</>
                ) : (
                  <><AlertCircle size={11} /> Need {(ing.needed - ing.available).toFixed(1)} {ing.unit}</>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* Action */}
        <div className="flex gap-2 pt-1">
          {canMake ? (
            <Link to="/meals" className="btn-primary w-full text-[12px] py-2 min-h-0 justify-center">
              Cook This
            </Link>
          ) : (
            <Link to="/cart" className="btn-secondary w-full text-[12px] py-2 min-h-0 justify-center gap-1.5">
              <ShoppingCart size={13} />
              Add {missingCount} missing
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function RecipesPage() {
  const { data: recipesData } = useRecipes();
  const { data: inventoryData } = useInventory();
  const recipes = recipesData ?? seedRecipes;
  const pantryItems = inventoryData ?? seedInventory;

  const [search, setSearch] = useState("");
  const [diffFilter, setDiffFilter] = useState<DifficultyFilter>("all");
  const [availFilter, setAvailFilter] = useState<AvailabilityFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = recipes.filter((r) => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (diffFilter !== "all" && r.difficulty !== diffFilter) return false;
    if (availFilter === "can-make" && r.canMakeNow === false) return false;
    if (availFilter === "missing" && r.canMakeNow !== false) return false;
    return true;
  });

  const canMakeCount = recipes.filter((r) => r.canMakeNow).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="fade-in-up stagger-1">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={18} className="text-[var(--color-accent)]" />
          <h1 className="page-title">AI Recipes</h1>
        </div>
        <p className="text-[13px] text-[var(--color-text-secondary)]">
          {canMakeCount} recipes you can cook right now from your pantry
        </p>
      </header>

      {/* Search + Filter */}
      <div className="flex gap-2 fade-in-up stagger-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-9 pr-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[14px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:ring-0 outline-none transition-colors duration-[150ms]"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn-secondary h-11 w-11 p-0 shrink-0 ${showFilters ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)]" : ""}`}
          aria-label="Toggle filters"
        >
          <Filter size={16} />
        </button>
      </div>

      {/* Filter pills */}
      {showFilters && (
        <div className="space-y-3 fade-in-up">
          <div>
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] tracking-[0.06em] uppercase mb-2">Difficulty</p>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "easy", "medium", "hard"] as DifficultyFilter[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDiffFilter(d)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-[150ms] ${
                    diffFilter === d
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                  }`}
                >
                  {d === "all" ? "All" : d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] tracking-[0.06em] uppercase mb-2">Availability</p>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "can-make", "missing"] as AvailabilityFilter[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAvailFilter(a)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-[150ms] ${
                    availFilter === a
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                  }`}
                >
                  {a === "all" ? "All" : a === "can-make" ? "Can Cook Now" : "Need Items"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recipes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 fade-in-up stagger-3">
        {filtered.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} pantryItems={pantryItems} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ChefHat size={40} className="text-[var(--color-text-tertiary)] mb-3" strokeWidth={1.25} />
          <p className="text-[15px] font-medium text-[var(--color-text-secondary)]">No recipes found</p>
          <p className="text-[13px] text-[var(--color-text-tertiary)] mt-1">Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
}
